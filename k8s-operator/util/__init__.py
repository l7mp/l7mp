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
import copy
import os
import queue
import threading

from kubernetes import client, config, watch
from kubernetes.client import Configuration
from munch import Munch

from . import cobj
from . import crd
from . import logger

log = logger.getLogger(__name__)

def load_config():
  if os.getenv('KUBERNETES_SERVICE_HOST'):
    config.load_incluster_config()
  else:
    config.load_kube_config()

  c = Configuration()
  c.assert_hostname = False
  Configuration.set_default(c)


## ######################################################################


def dict_diff_key(d1, d2):
  set1 = set(d1.items())
  set2 = set(d2.items())
  diff = set([k for k, _v in list(set1 ^ set2)])
  return list(diff)

def selector_to_str(selector):
  if type(selector) == str:
    return selector
  s = ','.join([f'{k}={v}' for k,v in selector.items()])
  return s


## ######################################################################

class Resource(Munch):

  def bless(self, short_name: str):
    "Change object type to SHORT_NAME."

    crd_def = crd.get_definition(short_name)
    self.kind = crd_def.spec.names.kind
    return self

  @property
  def name(self):
    return self.metadata.name

  @property
  def status(self):
    return self.get('status', {}).get('status')

  @property
  def ready(self):
    "Progress of readiness, e.g., 1/2."
    return self.get('status', {}).get('ready')

  def update_status(self, new_status, ready=None):
    if self.status == new_status and self.ready == ready:
      return
    obj_name = self.name
    obj_type = crd.get_short_name(kind=self.kind)
    ns = self.metadata.namespace
    log.info(f'{obj_name} {new_status}')
    return cobj.update_status(obj_type, obj_name, new_status, ready, ns)

  def create(self, *args, **kw):
    "Create the object in the etcd of k8s."
    name = self.name
    obj_type = crd.get_short_name(kind=self.kind)
    ns = self.metadata.namespace
    kw['labels'] = self.metadata.get('labels')
    log.debug(f'{obj_type}, {name}, {self}, {ns}, {args}, {kw}')
    return cobj.create(obj_type, name, self.spec, ns, *args, **kw)

  def create_or_update(self, *args, **kw):
    "Create the object of update if it aready exists."
    try:
      return self.create(*args, **kw)
    except client.rest.ApiException as e:
      if e.status == 409:
        kw['update'] = True
        self.create(*args, **kw)
      else:
        raise e

  def delete(self):
    return cobj.delete(
      crd.get_short_name(kind=self.kind),
      self.name,
      ns = self.metadata.namespace)


## ######################################################################

class Operator(object):
  def __init__(self, namespace='default'):
    self.ns = namespace
    self.que = queue.Queue(maxsize=100)

  def _dispatcher(self):
    while True:
      item = self.que.get()
      if item is None:
        break

      obj_type, event = item
      name = event.object.metadata.name
      try:
        short_name = crd.get_short_name(obj_type)
      except (TypeError, KeyError):
        short_name = obj_type
      event_type = event.type.lower()
      modifer = event.get('modifer', '')
      handler = "handle%s_%s_%s" % (modifer, short_name, event_type)
      args = event.get('args', [])
      log.info("Event (%s): %s %s", handler, name, ','.join(args))
      fn = getattr(self, handler)
      ret = fn(Resource(event.object), *args)
      if ret == 'delay':
        event.modifer = '_delayed'
        self.que.put((obj_type, event))

      self.que.task_done()

  def watch_pod(self, selector, *args):
    v1 = client.CoreV1Api()
    api_func = v1.list_namespaced_pod
    selector = selector_to_str(selector)

    log.info(f'{self.ns} {selector}')
    w = watch.Watch()
    s = w.stream(api_func, namespace=self.ns, label_selector=selector)
    self.que.put(('watch', Munch.fromDict({'type': 'added',
                                           'object': {
                                             'metadata': {'name': 'n/a'},
                                             'watch': w,
                                           },
                                           'args': args})))
    for event in s:
      event['object'] = event['object'].to_dict()
      event = Munch.fromDict(event)
      event.args = args
      self.que.put(('pod', event))

  def watch_pod_thread(self, *args):
    t = threading.Thread(target=self.watch_pod, args=args)
    t.start()
    return t

  def watch_crd(self, crd_short_name, label_selector=''):
    crds = client.CustomObjectsApi()
    crd_def = crd.get_definition(crd_short_name)
    plural = crd_def.spec.names.plural
    domain = crd_def.spec.group
    crd_ver = crd_def.spec.version
    api_func = crds.list_namespaced_custom_object
    kw = {'label_selector': label_selector}

    w = watch.Watch()
    log.info(f'd:{domain}, ver: {crd_ver}, name: {plural}, kw:{kw}')
    s = w.stream(api_func, domain, crd_ver, self.ns, plural, **kw)

    for event in s:
      self.que.put((plural, Munch.fromDict(event)))

  def start(self):
    args = self.thread_args
    args.insert(0, [self._dispatcher])
    threads = [threading.Thread(target=t[0], args=t[1:]) for t in args]
    for t in threads:
      t.start()
    for t in threads:
      t.join()
