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

#
# POD_NAME=nemethf-6f9d47897b-jpmbq python3 operator_psvc.py
#
# Downward API information available in fieldRef.fieldPath
# metadata.name  Pod name
#
# spec:
#   containers:
#   - image: k8spatterns/random-generator:1.0
#     name: random-generator
#     env:
#     - name: POD_NAME
#       valueFrom:
#         fieldRef:
#           fieldPath: metadata.name

import copy
import os
import requests

from kubernetes import client
from kubernetes.client.rest import ApiException

import util

log = util.logger.getLogger(__name__)
util.load_config()
api = client.CoreV1Api()

# NOTE: the container must have "serviceAccountName: cnf-admin", but
# when the container first starts, k8s hasn't finished copying the
# right credentials into /var/run/secrets/kubernetes.io/.  So
# check_crd() will fail and the container will be restarted.  The
# second time, it will be fine.
util.crd.check('psvc', install=True)


## ######################################################################

def add_virtual_host(vhost):
  url = 'http://localhost:1234/api/v1/listeners'
  d = {'listener': vhost}
  headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
  r = requests.post(url, json=d, headers=headers)

  if r.status_code == 200:
    return True

  log.error('add_virtual_host: %s', r.json())
  return False


## ######################################################################

class PodalService(util.Operator):
  def __init__(self, namespace):
    super().__init__(namespace)
    self.objs = {}
    self.pod_name = os.environ['POD_NAME']
    self.thread_args = [
      [self.watch_crd, 'psvc', 'pod=%s' % self.pod_name],
    ]

  def handle_psvc_added(self, obj: util.Resource):
    if obj.name in self.objs:
      obj.update_status('AlreadyExists')
      return

    log.info("obj.spec :!: %s", obj.get('spec'))

    # Configure l7mp
    for vhost in obj.get('spec', {}).get('virtualHost', []):
      if not add_virtual_host(vhost):
        status = 'Error'
        break
    else:
      status = 'Running'
    self.objs[obj.name] = obj
    obj.update_status(status)

  def handle_psvc_modified(self, obj: util.Resource):
    try:
      old_obj = self.objs[obj.name]
    except KeyError:
      old_obj = copy.deepcopy(obj)

    if old_obj.get('spec') == obj.get('spec'):
      self.objs[obj.name] = obj
      return

    log.info("old_obj: %s", old_obj)
    log.info("obj: %s", obj)
    obj.update_status('CannotModify')

  def handle_psvc_deleted(self, obj: util.Resource):
    log.info("obj: %s", obj)
    try:
      del self.objs[obj.name]
    except KeyError:
      return
    # TODO: actually stop tunnels, reconfigure l7mp, etc.
    return


## ######################################################################

if __name__ == '__main__':
  op = PodalService(namespace='default')
  op.start()
