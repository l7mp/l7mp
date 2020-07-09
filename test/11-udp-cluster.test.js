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
const UDP          = require('dgram');

describe('UDPCluster', () => {

    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'warn' });
        l7mp.run();
    });

    context('create', () => {
        var c = Cluster.create({name: 'UDP', spec: {protocol: 'UDP', port: 54321}});
        it('runs',                     () => {assert.exists(c); });
        it('object',                   () => { assert.isObject(c); });
        it('instanceOf',               () => { assert.instanceOf(c, Cluster); });
        it('has-name',                 () => { assert.property(c, 'name'); });
        it('name',                     () => { assert.propertyVal(c, 'name', 'UDP'); });
        it('has-spec',                 () => { assert.property(c, 'spec'); });
        it('has-protocol',             () => { assert.propertyVal(c, 'protocol', 'UDP'); });
        it('load-balancer',            () => { assert.property(c, 'loadbalancer'); });
        it('load-balancer-instanceof', () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
    });

    context('endpoins', () => {
        var c = Cluster.create({name: 'UDP', spec: {protocol: 'UDP', port: 54321}});
        var e;
        it('add',                 () => { e = c.addEndPoint({name: 'UDP', spec: {address: '127.0.0.1'}}); assert.isOk(e); });
        it('exists',              () => { assert.lengthOf(c.endpoints, 1); });
        it('instanceOf',          () => { assert.instanceOf(e, EndPoint); });
        it('equal',               () => { assert.equal(c.endpoints[0].name, 'UDP'); });
        it('endpoint-instanceOf', () => { assert.instanceOf(c.endpoints[0], EndPoint); });
        it('endpoint-protocol',   () => { assert.propertyVal(c.endpoints[0], 'protocol', 'UDP'); });
        it('get',                 () => { let n = c.getEndPoint('UDP'); assert.isOk(n); });
        it('get-instanceOf',      () => { let n = c.getEndPoint('UDP'); assert.instanceOf(n, EndPoint); });
        it('get-name',            () => { let n = c.getEndPoint('UDP'); assert.equal(n.name, 'UDP'); });
        it('get-fail',            () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('delete',              () => { c.deleteEndPoint('UDP'); assert.lengthOf(c.endpoints, 0); });
        it('get-fail',            () => { let n = c.getEndPoint('UDP'); assert.isUndefined(n); });
        it('re-add',              () => { e = c.addEndPoint({name: 'UDP', spec: {address: '127.0.0.1'}}); assert.isOk(e); });
        it('get-2',               () => { let n = c.getEndPoint('UDP'); assert.isOk(n); });
        it('get-2-name',          () => { let n = c.getEndPoint('UDP'); assert.equal(n.name, 'UDP'); });
    });

    context('stream', () => {
        var s, e, c;
        before( () => {
            c = Cluster.create({name: 'UDP', spec: {protocol: 'UDP' ,port: 16000, bind: {address: "127.0.0.1", port: 16001}}});
            e = c.addEndPoint(EndPoint.create(
                {protocol: 'UDP', spec: {protocol: 'UDP' ,port: 16000, bind: {address: "127.0.0.1", port: 16001}}},
                {name: 'UDP', spec: {address: "127.0.0.1"}}));
        });

        it('ok', async () => {
            s = await c.stream({route:{retry:{timeout:1000}}});
            assert.isOk(s);
        });
        it('exists',       () => { assert.isOk(s.stream); });
        it('instanceOf',   () => { assert.instanceOf(s.stream, Stream); });
        it('readable',     () => { assert.isOk(s.stream.readable); });
        it('writeable',    () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('correct-byte-stream', () => {
            let client = UDP.createSocket("udp4")
            client.bind(1600)
            let message = Buffer.from('test')
            s.stream.on('message', (msg, rinfo) => {
                assert.equal(msg.toString(), 'test');
                client.close();
                s.close();
                console.log(s);
                done();
            })
            client.send(message,16001, "127.0.0.1" , (err, bytes) => {
                client.close();
            });
        });
        it('Not-found-endpoint', async () => {
            c.loadbalancer.update([undefined]);
            return await c.stream({route:{retry:{timeout:1000}}})
                .then(() => assert(false))
                .catch(() => assert(true));
        });
        it('fail-timeout', async () => {
            await c.stream({route:{retry:{timeout:100}}}).catch(() => {
                assert.isOk(true);
            });
        });
        it('stream-close', (done) =>{
            s.stream.on('close', ()=>{
                assert.isOk(true);
                done();
            });
            s.stream.end();
        });
    });
});
