// L7mp: A programmable L7 meta-proxy
//
// Copyright 2020 by its authors.
// Some rights reserved. See AUTHORS.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

//for prometheus
const client        = require('prom-client');

//list of metrics registries for monitoring
const listenerMetricRegistry      = new client.Registry();
const clusterMetricRegistry      = new client.Registry();
const endpointMetricRegistry      = new client.Registry();
const metricClusterMetricRegistry = new client.Registry();

class Monitoring {

//Exposing every registry listed below on the same endpoint
   static mergeRegistries() {
      return client.Registry.merge([
         listenerMetricRegistry,
         clusterMetricRegistry,
         endpointMetricRegistry,
         metricClusterMetricRegistry,
         client.register
      ]);
   }
}

module.exports.Monitoring = Monitoring;
module.exports.listenerMetricRegistry   = listenerMetricRegistry;
module.exports.clusterMetricRegistry   = clusterMetricRegistry;
module.exports.endpointMetricRegistry   = endpointMetricRegistry;
module.exports.metricClusterMetricRegistry   = metricClusterMetricRegistry;