const Stream   = require('stream');
const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const Cluster  = require('../cluster.js').Cluster;
const EndPoint = require('../cluster.js').EndPoint;
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
        it('runs',         () => { assert.exists(c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}})); });
        it('object',       () => { assert.isObject(c); });
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(c, 'spec', {protocol: 'WebSocket'}); });
    });

    context('addEndPoint', () => {
        c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}});
        c.addEndPoint(EndPoint.create({protocol: 'WebSocket', spec: {port: 8080, bind: {address: '127.0.0.1', port: 8080}}},{spec: {address: '127.0.0.1', port: 8080}})); 
        var endpoint = c.endpoints[0];
        it('runs',         () => { assert.exists(c.endpoints); });
        it('object',       () => { assert.isObject(endpoint); });
        it('instanceOf',   () => { assert.instanceOf(endpoint, EndPoint); });
        it('has-name',     () => { assert.property(endpoint, 'name'); });
        it('has-spec',     () => { assert.property(endpoint, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(endpoint, 'protocol', 'WebSocket'); });
    });

    context('stream', () => {
        var c = Cluster.create({name: 'WebSocket', spec: {protocol: 'WebSocket'}});
        c.addEndPoint({spec: {address: '127.0.0.1', port: 8080}}); 
        var s;
        it('runs', async   () => { s = await c.stream({route: {retry: {timeout: 2000}}, metadata: {HTTP: {url: {host: '127.0.0.1', port: 8080}}}}); });
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
    });
});