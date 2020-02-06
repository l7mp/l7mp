# L7mp: A programmable L7 meta-proxy
#
# Copyright 2019 by its authors.
# Some rights reserved. See AUTHORS.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the 'Software'), to
# deal in the Software without restriction, including without limitation the
# rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
# sell copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
# ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
# WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
from kubernetes import client

from . import crd
from . import logger

log = logger.getLogger(__name__)

# Sync a CR with the etcd of k8s

def create(short_name, obj_name, params, ns, labels=None, update=False):
  crd_def = crd.get_definition(short_name)
  domain = crd_def.spec.group
  crd_ver = crd_def.spec.version
  plural = crd_def.spec.names.plural
  body = {
    'apiVersion': '%s/%s' % (domain, crd_ver),
    'kind': crd_def.spec.names.kind,
    'spec': {},
    'metadata': {
      'name': '%s' % obj_name,
      'namespace': ns,
    },
  }
  if labels:
    body['metadata']['labels'] = labels
  for key, val in params.items():
    body['spec'][key] = val
  crds = client.CustomObjectsApi()

  log.info(f'{domain} {crd_ver} {ns} {short_name} {obj_name}')
  log.debug(f'{short_name} b:{body}')

  if update:
    crds.patch_namespaced_custom_object(
      domain, crd_ver, ns, plural, obj_name, body)
  else:
    crds.create_namespaced_custom_object(
      domain, crd_ver, ns, plural, body)

  return {'result': 'success'}

def delete(short_name, obj_name, ns):
  crd_def = crd.get_definition(short_name)
  crds = client.CustomObjectsApi()
  crds.delete_namespaced_custom_object(
      group=crd_def.spec.group,
      version=crd_def.spec.version,
      namespace=ns,
      plural=crd_def.spec.names.plural,
      name=obj_name,
      body=client.V1DeleteOptions(),
  )
  result = {'result': 'success'}
  return result

def update_status(short_name, obj_name, obj_or_status, ready, ns):
  if type(obj_or_status) is str:
    obj = {'status': {'status': obj_or_status}}
  else:
    obj = obj_or_status
  crd_def = crd.get_definition(short_name)

  if ready:
    obj['status']['ready'] = ready

  crds = client.CustomObjectsApi()
  crds.patch_namespaced_custom_object_status(
    group=crd_def.spec.group,
    version=crd_def.spec.version,
    namespace=ns,
    plural=crd_def.spec.names.plural,
    name=obj_name,
    body=obj,
  )

def list(short_name, ns):
  crd_def = crd.get_definition(short_name)
  domain = crd_def.spec.group
  crd_ver = crd_def.spec.version
  crds = client.CustomObjectsApi()
  s = crds.list_cluster_custom_object(domain, crd_ver, short_name)["items"]
  return s
