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

const Stream  = require('stream');
const assert  = require('chai').assert;
const L7mp    = require('../l7mp.js').L7mp;
const Cluster = require('../cluster.js').Cluster;
const session_byte_counter_total = require('../monitoring').Monitoring.session_byte_counter_total;
const session_packet_counter_total = require('../monitoring').Monitoring.session_packet_counter_total;

describe('MetricCluster', ()  => {
    let s, c, e;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        it('created',      () => { assert.exists(c = Cluster.create({name: 'Metric', spec: {protocol: 'Metric'}})); });
        it('runs',   async () => { await c.run(); assert.isObject(c); });
        it('object',       () => { assert.isObject(c); });
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-spec',     () => { assert.nestedProperty(c.spec, 'protocol'); });
        it('has-protocol', () => { assert.nestedPropertyVal(c, 'spec.protocol', 'Metric');});
    });

    context('stream()', () => {
        it('runs', async   () => { await c.run(); assert.isOk(c);});
        it('stream', async () => { s = await c.stream({name:'metric',route:{retry:{timeout:1000}}, stats:{metricLabels:{}} })});
        it('returns ok',   () => { assert.isOk(s.stream); });
        it('isa stream',   () => { assert.instanceOf(s.stream, Stream); });
        it('readable',     () => { assert.isOk(s.stream.readable); });
        it('writeable',    () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('does-count-packet-throughput-correctly',  (done) => {
            s.stream.on('finish', () =>{
                let metricValue = session_packet_counter_total.get({clusterName: 'Metric', sessionName: 'metric'}).values[0].value;
                assert.equal(metricValue, 3)
                done();
            })
            s.stream.write('p1');
            s.stream.write('p2');
            s.stream.write('p3');
            s.stream.end();
        });
        //in the previous test there was 2 bytes written on the stream three times,
        //total of 6 bytes, so the session_byte_counter_total should equal 6
        it('does-count-byte-throughput-correctly',  (done) => {
            let metricValue = session_byte_counter_total.get({clusterName: 'Metric', sessionName: 'metric'}).values[0].value;
            assert.equal(metricValue, 6)
            done();
        });
    });
});