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
import inspect
import yaml

from kubernetes import client
from munch import Munch

from . import logger
log = logger.getLogger(__name__)

defs = {
  'vsvc': inspect.cleandoc('''
    apiVersion: apiextensions.k8s.io/v1beta1
    kind: CustomResourceDefinition
    metadata:
      name: virtualservices.l7mp.io
    spec:
      group: l7mp.io
      version: v1
      scope: Namespaced
      subresources:
        status: {}
      names:
        plural: virtualservices
        singular: virtualservice
        kind: VirtualService
        shortNames:
         - vsvc
      additionalPrinterColumns:
      - name: selector
        type: string
        JSONPath: .spec.selector
      - name: ready
        type: string
        JSONPath: .status.ready
      - name: status
        type: string
        JSONPath: .status.status
  '''),
  'psvc': inspect.cleandoc('''
    apiVersion: apiextensions.k8s.io/v1beta1
    kind: CustomResourceDefinition
    metadata:
      name: podalservices.l7mp.io
    spec:
      group: l7mp.io
      version: v1
      scope: Namespaced
      subresources:
        status: {}
      names:
        plural: podalservices
        singular: podalservice
        kind: PodalService
        shortNames:
         - psvc
      additionalPrinterColumns:
      - name: status
        type: string
        JSONPath: .status.status
  '''),
}

def get_definition(short_name):
  #raise yaml.YAMLError
  return Munch.fromDict(yaml.safe_load(defs[short_name]))

checked_crds = {}
def check(short_name, install=True):
  api = client.ApiextensionsV1beta1Api(client.ApiClient()) #(configuration))
  our_crd = get_definition(short_name)
  crd_name = our_crd.metadata.name
  checked_crds[short_name] = our_crd
  for crd in api.list_custom_resource_definition().items:
    if crd.metadata.name == crd_name:
      ver = crd.spec.version
      log.debug("crd found (name:%s, ver:%s)", crd_name, ver)
      break
  else:
    ver = None
    log.info('crd not found (name: %s)', crd_name)

  our_ver = our_crd.spec.version
  if ver == our_ver:
    log.debug('crd is up-to-date')
    return True
  if not install:
    log.critical('crd version mismatch')
    exit(-1)
  if ver is None:
    log.info('installing the crd')
    try:
      api.create_custom_resource_definition(our_crd)
    except ValueError as e:
      log.error('%s' % e)
      log.error('It is OK to have here a "conditions must not be None" error')
    return True
  if int(ver[1:]) < int(our_ver[1:]):
    log.info('crd is outdated, installing %s' % our_ver)
    log.debug('resource_version: %s', int(crd.metadata.resource_version))
    our_crd.metadata.resourceVersion = crd.metadata.resource_version
    #print('our_crd: %s' % our_crd)
    api.replace_custom_resource_definition(crd_name, our_crd)
    return True
  else:
    log.critical('controller is outdated (%s)', our_ver)
    exit(-1)

def check_all(install=True):
  for key in defs.keys():
    check(key, install)

def get_short_name(plural=None, kind=None):
  for short_name, crd in checked_crds.items():
    if plural and crd.spec.names.plural == plural:
        return short_name
    if kind and crd.spec.names.kind == kind:
        return short_name
  log.critical('short_name not found for %s', plural or kind)
  raise KeyError(plural or kind)

