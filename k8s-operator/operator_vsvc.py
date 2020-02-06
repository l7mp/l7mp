#!/usr/bin/env python3

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
import inspect
import logging, logging.config
import os
import queue
import threading
import yaml

from kubernetes import client, config, utils, watch
from kubernetes.client import Configuration
from kubernetes.client.rest import ApiException
from kubernetes.stream import stream
from munch import Munch

import util

log = util.logger.getLogger(__name__)
util.load_config()
api = client.CoreV1Api()

# NOTE: the container must have "serviceAccountName: cnf-admin", but
# when the container first starts, k8s hasn't finished copying the
# right credentials into /var/run/secrets/kubernetes.io/.  So
# check_crd() will fail and the container will be restarted.  The
# second time, it will be fine.
util.crd.check_all(install=True)


## ######################################################################

class VirtualService(util.Operator):
  def __init__(self, namespace):
    super().__init__(namespace)
    self.vsvc = {}
    self.pods = {}
    self.thread_args = [
      [self.watch_crd, 'vsvc'],
      [self.watch_crd, 'psvc'],
    ]

  def handle_vsvc_added(self, obj: util.Resource):
    if obj.name in self.vsvc:
      obj.update_status('AlreadyExists')
      return

    log.debug("obj: %s", obj.get('spec'))

    thread = self.watch_pod_thread(obj.spec.selector, obj.name)

    self.vsvc[obj.name] = Munch({
      'thread': thread,
      'obj': obj,
      'pods': Munch(),
      'psvc': Munch(),
      'watch': None,
    })

  def handle_vsvc_modified(self, obj: util.Resource):
    old = self.vsvc[obj.name].obj
    if old.spec == obj.spec:
      self.check_status(obj)
      return
    log.info('vsvc ({obj.name}) is modified, recreating psvc items')
    if old.spec.selector == obj.spec.selector:
      self.vsvc[obj.name].obj = obj
      self.check_vsvc_pods(self.vsvc[obj.name])
      return

    log.info('selector of vsvc ({obj.name}) is modified, recreating vsvc')
    self.handle_vsvc_deleted(old)
    self.handle_vsvc_added(obj)

  def handle_vsvc_deleted(self, obj: util.Resource):
    vsvc = self.vsvc[obj.name]
    # This won't stop the thread, ...
    vsvc.watch.stop()
    for psvc_name, psvc in vsvc.psvc.items():
      log.info(f'Deleting psvc: {psvc_name}')
      psvc.delete()
    del self.vsvc[obj.name]

  def handle_pod_added(self, obj, vsvc_name):
    return 'delay'

  def handle_watch_added(self, obj, vsvc_name):
    try:
      vsvc = self.vsvc[vsvc_name]
    except KeyError:
      return
    vsvc.watch = obj.watch

  def handle_delayed_pod_added(self, obj, vsvc_name):
    self.handle_pod_modified(obj, vsvc_name)

  def handle_pod_modified(self, obj, vsvc_name):
    if obj.get('status').phase != 'Running':
      return
    try:
      vsvc = self.vsvc[vsvc_name]
    except KeyError:
      return
    pod_name = obj.name
    psvc = copy.deepcopy(vsvc.obj).bless('psvc')
    psvc.spec.parent = vsvc_name
    psvc.metadata.name = '%s-%s' % (vsvc_name, pod_name)
    psvc.metadata.labels = {'pod': pod_name}
    try:
      del psvc.spec.selector
    except KeyError:
      pass

    if pod_name not in vsvc.pods:
      vsvc.pods[pod_name] = obj

    if psvc.name not in vsvc.psvc:
      psvc.create_or_update()

    self.check_status(vsvc.obj)

  def handle_pod_deleted(self, obj, vsvc_name):
    try:
      vsvc = self.vsvc[vsvc_name]
    except KeyError:
      return
    pod_name = obj.name
    if pod_name in vsvc.pods:
      del vsvc.pods[pod_name]
    for key, psvc in vsvc.psvc.items():
      if psvc.metadata.get('labels', '') == {'pod': pod_name}:
        psvc.delete()
        del vsvc.psvc[key]
        break
    self.check_status(vsvc.obj)

  def handle_psvc_added(self, psvc: util.Resource):
    return 'delay'

  def handle_delayed_psvc_added(self, psvc: util.Resource):
    try:
      vsvc_name = psvc.spec.parent
    except AttributeError:
      log.info('psvc without parent: %s', psvc.name)
      # If you want a psvc without an operator overlooking it, create
      # it without a parent.
      return
    try:
      vsvc = self.vsvc[vsvc_name]
    except KeyError:
      log.info(f'psvc ({psvc.name}) without vsvc: {vsvc_name}')
      log.info(f'deleting psvc: {psvc.name}')
      psvc.delete()
      return

    pod_name = psvc.metadata.get('labels', {}).get('pod')
    if pod_name not in vsvc.pods:
      log.info(f'deleting psvc: {psvc.name}')
      psvc.delete()
      return

    vsvc.psvc[psvc.name] = psvc
    self.check_status(vsvc.obj)

  def handle_psvc_modified(self, psvc: util.Resource):
    self.handle_delayed_psvc_added(psvc)

  def handle_psvc_deleted(self, psvc: util.Resource):
    try:
      vsvc = self.vsvc[psvc.spec.parent]
      del vsvc.psvc[psvc.name]
    except (KeyError, AttributeError):
      return
    self.check_status(vsvc.obj)

    # recreate psvc when necessary
    self.check_vsvc_pods(vsvc)

  def check_vsvc_pods(self, vsvc):
    vsvc_name = vsvc.obj.name
    for pod in vsvc.pods.values():
      self.handle_pod_modified(pod, vsvc_name)
    self.check_status(vsvc.obj)

  def check_status(self, vsvc: util.Resource):
    status = 'Init'
    ready = 0
    all = 0
    for psvc in self.vsvc[vsvc.name].psvc.values():
      all += 1
      if psvc.status == 'Error':
        status = 'Error'
      elif psvc.status == 'Running':
        ready += 1
    if status == 'Init' and ready == all:
      status = 'Running'
    vsvc.update_status(status, "%s/%s" % (ready, all))


## ######################################################################

if __name__ == '__main__':
  op = VirtualService(namespace='default')
  op.start()
