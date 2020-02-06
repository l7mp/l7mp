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
import logging, logging.config

log_cfg = {
  'version': 1,
  'disable_existing_loggers': False,
  'formatters': {
    'standard': {
      'format': '%(levelname).1s:%(name)s.%(funcName)s:%(message)s'
    },
  },
  'handlers': {
    'default': {
      'formatter': 'standard',
      'class': 'logging.StreamHandler',
      'stream': 'ext://sys.stderr',
    },
  },
  'loggers': {
    '': {'level': 'INFO', 'handlers': ['default']},
    'util': {'level': 'INFO', 'handlers': ['default'], 'propagate': 0},
    '__main__': {'level': 'INFO', 'handlers': ['default'], 'propagate': 0},
  },
}

logging.config.dictConfig(log_cfg)
log = logging.getLogger(__name__)

def getLogger(name):
  return logging.getLogger(name)
