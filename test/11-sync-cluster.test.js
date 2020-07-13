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

const Stream       = require('stream');
const assert       = require('chai').assert;
const L7mp         = require('../l7mp.js').L7mp;
const EndPoint     = require('../cluster.js').EndPoint;
const Cluster      = require('../cluster.js').Cluster;
const LoadBalancer = require('../cluster.js').LoadBalancer;

describe('SyncCluster', () => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'warn' });
        l7mp.run();
    });

    context('create', () => {
        var c, e;
        c = Cluster.create({name: 'Sync', spec: {protocol: 'Sync', query: 'test/test/test'}});
        it('runs',   async             () => { c.run(); assert.exists(c); });
        it('object',                   () => { assert.isObject(c); });
        it('instanceOf',               () => { assert.instanceOf(c, Cluster); });
        it('has-name',                 () => { assert.property(c, 'name'); });
        it('name',                     () => { assert.propertyVal(c, 'name', 'Sync'); });
        it('has-spec',                 () => { assert.property(c, 'spec'); });
        it('has-protocol',             () => { assert.propertyVal(c, 'protocol', 'Sync'); });
        it('load-balancer',            () => { assert.property(c, 'loadbalancer'); });
        it('load-balancer-instanceof', () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
        it('has-query',                () => { assert.property(c, 'query'); });
        it('equals',                   () => { assert.equal(c.query, 'test/test/test'); });
    });

    context('addEndPoint', () => {
        var c, e;
        c = Cluster.create({name: 'Sync', spec: {protocol: 'Sync', query: 'test/test/test'}});
        c.protocol = 'Test'
        e = c.addEndPoint({name: 'Test', spec: {}});
        it('runs', async () => { await c.run(); assert.isOk(c);});
        it('endpoint-ok',      () => { assert.exists(e); });
        it('object',           () => { assert.isObject(e); });
        it('instanceOf',       () => { assert.instanceOf(e, EndPoint); });
        it('has-name',         () => { assert.property(e, 'name'); });
        it('equal',            () => { assert.equal(e.name, 'Test'); });
        it('has-spec',         () => { assert.property(e, 'spec'); });
        it('has-protocol',     () => { assert.deepPropertyVal(e, 'protocol', 'Test'); });
        it('get',              () => { let n = c.getEndPoint('Test'); assert.isOk(n); });
        it('get-instanceOf',   () => { let n = c.getEndPoint('Test'); assert.instanceOf(n, EndPoint); });
        it('get-name',         () => { let n = c.getEndPoint('Test'); assert.equal(n.name, 'Test'); });
        it('get-fail',         () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('delete',           () => { c.deleteEndPoint('Test'); assert.lengthOf(c.endpoints, 0); });
        it('get-fail',         () => { let n = c.getEndPoint('Test'); assert.isUndefined(n); });
        it('re-add',           () => { e = c.addEndPoint({name: 'Test', spec: {}}); assert.isOk(e); });
        it('get-2',            () => { let n = c.getEndPoint('Test'); assert.isOk(n); });
        it('get-2-name',       () => { let n = c.getEndPoint('Test'); assert.equal(n.name, 'Test'); });
    });

    // TODO: Finish the stream test
    // context('stream', () => {
    //     var c, e, s;
    //     c = Cluster.create({name: 'Sync', spec: {protocol: 'Sync', query: 'test/test/test'}});
    //     c.protocol = 'Test'
    //     console.log(c);
    //     e = c.addEndPoint({name: 'Test', spec: {}});
    //     it('ok', () => {
    //         s = c.stream({metadata: {test: {test: {test: 'test'}}}});
    //         assert.exists(s);
    //     });
    //     it('instanceOf',   () => { console.log(s); assert.instanceOf(s.stream, Stream); });
    //     it('readable',     () => { assert.isOk(s.stream.readable); });
    //     it('writeable',    () => { assert.isOk(s.stream.writable); });
    //     it('has-endpoint', () => { assert.isObject(s.endpoint); });
    //     it('destroyable',  () => { s.stream.end(); assert.isOk(true); });
    // });
});
