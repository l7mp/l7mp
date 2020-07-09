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

const Stream   = require('stream');
const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const Cluster  = require('../cluster.js').Cluster;
const EndPoint = require('../cluster.js').EndPoint;
const LoadBalancer = require('../cluster.js').LoadBalancer;
const WebSocket = require('ws');

describe('WebSocketCluster', () => {
    var c;
    before( () => {
        wss = new WebSocket.Server({ port: 8080 });
        wss.on("connection", ws => {
            ws.on("message", data => {
                ws.send(data);
            });
        });
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });
    after(() => { setImmediate( () => wss.close()); });

    context('create', () => {
        c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}});
        it('runs',             () => { assert.exists(c); });
        it('object',           () => { assert.isObject(c); });
        it('instanceOf',       () => { assert.instanceOf(c, Cluster); });
        it('has-name',         () => { assert.property(c, 'name'); });
        it('has-spec',         () => { assert.property(c, 'spec'); });
        it('has-protocol',     () => { assert.deepPropertyVal(c, 'spec', {protocol: 'WebSocket'}); });
        it('has-loadbalancer', () => { assert.property(c, 'loadbalancer'); });
        it('has-policy',       () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
        it('has-type',         () => { assert.property(c, 'type'); });
        it('has-retry',        () => { assert.deepPropertyVal(c, 'retriable', true); });
        it('has-options',      () => { assert.deepPropertyVal(c, 'options', {removeOrphanSessions: true}); });
        it('has-objectmode',   () => { assert.property(c, 'objectMode'); });
    });

    context('addEndPoint', () => {
        c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}});
        c.addEndPoint({name: 'Test', spec: {address: '127.0.0.1'}});
        var endpoint = c.endpoints[0];
        it('runs',             () => { assert.exists(c.endpoints); });
        it('object',           () => { assert.isObject(endpoint); });
        it('instanceOf',       () => { assert.instanceOf(endpoint, EndPoint); });
        it('has-name',         () => { assert.property(endpoint, 'name'); });
        it('equal',            () => { assert.equal(endpoint.name, 'Test'); });
        it('has-spec',         () => { assert.property(endpoint, 'spec'); });
        it('has-protocol',     () => { assert.deepPropertyVal(endpoint, 'protocol', 'WebSocket'); });
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

    context('addEndPoint-with-bind', () => {
        c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}});
        c.addEndPoint({
            name: 'Test',
            spec: {
                address: '127.0.0.1',
                bind: {
                    address: '127.0.0.1',
                    port: 8080
                }
            }
        });
        var endpoint = c.endpoints[0];
        it('runs',             () => { assert.exists(c.endpoints); });
        it('object',           () => { assert.isObject(endpoint); });
        it('instanceOf',       () => { assert.instanceOf(endpoint, EndPoint); });
        it('has-name',         () => { assert.property(endpoint, 'name'); });
        it('equal',            () => { assert.equal(endpoint.name, 'Test'); });
        it('has-spec',         () => { assert.property(endpoint, 'spec'); });
        it('has-protocol',     () => { assert.deepPropertyVal(endpoint, 'protocol', 'WebSocket'); });
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

    context('stream', () => {
        var c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}});
        c.addEndPoint({name: 'Test', spec: {address: '127.0.0.1'}});
        var s;
        it('runs', async   () => {
            s = await c.stream({route: {retry: {timeout: 1000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}});
        });
        it('returns ok',   () => { assert.isOk(s.stream); });
        it('isa stream',   () => { assert.instanceOf(s.stream, Stream); });
        it('readable',     () => { assert.isOk(s.stream.readable); });
        it('writeable',    () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('correct-byte-stream', (done) => {
            s.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.stream.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            s.stream.write('test');
        });
        it('close', (done) =>{
            // end() will flush the stream, emits an empty string, which makes the test in the
            // above "readable" listener to be rerun with an empty 'data' and fail
            s.stream.removeAllListeners();
            s.stream.on('finish', ()=>{
                assert.isOk(true);
                done();
            });
            s.stream.end('');
        });
        it('runs', async   () => {
            s = await c.stream({route: {retry: {timeout: 1000}},
                                metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}});
        });
        it('correct-datagram-stream', (done) => {
            s.stream.on('readable', () => {
                let data = s.stream.read();
                assert.equal(data, 'test');
                done();
            });
            s.stream.write('test');
        });
        it('close', (done) =>{
            s.stream.removeAllListeners();
            s.stream.on('finish', ()=>{
                assert.isOk(true);
                done();
            });
            s.stream.end();
        });
        it('not-found-endpoint', async () => {
            c.loadbalancer.update([undefined]);
            return await c.stream({name: 'WebSocket'})
                    .then(() => assert(false))
                    .catch(() => assert(true));
        });
        it('runs', async   () => {
            c.loadbalancer.update([c.endpoints[0]]);
            s = await c.stream({route: {retry: {timeout: 1000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}});
        });
        it('close', (done) =>{
            s.stream.removeAllListeners();
            s.stream.on('finish', ()=>{
                assert.isOk(true);
                done();
            });
            s.stream.end();
        });
    });
});
