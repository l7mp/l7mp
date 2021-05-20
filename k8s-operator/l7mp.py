# l7mp.py: A kopf operator for l7mp custom resources

# Copyright 2020 by its authors.
# Some rights reserved. See AUTHORS.
#
# Permission is hereby granted, free of charge, to any person
# obtaining a copy of this software and associated documentation files
# (the 'Software'), to deal in the Software without restriction,
# including without limitation the rights to use, copy, modify, merge,
# publish, distribute, sublicense, and/or sell copies of the Software,
# and to permit persons to whom the Software is furnished to do so,
# subject to the following conditions:
#
# The above copyright notice and this permission notice shall be
# included in all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
# NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY
# CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
# TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

# python3.7 ~/kopf/kopf run --peering=operator.l7mp.io --namespace=default ./l7mp.py --verbose
# version: 0.2.2

import asyncio
import collections.abc
import functools
import itertools
import json
import os
import urllib3
import yaml
from copy import deepcopy
from collections import defaultdict

import kopf
import l7mp_client
from kopf.structs.diffs import diff

import grpc
import google.protobuf as protobuf
import logging
import numpy as np
import threading
import asyncio
from concurrent import futures
from pprint import pp, pprint

import envoy
import envoy.service.listener.v3.lds_pb2_grpc as envoy_lds
import envoy.service.cluster.v3.cds_pb2_grpc as envoy_cds
import envoy.extensions.filters.udp.udp_proxy.v3.udp_proxy_pb2 as envoy_udp
import envoy.config.listener.v3.listener_pb2 as envoy_listener
import envoy.config.listener.v3.listener_components_pb2 as envoy_listener_components 
import envoy.service.discovery.v3.discovery_pb2 as envoy_discovery
import envoy.config.core.v3.address_pb2 as envoy_address

# State of the k8s cluster
s = {
    'pods': defaultdict(dict),
    'endpoints': defaultdict(dict),
    'virtualservices': defaultdict(dict),
    'targets': defaultdict(dict),
    'rules': defaultdict(dict),
}

envoy_listener_template = {
    'envoy_instance_node': str, # envoy instance node field should equal its pod's metadata.uid
    'envoy_instance_type': str, #ingress, sidecar, etc
    'name': str, # call-id_3002-3004_rtp_a_listener
    'call-id': str, # 3002-3004
    'listening_port': np.uint32, #18002
    'cluster': str, # call-id_3002-3004_rtp_a_cluster
}

envoy_cluster_template = {
    'name': str, # call-id_3002-3004_rtp_a_cluster
    'upstream_port': np.uint32, #18000
    'upstream_host': str,
}

envoy_resources = {
    'listeners': defaultdict(dict),
    'clusters': defaultdict(dict),
}


# https://stackoverflow.com/a/3233356
def dict_update(d, u):
    for k, v in u.items():
        if isinstance(v, collections.abc.Mapping):
            d[k] = dict_update(d.get(k, {}), v)
        else:
            d[k] = v
    return d

def get_fqn(obj):
    "Get a name unambiguously identifying the object OBJ."
    apiVersion = obj['apiVersion']
    kind = obj['kind']
    namespace = obj['metadata']['namespace']
    name = obj['metadata']['name']
    return (f'/{apiVersion}/{kind}/{namespace}/{name}')

def get_l7mp_instance(pod):
    # cache the instance?

    pod_ip = pod['status'].get('podIP')
    pname = pod['metadata']['name']
    if not pod_ip:
        raise kopf.TemporaryError(f'no pod_ip for {pname}', delay=4)
    host = f'http://{pod_ip}:1234'
    l7mp_conf = l7mp_client.Configuration(host=host)
    l7mp_api = l7mp_client.ApiClient(configuration=l7mp_conf)
    return l7mp_client.DefaultApi(l7mp_api)

def get_target_extended_spec(s, target, logger):
    """Return target's spec extended with linked elements.

    That is extend spec.endpoints with the selector of the
    linkedVirtualService, and set spec.cluster.spec to spec.listener
    of the linkedVirtualService.

    """
    spec = deepcopy(target['spec'])
    # 1. Find the linked VirtualService
    try:
        vsvc_name = spec['linkedVirtualService']
    except KeyError:
        return spec
    del spec['linkedVirtualService']
    vsvc = s['virtualservices'].get(vsvc_name)
    if not vsvc:
        for v in s['virtualservices'].values():
            if v['metadata']['name'] == vsvc_name:
                vsvc = v
                break
    if not vsvc:
        return {}

    # 2.
    spec['cluster'] = spec.get('cluster', {})
    eps = spec['cluster'].get('endpoints', [])
    new_ep = vsvc['spec'].get('selector', [])
    if new_ep:
        eps.append({'selector': new_ep})
        spec['cluster'].update({'endpoints': eps})

    # 3.
    spec['cluster']['spec'] = vsvc['spec']['listener'].get('spec', {})

    # 4.
    return spec

def get_endpoint_groups(s, target, logger):
    try:
        endpoints = target['spec']['cluster']['endpoints']
    except KeyError:
        return ([], {})
    dynamic_eps = {}
    static_eps = []
    for ep in endpoints:
        logger.debug('endpoint: %s', ep)
        if 'spec' in ep:
            static_eps.append(ep)
        elif 'selector' in ep:
            for pod in iter_matching_pods(s, ep['selector'], s['pods']):
                pod_ip = pod['status'].get('podIP')
                if not pod_ip:
                    continue
                name = f'{get_fqn(target)}/{pod_ip}'
                dynamic_eps[name] = {
                    'metadata': {'name': name},
                    'spec': {'address': pod_ip},
                }
        else:
            # This should have been catched by schema verification
            # earlier.
            logger.warning(f'Unknown endpoint spec: {ep}')

    return static_eps, dynamic_eps

def get_actions(s, logger):
    "Return a list of actions that are necessary to execute to reach state S"
    actions = defaultdict(dict)
    for pod in s['pods'].values():
        for vsvc in iter_matching(s, s['virtualservices'], pod):
            actions[get_fqn(pod)][get_fqn(vsvc)] = {
                 'type': 'vsvc',
                 'name': get_fqn(vsvc),
                 'spec': vsvc['spec'],
            }
        for target in s['targets'].values():
            spec = get_target_extended_spec(s, target, logger)
            if not spec:
                continue
            selector = spec['selector']
            if not does_selector_match(s, selector, pod):
                continue
            etarget = dict(deepcopy(target))
            etarget['spec'] = spec

            s_eps, d_eps = get_endpoint_groups(s, etarget, logger)
            etarget['spec']['cluster']['endpoints'] = s_eps
            fqn_etarget = get_fqn(etarget)
            actions[get_fqn(pod)][fqn_etarget] = {
                 'type': 'target',
                 'name': get_fqn(etarget),
                 'spec': etarget['spec'],
            }
            for d_ep in d_eps.values():
                ep_name = d_ep['metadata']['name']
                actions[get_fqn(pod)][f'ep_{ep_name}'] = {
                    'type': 'dynamic_endpoint',
                    'name': ep_name,
                    'spec': d_ep['spec'],
                    'target': fqn_etarget,
                }
        for rule in iter_matching(s, s['rules'], pod):
            actions[get_fqn(pod)][get_fqn(rule)] = {
                 'type': 'rule',
                 'name': get_fqn(rule),
                 'spec': rule['spec'],
            }


    return actions

async def update(s_old, s_new, logger=None, **kw):
    a_old = get_actions(s_old, logger)
    a_new = get_actions(s, logger)

    # Create combined dict
    a_combined = {}
    for pod_fqn in set(itertools.chain(a_old.keys(), a_new.keys())):
        obj_fqns = itertools.chain(a_old.get(pod_fqn, {}).keys(),
                                   a_new.get(pod_fqn, {}).keys())
        a_combined[pod_fqn] = sorted(set(obj_fqns))

    fns = {}
    for pod_fqn, obj_fqns in a_combined.items():
        for fqn in obj_fqns:
            logger.debug(f'pod:{pod_fqn} obj_fqn:{fqn}')
            action_old = a_old.get(pod_fqn, {}).get(fqn, {})
            action_new = a_new.get(pod_fqn, {}).get(fqn, {})
            a_type = action_new.get('type', action_old.get('type', None))
            a_name = action_new.get('name', action_old.get('name', ''))
            cmd = None
            if action_old == action_new:
                #logger.info(f'no change {obj_type}/{fqn} on pod/{pod_fqn}')
                pass
            elif not action_old and action_new:
                logger.debug(f'add {a_type}{fqn} on pod:{pod_fqn}')
                cmd = 'add'
            elif action_old and not action_new:
                logger.debug(f'del {a_type}/{fqn} on pod:{pod_fqn}')
                cmd = 'delete'
            elif action_old and action_new:
                logger.debug(f'cng {a_type}/{fqn} on pod:{pod_fqn}')
                cmd = 'change'
            else:
                raise kopf.PermanentError('???')
            if cmd:
                id = f'{pod_fqn}/{a_type}/{a_name}'
                fns[id] = functools.partial(call,
                                            fn_name=f'exec_{cmd}_{a_type}',
                                            s=s_new,
                                            pod_fqn=pod_fqn,
                                            action_old=action_old,
                                            action_new=action_new,
                                            logger=logger)
    await kopf.execute(fns=fns)

async def call(fn_name, s, pod_fqn, action_old, action_new, logger, **kw):
    pod = s['pods'].get(pod_fqn)
    if pod:
        await globals()[fn_name](s, pod, action_old, action_new, logger)

async def set_owner_status(s, o_type, fqn, logger):
    try:
        obj = s[o_type][fqn]
        metadata = obj['metadata']
        generation = metadata['generation']
        updateOwners = obj['spec']['updateOwners']
    except KeyError:
        return
    if not generation or (updateOwners != True):
        return
    for owner in metadata.get('ownerReferences', []):
        # "Cross-namespace owner references are disallowed by design."
        resource = kopf.structs.references.Resource(
            group=owner['apiVersion'].split('/')[0],
            version=owner['apiVersion'].split('/', 1)[1],
            plural=owner['kind'].lower() + 's', # ?
            namespaced=True,
            subresources=['status'],
        )
        await kopf.clients.patching.patch_obj(
            resource=resource,
            namespace=metadata['namespace'],
            name=owner['name'],
            patch={'status': {'children': {'applied': {fqn: generation}}}},
        )

conv_db = {}
def get_conv_db(logger):
    if conv_db:
        return conv_db

    with open(os.path.join(os.path.dirname(__file__), 'conv.yml')) as f:
        for doc in yaml.safe_load_all(f):
            plural = doc.get('spec', {}).get('names', {}).get('plural')
            versions = doc.get('spec', {}).get('versions', [])
            if len(versions) != 1:
                logger.error(f'conversion to old {plural} is failed: %s',
                             'len(versions) != 1')
            conv_db[plural] = versions[0]['schema']['openAPIV3Schema']
    return conv_db

def convert_to_old_api(logger, plural, obj):
    # Currently, the l7mp proxy uses an old OpenApi schema for
    # validation.  That schema is not compatible with k8s OpenApi:
    # https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#specifying-a-structural-schema
    # So, this function converts object conforming to the new Api back
    # to the old one.
    schema = get_conv_db(logger)[plural]
    logger.info('Need to get important fields from this obj %s', obj)
    _, obj =  convert_sub(schema['properties']['spec'], 'all', deepcopy(obj))
    logger.info('new obj: %s', obj)
    return obj

def convert_for_envoy(logger, plural, obj):
    '''
    Converted listener should look like this:
    {'listener': {'rules': [{
        'action': {
            'rewrite': [{
                'path': 'HTTP/headers/', 
                'value': {
                    'place-holder': 'place-holder'
                    }}],
     'route': {
         'destination': '/l7mp.io/v1/Target/default/ingress-controller-target'
         }}}],
     'spec': {
         'port': 22222, 
         'protocol': 'UDP'
         }}, 
     'selector': {'matchLabels': {'app': 'l7mp-ingress'}}, 
     'updateOwners': False}
    '''
    schema = get_conv_db(logger)[plural]
    _, obj =  convert_sub(schema['properties']['spec'], 'all', deepcopy(obj))
    logger.info('Need to get important fields from this obj %s', obj)
    if obj ['listener']:
        listener_port = obj['listener']['spec']['port']

def convert_sub(schema, key, obj):
    if obj is None:
        return key, obj
    if schema.get('properties'):
        for k, v in schema['properties'].items():
            if not k.startswith('x-l7mp-old'):
                k1, v1 = convert_sub(v, k, obj.get(k))
                if v1:
                    obj[k1] = v1
                if k1 != k:
                    del obj[k]
    if schema.get('items'):
        return key, [convert_sub(schema['items'], '_', item)[1] for item in obj]
    key = schema.get('x-l7mp-old-name') or key
    # if schema.get('x-l7mp-old-conversion'):
    #     obj = globals()['conv_' + schema['x-l7mp-old-conversion']](obj)
    if schema.get('x-l7mp-old-remove-level'):
        subkey = next(iter(obj))
        obj = obj[subkey]
    if schema.get('x-l7mp-old-property'):
        subkey = next(iter(obj))
        obj = obj[subkey]
        obj[schema['x-l7mp-old-property']] = subkey
    return key, obj

async def exec_add_vsvc(s, pod, _old, action, logger):
    vname = action['name']
    pname = pod['metadata']['name']
    vsvc_spec = action['spec']
    vsvc_spec = convert_to_old_api(logger, 'virtualservices', vsvc_spec)
    logger.info(f'configuring pod:{pname} for vsvc:{vname}')
    printer = pprint.PrettyPrinter(depth=1)

    printer.pprint(action)

    l7mp_instance = get_l7mp_instance(pod)

    printer.pprint(l7mp_instance)
    printer.pprint(vsvc_spec.get('listener', {}).get('spec'))

    listener = l7mp_client.IoL7mpApiV1Listener(
        name=vname,
        spec=vsvc_spec.get('listener', {}).get('spec'),
        rules=vsvc_spec.get('listener', {}).get('rules'))
    request = l7mp_client.IoL7mpApiV1ListenerRequest(listener=listener)
    logger.debug(f'request: {request}')
    try:
        l7mp_instance.add_listener(request)
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        if e.status == 400 and content.endswith(' already defined'):
            # FIXME: cannot update, so this will be ok for now.
            logger.warning('already defined')
        else:
            logger.warning(f'request: {request}')
            raise e
    except urllib3.exceptions.MaxRetryError as e:
        raise kopf.TemporaryError(f'{e}', delay=5)
    await set_owner_status(s, 'virtualservices', vname, logger)


async def exec_delete_vsvc(s, pod, action, _new, logger):
    fqn = action['name']
    if not pod or get_fqn(pod) not in s['pods']:
        logger.info('pod not found: {get_fqn(pod)}')
        return
    l7mp_instance = get_l7mp_instance(pod)
    logger.info(f'Delete vsvc:{fqn} from pod:{pod["metadata"]["name"]}')
    try:
        l7mp_instance.delete_listener(fqn, recursive="true")
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        not_found = 'Cannot delete listener: Unknown listener'
        if e.status == 400 and content.startswith(not_found):
            logger.info("... it's not there")
        if e.status == 400 and content.startswith('Not running'):
            logger.info("... ??? Not running ???")
            # This is a bug (?) in l7mp, but the deletion is successful.
        else:
            logger.warn('Failed to delete vsvc on pod %s: %s',
                        pod['metadata']['name'],
                        e)

async def exec_change_vsvc(s, pod, action_old, action_new, logger):
    # The l7mp API does not really support changing listeners, so we
    # delete the old listener and add the new one.  But as a
    # side-effect, the derived objects (connections) will be ereased.
    await exec_delete_vsvc(s, pod, action_old, action_new, logger)
    await exec_add_vsvc(s, pod, action_old, action_new, logger)

async def exec_add_target(s, pod, _old, action, logger):
    tname = action['name']
    pname = pod['metadata']['name']
    tspec = action['spec']
    tspec = convert_to_old_api(logger, 'targets', tspec)
    logger.info(f'configuring pod:{pname} for target:{tname}')

    l7mp_instance = get_l7mp_instance(pod)

    cluster = deepcopy(tspec['cluster'])
    cluster['name'] = tname

    cluster_obj = l7mp_client.IoL7mpApiV1Cluster(**cluster)
    request = l7mp_client.IoL7mpApiV1ClusterRequest(cluster=cluster)
    try:
        l7mp_instance.add_cluster(request)
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        if e.status == 400 and content.endswith(' already defined'):
            # FIXME: cannot update, so this will be ok for now.
            logger.warning('already defined',)
        else:
            logger.warning(f"request:\n{request}")
            raise e
    except urllib3.exceptions.MaxRetryError as e:
        raise kopf.TemporaryError(f'{e}', delay=5)
    await set_owner_status(s, 'targets', tname, logger)

async def exec_delete_target(s, pod, action, _new, logger):
    fqn = action['name']
    if not pod or get_fqn(pod) not in s['pods']:
        logger.info('pod not found: {get_fqn(pod)}')
        return
    l7mp_instance = get_l7mp_instance(pod)
    logger.info(f'Delete target:{fqn} from pod:%s', pod['metadata']['name'])
    try:
        l7mp_instance.delete_cluster(fqn, recursive="true")
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        not_found = 'Cannot delete cluster: Unknown cluster'
        if e.status == 400 and content.startswith(not_found):
            logger.info("... it's not there")
        else:
            logger.warn('Failed to delete target from pod %s: %s',
                        pod['metadata']['name'],
                        e)

async def exec_change_target(s, pod, action_old, action_new, logger):
    await exec_delete_target(s, pod, action_old, action_new, logger)
    await exec_add_target(s, pod, action_old, action_new, logger)

async def exec_add_dynamic_endpoint(s, pod, _old, action, logger):
    ename = action['name']
    pname = pod['metadata']['name']
    cname = action['target']

    logger.info(f'configuring pod:{pname} for d_endpoint:{ename}')

    l7mp_instance = get_l7mp_instance(pod)

    ep = {
        'name': action['name'],
        'spec': action['spec'],
    }
    endpoint_obj = l7mp_client.IoL7mpApiV1Cluster(**ep)
    request = l7mp_client.IoL7mpApiV1EndPointRequest(endpoint=endpoint_obj)
    try:
        l7mp_instance.add_end_point(cname, request)
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        if e.status == 400 and content.endswith(' already defined'):
            # FIXME: cannot update, so this will be ok for now.
            logger.warning('already defined',)
        else:
            logger.warning(f'request: {request}')
            raise e
    except urllib3.exceptions.MaxRetryError as e:
        raise kopf.TemporaryError(f'{e}', delay=5)

async def exec_delete_dynamic_endpoint(s, pod, action, _new, logger):
    fqn = action['name']
    if not pod or get_fqn(pod) not in s['pods']:
        logger.info('pod not found: {get_fqn(pod)}')
        return
    logger.info(f'Delete d_endpoint:{fqn} from pod:%s', pod['metadata']['name'])
    cname = action["target"]
    if cname not in s['targets']:
        # Currently, if a custer is deleted, then its endpoints is
        # also automatically removed, so there's no point in trying to
        # delete an endpoint individually in this case.
        logger.info(f' skipping deletion as target {cname} does not exists')
        return
    l7mp_instance = get_l7mp_instance(pod)
    try:
        l7mp_instance.delete_end_point(fqn)
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        not_found = 'Not Found'
        if e.status == 400 and content.startswith(not_found):
            logger.info("... it's not there")
        else:
            logger.warn('Failed to delete endpoint from pod %s: %s',
                        pod['metadata']['name'],
                        e)

async def exec_change_dynamic_endpoint(s, pod, action_old, action_new, logger):
    # The dynamic_endpoint is so simple it cannot be changed.  But for
    # completeness:
    await exec_delete_dynamic_endpoint(s, pod, action_old, action_new, logger)
    await exec_add_dynamic_endpoint(s, pod, action_old, action_new, logger)


async def exec_add_rule(s, pod, _old, action, logger):
    rname = action['name']
    pname = pod['metadata']['name']
    logger.info(f'configuring pod:{pname} for rule:{rname}')
    l7mp_instance = get_l7mp_instance(pod)

    spec = action['spec']
    spec = convert_to_old_api(logger, 'rules', spec)
    rulelist = spec['rulelist']
    position = spec['position']
    rspec = deepcopy(spec['rule'])

    rspec['name'] = rname
    body = {'rule': rspec}

    #logger.debug(f'request: {request}')
    try:
        l7mp_instance.add_rule_to_rule_list(rulelist, position, body)
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        if e.status == 400 and content.endswith(' already defined'):
            # FIXME: cannot update, so this will be ok for now.
            logger.warning('already defined')
        else:
            logger.warning(f'request: {rulelist}, {position}, body:{body}')
            raise e
    except urllib3.exceptions.MaxRetryError as e:
        raise kopf.TemporaryError(f'{e}', delay=5)
    await set_owner_status(s, 'rules', rname, logger)

async def exec_delete_rule(s, pod, action, _new, logger):
    fqn = action['name']
    if not pod or get_fqn(pod) not in s['pods']:
        logger.info('pod not found: {get_fqn(pod)}')
        return
    l7mp_instance = get_l7mp_instance(pod)
    logger.info(f'Delete rule:{fqn} from pod:{pod["metadata"]["name"]}')
    rulelist = action['spec']['rulelist']
    rule_name = fqn
    try:
        l7mp_instance.delete_rule_from_rule_list(
            rulelist, rule_name, recursive="true")
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        not_found = 'Cannot delete rule: Unknown rule'
        if e.status == 400 and content.startswith(not_found):
            logger.info("... it's not there")
        else:
            logger.warn('Failed to delete rule on pod %s: %s',
                        pod['metadata']['name'],
                        e)
    logger.info(f'Delete rule:{fqn} from pod:{pod["metadata"]["name"]}')
    try:
        l7mp_instance.delete_rule(rule_name)
    except l7mp_client.exceptions.ApiException as e:
        content = json.loads(e.body).get('content', '')
        not_found = 'Cannot delete rule: Unknown rule'
        if e.status == 400 and content.startswith(not_found):
            logger.info("... it's not there")
        else:
            logger.warn('Failed to delete rule on pod %s: %s',
                        pod['metadata']['name'],
                        e)

async def exec_change_rule(s, pod, action_old, action_new, logger):
    # For simplicity, we delete the old listener and add the new one.
    await exec_delete_rule(s, pod, action_old, action_new, logger)
    await exec_add_rule(s, pod, action_old, action_new, logger)



# K8s API watchers

def fail_if_pod_not_ready(o_type, body, **kw):
    if o_type != 'pods':
        return
    if not kw['status'].get('podIP'):
        raise kopf.TemporaryError(f'No podIP in {kw["name"]}', delay=3)


@kopf.on.startup()
def startup_fn(settings: kopf.OperatorSettings, logger, **kw):
    settings.persistence.finalizer = 'operator.l7mp.io/kopf-finalizer'
    settings.persistence.progress_storage = kopf.AnnotationsProgressStorage(
        prefix='operator.l7mp.io')
    settings.persistence.diffbase_storage = kopf.AnnotationsDiffBaseStorage(
        prefix='operator.l7mp.io',
    )

@kopf.on.field('', 'v1', 'pods', field='status.containerStatuses')
async def pod_status_fn(new, body, logger, **kw):
    # If the l7mp container is restared, the l7mp config is ereased.
    # The operator should probably recofigure it.  But standard
    # handlers do not detect the restart.  This handler does detect
    # it.
    for container in new or []:
        if container.get('name') == 'l7mp':
            break
    else:
        return
    fqn = get_fqn(body)
    if container.get('ready'):
        logger.info('l7mp became ready in %s', get_fqn(body))
        await create_fn(body=body, logger=logger, **kw)
    else:
        logger.info('l7mp is not ready in %s', get_fqn(body))
        kw['old'] = body    # delete_fn only need the spec part, which
                            # is unchanged.
        await delete_fn(body=body, logger=logger, **kw)


@kopf.on.create('', 'v1', 'endpoints')
@kopf.on.resume('', 'v1', 'endpoints')
@kopf.on.create('', 'v1', 'pods')
@kopf.on.resume('', 'v1', 'pods')
@kopf.on.create('l7mp.io', 'v1', 'virtualservices')
@kopf.on.resume('l7mp.io', 'v1', 'virtualservices')
@kopf.on.create('l7mp.io', 'v1', 'targets')
@kopf.on.resume('l7mp.io', 'v1', 'targets')
@kopf.on.create('l7mp.io', 'v1', 'rules')
@kopf.on.resume('l7mp.io', 'v1', 'rules')
async def create_fn(body, **kw):
    o_type = kw.get('resource').plural # Object type
    fail_if_pod_not_ready(o_type, body, **kw)
    s_old = deepcopy(s)
    s[o_type][get_fqn(body)] = body
    try:
        del s_old[o_type][get_fqn(body)]
    except KeyError:
        pass
    await update(s_old, s, body=body, **kw)


@kopf.on.delete('', 'v1', 'pods')
@kopf.on.delete('', 'v1', 'endpoints')
@kopf.on.delete('l7mp.io', 'v1', 'virtualservices')
@kopf.on.delete('l7mp.io', 'v1', 'targets')
@kopf.on.delete('l7mp.io', 'v1', 'rules')
async def delete_fn(body, old, **kw):
    o_type = kw.get('resource').plural # Object type
    s_old = deepcopy(s)
    try:
        del s[o_type][get_fqn(body)]
    except KeyError:
        pass
    s_old[o_type][get_fqn(body)] = body

    await update(s_old, s, body=body, old=old, **kw)


@kopf.on.update('', 'v1', 'pods')
@kopf.on.update('', 'v1', 'endpoints')
@kopf.on.update('l7mp.io', 'v1', 'virtualservices')
@kopf.on.update('l7mp.io', 'v1', 'targets')
@kopf.on.update('l7mp.io', 'v1', 'rules')
async def update_fn(body, old, **kw):
    o_type = kw.get('resource').plural # Object type
    fail_if_pod_not_ready(o_type, body, **kw)
    fqn = get_fqn(body)
    s_old = deepcopy(s)
    # 'old' is not as fully specified as 'new'
    # use missing parts from 'body'
    old_obj = dict(deepcopy(body))
    dict_update(old_obj, old)
    s_old[o_type][fqn] = old_obj
    s[o_type][fqn] = body

    await update(s_old, s, body=body, old=old, **kw)


# Selectors

def does_operator_match(value, operator, values):
    if operator == 'In':
        if value not in values:
            return False
    elif operator == 'NotIn':
        if value in values:
            return False
    elif operator == 'Exists':
        if value is None:
            return False
    elif operator == 'DoesNotExist':
        if value is not None:
            return False
    else:
        raise kopf.PermanentError(f'Unkown operator: {expr["operator"]}')
    return True

def does_selector_match(s, selector, pod):
    match = True
    for k, v in selector.items():
        fn = f'does_selector_match__{k}'
        if fn in globals():
            match = match and globals()[fn](s, v, pod)
        else:
            raise kopf.PermanentError(f'Selector not supported: {k}')
    return match

def does_selector_match__matchLabels(_s, args, pod):
    labels = pod.get('metadata', {}).get('labels', {})
    return all(v == labels.get(k) for k, v in args.items())

def does_selector_match__matchExpressions(_s, args, pod):
    labels = pod.get('metadata', {}).get('labels', {})
    for expr in args:
        value = labels.get(expr['key'])
        if not does_operator_match(value, expr['operator'], expr['values']):
            return False
    return True

def does_selector_match__matchFields(_s, args, pod):
    for expr in args:
        value = pod
        for key in expr['key'].split('.'):
            value = value.get(key, {})
        if value ==  {}:
            value = None
        if not does_operator_match(value, expr['operator'], expr['values']):
            return False
    return True

def does_selector_match__matchNamespace(_s, args: str, pod):
    return args == pod.get('metadata', {}).get('namespace')

def does_selector_match__matchService(_s, service, pod):
    for ep in s['endpoints'].values():
        if ep['metadata']['name'] == service:
            service_ep = ep
            break
    else:
        return False
    pod_uid = pod.get('metadata', {}).get('uid')
    if not pod_uid:
        return False
    for subset in service_ep.get('subsets', {}):
        for addr in subset.get('addresses', {}):
            uid = addr.get('targetRef', {}).get('uid')
            if pod_uid == uid:
                return True
    return False

def iter_matching(s, objects, pod):
    for obj in objects.values():
        selector = obj['spec']['selector']
        if does_selector_match(s, selector, pod):
            yield obj

def iter_matching_pods(s, selector, pods_to_search):
    for pod in pods_to_search.values():
        if does_selector_match(s, selector, pod):
            yield pod



def grpc_thread():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    envoy_lds.add_ListenerDiscoveryServiceServicer_to_server(
        ListenerDiscoveryServiceServicer(), server)
    server.add_insecure_port('[::]:1234')
    logging.info("Server started")
    server.start()
    server.wait_for_termination()

thread = threading.Thread(target=grpc_thread)
thread.daemon = True
thread.start()

class ListenerDiscoveryServiceServicer(envoy_lds.ListenerDiscoveryServiceServicer):
    last_update=[]
    current=[]

    def __init__(self):
        logging.info("Servicer init")
        udpAny = protobuf.any_pb2.Any()
        udpListener = envoy_udp.UdpProxyConfig(
            stat_prefix= "test",
            cluster= "testcluster",
        )
        udpAny.Pack(udpListener)

        test = envoy_listener.Listener(
            name="testlistener",
            reuse_port=True,
            address=
                envoy_address.Address(
                    socket_address=
                        envoy_address.SocketAddress(
                            protocol='UDP',
                            address="0.0.0.0",
                            port_value=np.uint32(8080),
                        )
                ),
            listener_filters=[
                envoy_listener_components.ListenerFilter(
                    name="envoy.filters.udp_listener.udp_proxy",
                    typed_config=udpAny,
                )
            ]
        )

        test_any= protobuf.any_pb2.Any()
        test_any.Pack(test)
        self.current.append(test_any)

    def DeltaListeners(self, request_iterator, context):
        pprint(request_iterator)
        pprint(context)
        for req in request_iterator:
            if(self.current != self.last_update ):
                logging.info("There's a need for update the list of listeners. current list not equal last_update list")
                if req.error_detail.message:
                    logging.warning(req.error_detail.message)
                if hasattr(req, 'resource_names_subsrcibe'):
                    logging.info(req.resource_names_subsrcibe)
                logging.info(req.node.id)
                self.last_update = self.current
                yield self.create_response()

    def create_response(self):
        resources = []
        for res in self.current:
            resource = envoy_discovery.Resource(
                name="testlistener",
                version="1",
                resource=res,
                ttl=protobuf.duration_pb2.Duration().FromSeconds(120),
            )
            resources.append(resource)

        response = envoy_discovery.DeltaDiscoveryResponse(
                    system_version_info='0',
                    resources=[],
                    type_url= "type.googleapis.com/envoy.config.listener.v3.Listener",
                    nonce="idontknowwhatcomeshere",
                )
        for res in resources:
            response.resources.append(res)
        return response    