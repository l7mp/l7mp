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

//prometheus
const client        = require('prom-client');






class Monitoring {

   constructor() {
      //list of metric registries for monitoring
      this.listenerMetricRegistry      = new client.Registry();
      this.clusterMetricRegistry      = new client.Registry();
      this.metricClusterMetricRegistry = new client.Registry();
      this.endpointMetricRegistry      = new client.Registry();

      //list of metrics

      //This metric is used for counting requests on a LISTENER
      this.listener_requests_total       = new client.Counter({
         name: `listener_requests_total`,
         help: 'Total number of requests',
         labelNames: ['listenerName', 'protocol'],
         registers: [this.listenerMetricRegistry]
      })

      //This metric is used for counting requests on a CLUSTER
      this.cluster_requests_total       = new client.Counter({
         name: `cluster_requests_total`,
         help: 'Total number of requests',
         labelNames: ['clusterName', 'protocol'],
         registers: [this.clusterMetricRegistry]
      })

      //This metric is used for counting BYTES on a session
      this.session_byte_counter_total =  new client.Counter({
         name: `session_byte_counter_total`,
         help: 'Total number of bytes that flows trough the cluster',
         labelNames: ['call_id', 'clusterName', 'dstCluster','srcAddr', 'dstAddr', 'srcPort', 'dstPort', 'endpointProto' ,'endpointAddr', 'endpointPort','direction'],
         registers: [this.metricClusterMetricRegistry]
      });

      //This metric is used for counting PACKETS on a session
      this.session_packet_counter_total =  new client.Counter({
         name: `session_packet_counter_total`,
         help: 'Total number of packets that flows trough the cluster',
         labelNames: ['call_id', 'clusterName', 'dstCluster', 'srcAddr', 'dstAddr', 'srcPort', 'dstPort', 'endpointProto' ,'endpointAddr', 'endpointPort','direction'],
         registers: [this.metricClusterMetricRegistry]
      });
   }

   //Exposing every registry listed below on the same endpoint
   mergeRegistries() {
      return client.Registry.merge([
         this.listenerMetricRegistry,
         this.clusterMetricRegistry,
         this.endpointMetricRegistry,
         this.metricClusterMetricRegistry,
         client.register
      ]);
   }

   /*
      Creates a labels object for MetricCluster
      s parameter is the session
    */

   getLabelsObject(s, cluster){
      let labels={};
      cluster.labels.sessionValues.forEach(label => {
         switch(label.value){
            case 'session_id':
            case 'call-id':
            case 'sessionname':
            case 'sessionName':
               labels[label.key] = s.metadata.name;
               break;
            case 'clustername':
            case 'clusterName':
               labels[label.key] = cluster.name;
               break;
            case 'dstCluster':
            case 'dstcluster':
               labels[label.key] = s.route.destination;
               break;
            case 'srcaddr':
            case 'srcAddr':
               labels[label.key] = s.metadata.IP.src_addr;
               break;
            case 'dstaddr':
            case 'dstAddr':
               labels[label.key] = s.metadata.IP.dst_addr;
               break;
            case 'endpointaddr':
            case 'endpointAddr':
               labels[label.key] = s.destination.endpoint.remote_address;
               break;
            case 'endpointport':
            case 'endpointPort':
               labels[label.key] = s.destination.endpoint.remote_port;
               break;
            default:
               break;
         }
      })
      cluster.labels.directValues.forEach(label => {
         labels[label.key] = label.value;
      })
      return labels;
   }
}

module.exports.Monitoring = new Monitoring();

//metric registries
// module.exports.listenerMetricRegistry        = listenerMetricRegistry;
// module.exports.clusterMetricRegistry         = clusterMetricRegistry;
// module.exports.endpointMetricRegistry        = endpointMetricRegistry;
// module.exports.metricClusterMetricRegistry   = metricClusterMetricRegistry;
//
// //metrics
// module.exports.listener_requests_total       = listener_requests_total;
// module.exports.cluster_requests_total       = cluster_requests_total;
// module.exports.session_byte_counter_total    = session_byte_counter_total;
// module.exports.session_packet_counter_total    = session_packet_counter_total;