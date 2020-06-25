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

    // after( () => {
    //     wss.close();
    // })

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
        c.addEndPoint(EndPoint.create({protocol: 'WebSocket', name: 'WebSocket', spec: {port: 8080, bind: {address: '127.0.0.1', port: 8080}}},{spec: {address: '127.0.0.1', port: 8080}})); 
        var endpoint = c.endpoints[0];
        it('runs',             () => { assert.exists(c.endpoints); });
        it('object',           () => { assert.isObject(endpoint); });
        it('instanceOf',       () => { assert.instanceOf(endpoint, EndPoint); });
        it('has-name',         () => { assert.property(endpoint, 'name'); });
        it('equal',            () => { assert.equal(endpoint.name, 'WebSocket-EndPoint-0'); });
        it('has-spec',         () => { assert.property(endpoint, 'spec'); });
        it('has-protocol',     () => { assert.deepPropertyVal(endpoint, 'protocol', 'WebSocket'); });
        it('get',              () => { let n = c.getEndPoint('WebSocket-EndPoint-0'); assert.isOk(n); });
        it('get-instanceOf',   () => { let n = c.getEndPoint('WebSocket-EndPoint-0'); assert.instanceOf(n, EndPoint); });
        it('get-name',         () => { let n = c.getEndPoint('WebSocket-EndPoint-0'); assert.equal(n.name, 'WebSocket-EndPoint-0'); });
        it('get-fail',         () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('delete',           () => { c.deleteEndPoint('WebSocket-EndPoint-0'); assert.lengthOf(c.endpoints, 0); });
        it('get-fail',         () => { let n = c.getEndPoint('WebSocket'); assert.isUndefined(n); });
        it('re-add',           () => { e = c.addEndPoint({name: 'WebSocket', spec: {}}); assert.isOk(e); });
        it('get-2',            () => { let n = c.getEndPoint('WebSocket'); assert.isOk(n); });
        it('get-2-name',       () => { let n = c.getEndPoint('WebSocket'); assert.equal(n.name, 'WebSocket'); });
    });

    context('stream', () => {
        var c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}});
        c.addEndPoint(EndPoint.create({protocol: 'WebSocket', name: 'WebSocket', spec: {port: 8080, bind: {address: '127.0.0.1', port: 8080}}},{spec: {address: '127.0.0.1', port: 8080}})); 
        var s;
        it('runs', async   () => { s = await c.stream({route: {retry: {timeout: 1000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}});});
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
        it('Not-found-endpoint', async () => {
            c.loadbalancer.update([undefined]);
            return await c.stream({name: 'WebSocket'})
                    .then(() => assert(false))
                    .catch(() => assert(true));
        });
        it('fail-timeout', async () => {
            s = await c.stream({route:{retry:{timeout:100}}}).
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
            c.loadbalancer.update([e]); 
            let i = 0;
            let s1 = await c.stream({route:{retry:{timeout:2000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}}).then(
                async () => {
                    let s2 = await c.stream({route:{retry:{timeout:2000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}}).then(
                        () => { assert.isOk(true); },
                        async () => {
                            let s3 = await c.stream({route:{retry:{timeout:2000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}}).then(
                                async () => {
                                    let s4 = await c.stream({route:{retry:{timeout:2000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}}).then(
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