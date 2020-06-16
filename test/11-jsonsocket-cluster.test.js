const udp          = require('dgram');
const Stream       = require('stream');
const assert       = require('chai').assert;
const L7mp         = require('../l7mp.js').L7mp;
const EndPoint     = require('../cluster.js').EndPoint;
const Cluster      = require('../cluster.js').Cluster;
const LoadBalancer = require('../cluster.js').LoadBalancer;

describe('JSONSocketCluster', ()  => {
    var e, c, s, s_ok;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'warn' });
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.run();
    });

    context('create - UDP', () => {
        it('runs',         () => {
            c = Cluster.create({
                name: 'JSONSocket',
                spec: {protocol: 'JSONSocket',
                       transport: { protocol: 'UDP', port: 54321 }
                      },
            });
            assert.exists(c);
        });
        it('object',        () => { assert.isObject(c); });
        it('instanceOf',    () => { assert.instanceOf(c, Cluster); });
        it('has-name',      () => { assert.property(c, 'name'); });
        it('name',          () => { assert.propertyVal(c, 'name', 'JSONSocket'); });
        it('has-spec',      () => { assert.property(c, 'spec'); });
        it('has-protocol',  () => { assert.propertyVal(c, 'protocol', 'JSONSocket'); });
        it('load-balancer', () => { assert.property(c, 'loadbalancer'); });
        it('load-balancer-instanceof', () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
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
            s_ok = await c.stream({metadata:{some:{nested:{meta:'data'}}},route:{retry:{timeout:1000}}});
            assert.isOk(true);
        });
        it('exists',      () => { assert.isOk(s_ok); });
        it('instanceOf',  () => { assert.instanceOf(s_ok, Stream); });
        it('readable',    () => { assert.isOk(s_ok.readable); });
        it('writeable',   () => { assert.isOk(s_ok.writable); });
        it('destroyable', () => { s_ok.end(); assert.isOk(true); });
    });

    context('#stream() + metadata', () => {
        beforeEach(() => {
            s = new udp.createSocket('udp4');
            s.bind(54321);
            // s.on('error', (e) => { assert.fail(); });
        });
        afterEach(() => { s.close();s.unref(); });

        it('stream-json-ok', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                try{
                    let header = JSON.parse(msg);
                    return Promise.resolve();
                }catch(x){assert.fail()}
            });
            s_ok = await c.stream({metadata:{some:{nested:{meta:'data'}}},route:{retry:{timeout:1000}}});
            s_ok.end();
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
            s_ok = await c.stream({metadata:{some:{nested:{meta:'data'}}},route:{retry:{timeout:1000}}});
            s_ok.end();
        });
        it('stream-metadata-1', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.property(header, 'some');
                return Promise.resolve();
            });
            s_ok = await c.stream({metadata:{some:{nested:{meta:'data'}}},route:{retry:{timeout:1000}}});
            s_ok.end();
        });
        it('stream-metadata-2', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedProperty(header, 'some.nested');
                return Promise.resolve();
            });
            s_ok = await c.stream({metadata:{some:{nested:{meta:'data'}}},route:{retry:{timeout:1000}}});
            s_ok.end();
        });
        it('stream-metadata-3', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedProperty(header, 'some.nested.meta');
                return Promise.resolve();
            });
            s_ok = await c.stream({metadata:{some:{nested:{meta:'data'}}},route:{retry:{timeout:1000}}});
            s_ok.end();
        });
        it('stream-metadata-4', async () => {
            s.on('message', (msg, rinfo) => {
                s.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}), rinfo.port, rinfo.address);
                let header = JSON.parse(msg);
                assert.nestedPropertyVal(header, 'some.nested.meta', 'data');
                return Promise.resolve();
            });
            s_ok = await c.stream({metadata:{some:{nested:{meta:'data'}}},route:{retry:{timeout:1000}}});
            s_ok.end();
        });
    });

    context('create - UDP - inline endpoints', () => {
        it('runs',         () => {
            c = Cluster.create({
                name: 'JSONSocket',
                spec: {protocol: 'JSONSocket',
                       transport: { protocol: 'UDP', port: 54321 }
                      },
                endpoints: [ { name: 'EP1', spec: { address:'127.0.0.1' } }, { name: 'EP2', spec: { address:'127.0.0.2' } } ]
            });
            assert.exists(c);
        });
        it('object',                   () => { assert.isObject(c); });
        it('instanceOf',               () => { assert.instanceOf(c, Cluster); });
        it('has-name',                 () => { assert.property(c, 'name'); });
        it('name',                     () => { assert.propertyVal(c, 'name', 'JSONSocket'); });
        it('has-spec',                 () => { assert.property(c, 'spec'); });
        it('has-protocol',             () => { assert.propertyVal(c, 'protocol', 'JSONSocket'); });
        it('load-balancer',            () => { assert.property(c, 'loadbalancer'); });
        it('load-balancer-instanceof', () => { assert.instanceOf(c.loadbalancer, LoadBalancer); });
        it('exists',                   () => { assert.lengthOf(c.endpoints, 2); });
        it('defined',                  () => { assert.isOk(c.endpoints[0] && c.endpoints[1]); });
        it('instanceOf',               () => { assert.instanceOf(c.endpoints[0], EndPoint); });
        it('instanceOf',               () => { assert.instanceOf(c.endpoints[1], EndPoint); });
        it('equal - 1',                () => { assert.equal(c.endpoints[0].name, 'EP1'); });
        it('equal - 1',                () => { assert.equal(c.endpoints[1].name, 'EP2'); });
        it('endpoint-instanceOf - 1',  () => { assert.instanceOf(c.endpoints[0], EndPoint); });
        it('endpoint-instanceOf - 1',  () => { assert.instanceOf(c.endpoints[1], EndPoint); });
        it('endpoint-protocol - 1',    () => { assert.propertyVal(c.endpoints[0], 'protocol', 'JSONSocket'); });
        it('endpoint-protocol - 2',    () => { assert.propertyVal(c.endpoints[1], 'protocol', 'JSONSocket'); });
        it('get - 1',                  () => { let n = c.getEndPoint('EP1'); assert.isOk(n); });
        it('get - 2',                  () => { let n = c.getEndPoint('EP2'); assert.isOk(n); });
        it('get-instanceOf - 1',       () => { let n = c.getEndPoint('EP1'); assert.instanceOf(n, EndPoint); });
        it('get-instanceOf - 2',       () => { let n = c.getEndPoint('EP2'); assert.instanceOf(n, EndPoint); });
        it('get-name - 1',             () => { let n = c.getEndPoint('EP1'); assert.equal(n.name, 'EP1'); });
        it('get-name - 2',             () => { let n = c.getEndPoint('EP2'); assert.equal(n.name, 'EP2'); });
        it('get-fail',                 () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('delete',                   () => { c.deleteEndPoint('EP1'); assert.lengthOf(c.endpoints, 1); });
        it('get-fail',                 () => { let n = c.getEndPoint('EP1'); assert.isUndefined(n); });
    });

});
