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

describe('TestCluster', ()  => {
    var e, c, s_ok;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'warn' });
        l7mp.run();
    });

    context('create', () => {
        it('runs',    async () => {
            c = Cluster.create({
                name: 'Test',
                spec: {protocol: 'Test'},
            });
            await c.run();
            assert.exists(c);
        });
        it('object',       () => { assert.isObject(c); });
        // TestCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('name',         () => { assert.propertyVal(c, 'name', 'Test'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(c, 'protocol', 'Test'); });
        it('load-balancer', () => { assert.property(c, 'loadbalancer'); });
        // should be Trivial
        it('load-balancer-instanceof', () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
    });

    context('endpoins', () => {
        it('add',                 () => { e = c.addEndPoint({name: 'Test', spec: {}}); assert.isOk(e); });
        it('exists',              () => { assert.lengthOf(c.endpoints, 1); });
        it('instanceOf',          () => { assert.instanceOf(e, EndPoint); });
        it('equal',               () => { assert.equal(c.endpoints[0].name, 'Test'); });
        it('endpoint-instanceOf', () => { assert.instanceOf(c.endpoints[0], EndPoint); });
        it('endpoint-protocol',   () => { assert.propertyVal(c.endpoints[0], 'protocol', 'Test'); });
        it('get',                 () => { let n = c.getEndPoint('Test'); assert.isOk(n); });
        it('get-instanceOf',      () => { let n = c.getEndPoint('Test'); assert.instanceOf(n, EndPoint); });
        it('get-name',            () => { let n = c.getEndPoint('Test'); assert.equal(n.name, 'Test'); });
        it('get-fail',            () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('fail-delete',         () => { c.deleteEndPoint('None'); assert.lengthOf(c.endpoints, 1)})
        it('delete',              () => { c.deleteEndPoint('Test'); assert.lengthOf(c.endpoints, 0); });
        it('get-fail',            () => { let n = c.getEndPoint('Test'); assert.isUndefined(n); });
        it('re-add',              () => { e = c.addEndPoint({name: 'Test', spec: {}}); assert.isOk(e); });
        it('get-2',               () => { let n = c.getEndPoint('Test'); assert.isOk(n); });
        it('get-2-name',          () => { let n = c.getEndPoint('Test'); assert.equal(n.name, 'Test'); });
    });

    context('#stream()', () => {
        it('ok', async () => {
            e = c.endpoints[0]; e.mode=['ok']; e.timeout=0;
            s_ok = await c.stream({route:{retry:{timeout:1000}}});
            assert.isOk(s_ok);
        });
        it('exists',     () => { assert.isOk(s_ok.stream); });
        it('instanceOf', () => { assert.instanceOf(s_ok.stream, Stream); });
        it('readable',   () => { assert.isOk(s_ok.stream.readable); });
        it('writeable',  () => { assert.isOk(s_ok.stream.writable); });
        it('fail', async () => {
            e = c.endpoints[0]; e.mode=['fail']; e.timeout=0;
            let s = await c.stream({route:{retry:{timeout:1000}}}).
                catch(() => { assert.isOk(true);});
        });
        it('fail-timeout-override', async () => {
            e = c.endpoints[0]; e.mode=['ok']; e.timeout=1000;
            let s = await c.stream({route:{retry:{timeout:100}}}).
                catch(() => { assert.isOk(true);});
        });
        it('ok-fail-program', async () => {
            e = c.endpoints[0]; e.mode=['ok', 'fail', 'ok', 'fail'];
            e.timeout=0; e.round=0;
            let i = 0;
            let s1 = await c.stream({route:{retry:{timeout:2000}}}).then(
                async () => {
                    let s2 = await c.stream({route:{retry:{timeout:2000}}}).then(
                        () => { assert.fail(); },
                        async () => {
                            let s3 = await c.stream({route:{retry:{timeout:2000}}}).then(
                                async () => {
                                    let s4 = await c.stream({route:{retry:{timeout:2000}}}).then(
                                        () => { assert.fail(); },
                                        () => { assert.isOk(true); }
                                    );
                                },
                                () => { assert.fail(); }
                            );
                        }
                    );
                },
                () => { assert.fail(); }
            );
        });
    });
});
