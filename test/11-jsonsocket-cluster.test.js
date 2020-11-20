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

const { doesNotMatch } = require('assert');
const udp          = require('dgram');
const Stream       = require('stream');
const { GeneralError } = require('../error.js');
const { DatagramStream } = require('../stream.js');
const assert       = require('chai').assert;
const L7mp         = require('../l7mp.js').L7mp;
const EndPoint     = require('../cluster.js').EndPoint;
const Cluster      = require('../cluster.js').Cluster;
const Session      = require('../session.js').Session;
const LoadBalancer = require('../cluster.js').LoadBalancer;

describe('JSONSocketCluster', ()  => {
    var e, c, s, s_ok, session;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.run();
    });

    context('create - UDP', () => {
        it('created', () => {
            c = Cluster.create({
                name: 'JSONSocket',
                spec: {protocol: 'JSONSocket',
                       transport: { protocol: 'UDP', port: 54321 },
                       // header: [ { path: '/' } ]
                      },
            });
            assert.exists(c);
        });
        it('runs', async    () => { await c.run(); assert.isOk(true); });
        it('object',        () => { assert.isObject(c); });
        it('instanceOf',    () => { assert.instanceOf(c, Cluster); });
        it('has-name',      () => { assert.property(c, 'name'); });
        it('name',          () => { assert.propertyVal(c, 'name', 'JSONSocket'); });
        it('has-spec',      () => { assert.property(c, 'spec'); });
        it('has-protocol',  () => { assert.propertyVal(c, 'protocol', 'JSONSocket'); });
        it('load-balancer', () => { assert.property(c, 'loadbalancer'); });
        it('load-balancer-instanceof', () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
        it('fail-to-create', () => { assert.throws(() => Cluster.create(
            {
                name: 'JSONSocket',
                spec: {
                    protocol: 'JSONSocket'
                }
            }
            ), Error, 'JSONSocketCluster: No transport specified')
        });
    });

    context('endpoins', () => {
        it('add',                 () => { e = c.addEndPoint({name:'JSONSocket', spec:{address:'127.0.0.1'}}); assert.isOk(e); });
        it('exists',              () => { assert.lengthOf(c.endpoints, 1); });
        it('instanceOf',          () => { assert.instanceOf(e, EndPoint); });
        it('equal',               () => { assert.equal(c.endpoints[0].name, 'JSONSocket'); });
        it('endpoint-instanceOf', () => { assert.instanceOf(c.endpoints[0], EndPoint); });
        it('endpoint-protocol',   () => { assert.propertyVal(c.endpoints[0], 'protocol', 'JSONSocket'); });
        it('get',                 () => { let n = c.getEndPoint('JSONSocket'); assert.isOk(n); });
        it('get-instanceOf',      () => { let n = c.getEndPoint('JSONSocket'); assert.instanceOf(n, EndPoint); });
        it('get-name',            () => { let n = c.getEndPoint('JSONSocket'); assert.equal(n.name, 'JSONSocket'); });
        it('get-fail',            () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('delete',              () => { c.deleteEndPoint('JSONSocket'); assert.lengthOf(c.endpoints, 0); });
        it('get-fail',            () => { let n = c.getEndPoint('JSONSocket'); assert.isUndefined(n); });
        it('re-add',              () => { e = c.addEndPoint({name:'JSONSocket', spec:{address:'127.0.0.1'}}); assert.isOk(e); });
        it('re-get',              () => { let n = c.getEndPoint('JSONSocket'); assert.isOk(n); });
    });

    context('#stream()', () => {
        beforeEach(() => {
            s = new udp.createSocket({type:'udp4',reuseAddr:true});
            s.bind(54321);
            s.on('message', (msg, rinfo) => {s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address)});
        });
        afterEach(() => { s.close();s.unref(); });

        it('ok', async () => {
            s.on('error', (e) => { assert.fail(); });
            session = new Session({metadata:{some:{nested:{meta:'data'}}},source:{origin:'JSONSocket',stream:s}});
            session.route = {retry:{timeout:1000}};
            session.name = 'Test';
            s_ok = await c.stream(session);
            assert.isOk(s_ok);
        });
        it('instanceOf',   () => { assert.instanceOf(s_ok.stream, Stream); });
        it('readable',     () => { assert.isOk(s_ok.stream.readable); });
        it('writeable',    () => { assert.isOk(s_ok.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s_ok.endpoint); });
        it('destroyable',  () => { s_ok.stream.end(); assert.isOk(true); });
    });

    context('#stream() + header', () => {
        beforeEach(() => {
            s = new udp.createSocket('udp4');
            s.bind(54321);
            // s.on('error', (e) => { assert.fail(); });
            session = new Session({metadata:{some:{nested:{meta:'data'}}},source:{origin:'JSONSocket',stream:null}});
            session.route = {retry:{timeout:1000}};
            session.name = 'Test';
        });
        afterEach(() => { s.close();s.unref(); });

        it('stream-json-ok', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                try{
                    let header = JSON.parse(msg);
                    assert.isOk(header);
                    return Promise.resolve();
                }catch(x){assert.fail()}
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-header-ok', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                try{
                    let header = JSON.parse(msg);
                    if(header['JSONSocketVersion'] === 1 ){
                        assert.isOk(true);
                        return Promise.resolve();
                    }
                }catch(x){assert.fail()}
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
    });

    context('#stream() + metadata', () => {
        beforeEach(() => {
            s = new udp.createSocket('udp4');
            s.bind(54321);
            s.on('error', (e) => { assert.fail(); });
            session = new Session({metadata:{some:{nested:{meta:'data'}}},source:{origin:'JSONSocket',stream:null}});
            session.route = {retry:{timeout:1000}};
            session.name = 'Test';
        });
        afterEach(() => { s.close();s.unref(); });

        it('cluster-re-create',      () => {
            c = Cluster.create({
                name: 'JSONSocket',
                spec: {protocol: 'JSONSocket',
                       transport: { protocol: 'UDP', port: 54321 },
                       header: [ { path: '/' } ]
                      },
            });
            assert.exists(c);
        });
        it('runs', async      () => { await c.run(); assert.isOk(true); });
        it('object',          () => { assert.isObject(c); });
        it('endpoint-re-add', () => { e = c.addEndPoint({name:'JSONSocket', spec:{address:'127.0.0.1'}}); assert.isOk(e); });
        it('stream-metadata-1', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.property(header, 'some');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-2', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedProperty(header, 'some.nested');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-3', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedProperty(header, 'some.nested.meta');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-4', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedPropertyVal(header, 'some.nested.meta', 'data');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-5', async () => {
            c.header = [ {path: '/some' } ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedPropertyVal(header, 'nested.meta', 'data');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-6', async () => {
            c.header = [ {path: { from: '/some' , to: '/some'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedPropertyVal(header, 'some.nested.meta', 'data');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-7', async () => {
            c.header = [ {path: { from: '/some' , to: '/some'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, {some:{nested: {meta: 'data'}}, JSONSocketVersion: 1});
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-8', async () => {
            c.header = [ {path: { from: '/some' , to: '/'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedPropertyVal(header, 'nested.meta', 'data');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-9', async () => {
            c.header = [ {path: { from: '/some' , to: '/'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, {nested: {meta: 'data'}, JSONSocketVersion: 1});
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-10', async () => {
            c.header = [ {path: { from: '/some' , to: '/'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedPropertyVal(header, 'nested.meta', 'data');
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-11', async () => {
            c.header = [ {path: { from: '/some/nested', to: '/nested'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, {nested: {meta: 'data'}, JSONSocketVersion: 1});
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-12', async () => {
            c.header = [ {path: { from: '/some/nested', to: '/some/nested'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, {some: {nested: {meta: 'data'}}, JSONSocketVersion: 1});
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-12', async () => {
            c.header = [ {path: { from: '/some/nested/meta', to: '/nested'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, {nested: 'data', JSONSocketVersion: 1});
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-13', async () => {
            c.header = [ {path: { from: '/some/nested/meta', to: '/nested/meta'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, {nested: {meta: 'data'}, JSONSocketVersion: 1});
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-14', async () => {
            c.header = [ {path: '/non-existent-path/' } ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, {JSONSocketVersion: 1});
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-15', async () => {
            c.header = [ { set: { key: '/some/nested/meta', value: 'data' } } ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, { some:{nested:{meta:'data'}}, JSONSocketVersion: 1 });
                return Promise.resolve();
            });11
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-16', async () => {
            c.header = [ { set: { key: '/some/nested/meta/', value: 'data' } } ]; // trailing /
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, { some:{nested:{meta:'data'}}, JSONSocketVersion: 1 });
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-17', async () => {
            c.header = [ {path: '/some/nested' },
                         { set: { key: '/some/nested/meta', value: 'data' } },
                         { set: { key: '/some/other/nested/meta', value: 'other-data' } } ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.deepEqual(header, { meta:'data', some:{nested:{meta:'data'},other:{nested:{meta:'other-data'}}}, JSONSocketVersion: 1 });
                return Promise.resolve();
            });
            s_ok = await c.stream(session);
            s_ok.stream.end();
        });
        it('stream-metadata-18', async () => {
            c.header = [ { test: 'test'} ];
            s_ok = await c.stream(session).catch( 
                (err) => {
                    assert.instanceOf(err, GeneralError); 
                });
        });
        it('stream-metadata-19', async () => {
            c.header = [ {path: { from: '/some' , to: '/some'}} ];
            s.on('message', (msg, rinfo) => {
                s.send('{JSONSocketVersion: "1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}', rinfo.port, rinfo.address);
            });
            s_ok = await c.stream(session).catch( 
                (err) => {
                    assert.instanceOf(err, GeneralError); 
                });
        });
        it('stream-metadata-20', async () => {
            c.header = [ {path: { from: '/some' , to: '/some'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: undefined,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
            });
            s_ok = await c.stream(session).catch( 
                (err) => {
                    assert.instanceOf(err, GeneralError); 
                });
        });
        it('stream-metadata-21', async () => {
            c.header = [ {path: { from: '/some' , to: '/some'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: "1",JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
            });
            s_ok = await c.stream(session).catch( 
                (err) => {
                    assert.instanceOf(err, GeneralError); 
                });
        });
        it('stream-metadata-22', async () => {
            c.header = [ {path: { from: '/some' , to: '/some'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 2,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
            });
            s_ok = await c.stream(session).catch( 
                (err) => {
                    assert.instanceOf(err, GeneralError); 
                });
        });
        it('stream-metadata-22', async () => {
            c.header = [ {path: { from: '/some' , to: '/some'}} ];
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 199,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
            });
            s_ok = await c.stream(session).catch( 
                (err) => {
                    assert.instanceOf(err, GeneralError); 
                });
        });
    });

    // we no longer support inline clusters
    // context('create - UDP - inline endpoints', () => {
    //     it('created',         () => {
    //         c = Cluster.create({
    //             name: 'JSONSocket',
    //             spec: {protocol: 'JSONSocket',
    //                    transport: { protocol: 'UDP', port: 54321 }
    //                   },
    //             endpoints: [ { name: 'EP1', spec: { address:'127.0.0.1' } }, { name: 'EP2', spec: { address:'127.0.0.2' } } ]
    //         });
    //         assert.exists(c);
    //     });
    //     it('runs',            async    () => { await c.run(); assert.isOk(true); });
    //     it('object',                   () => { assert.isObject(c); });
    //     it('instanceOf',               () => { assert.instanceOf(c, Cluster); });
    //     it('has-name',                 () => { assert.property(c, 'name'); });
    //     it('name',                     () => { assert.propertyVal(c, 'name', 'JSONSocket'); });
    //     it('has-spec',                 () => { assert.property(c, 'spec'); });
    //     it('has-protocol',             () => { assert.propertyVal(c, 'protocol', 'JSONSocket'); });
    //     it('load-balancer',            () => { assert.property(c, 'loadbalancer'); });
    //     it('load-balancer-instanceof', () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
    //     it('exists',                   () => { assert.lengthOf(c.endpoints, 2); });
    //     it('defined',                  () => { assert.isOk(c.endpoints[0] && c.endpoints[1]); });
    //     it('instanceOf',               () => { assert.instanceOf(c.endpoints[0], EndPoint); });
    //     it('instanceOf',               () => { assert.instanceOf(c.endpoints[1], EndPoint); });
    //     it('equal - 1',                () => { assert.equal(c.endpoints[0].name, 'EP1'); });
    //     it('equal - 1',                () => { assert.equal(c.endpoints[1].name, 'EP2'); });
    //     it('endpoint-instanceOf - 1',  () => { assert.instanceOf(c.endpoints[0], EndPoint); });
    //     it('endpoint-instanceOf - 1',  () => { assert.instanceOf(c.endpoints[1], EndPoint); });
    //     it('endpoint-protocol - 1',    () => { assert.propertyVal(c.endpoints[0], 'protocol', 'JSONSocket'); });
    //     it('endpoint-protocol - 2',    () => { assert.propertyVal(c.endpoints[1], 'protocol', 'JSONSocket'); });
    //     it('get - 1',                  () => { let n = c.getEndPoint('EP1'); assert.isOk(n); });
    //     it('get - 2',                  () => { let n = c.getEndPoint('EP2'); assert.isOk(n); });
    //     it('get-instanceOf - 1',       () => { let n = c.getEndPoint('EP1'); assert.instanceOf(n, EndPoint); });
    //     it('get-instanceOf - 2',       () => { let n = c.getEndPoint('EP2'); assert.instanceOf(n, EndPoint); });
    //     it('get-name - 1',             () => { let n = c.getEndPoint('EP1'); assert.equal(n.name, 'EP1'); });
    //     it('get-name - 2',             () => { let n = c.getEndPoint('EP2'); assert.equal(n.name, 'EP2'); });
    //     it('get-fail',                 () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
    //     it('delete',                   () => { c.deleteEndPoint('EP1'); assert.lengthOf(c.endpoints, 1); });
    //     it('get-fail',                 () => { let n = c.getEndPoint('EP1'); assert.isUndefined(n); });
    // });

});
