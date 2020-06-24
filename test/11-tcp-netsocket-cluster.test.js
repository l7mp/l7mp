const Stream  = require('stream');
const assert  = require('chai').assert;
const L7mp    = require('../l7mp.js').L7mp;
const Cluster = require('../cluster.js').Cluster;
const EndPoint = require('../cluster.js').EndPoint;
const LoadBalancer = require('../cluster.js').LoadBalancer;

describe('TCP-NetSocketCluster', ()  => {
    var s;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        var c;
        it('runs',         () => { assert.exists(c = Cluster.create({name: 'TCP', spec: {protocol: 'TCP'}})); });
        it('object',       () => { assert.isObject(c); });
        // EchoCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(c, 'spec', {protocol: 'TCP'}); });
    });

    context('endpoints', () => {
        var c = Cluster.create({name: 'TCP', spec: {protocol: 'TCP'}});

        var e;
        it('add',                 () => { e = c.addEndPoint({name: 'TCPNetSocket', spec: {address: '127.0.0.1'}}); assert.isOk(e); });
        it('exists',              () => { assert.lengthOf(c.endpoints, 1); });
        it('instanceOf',          () => { assert.instanceOf(e, EndPoint); });
        it('equal',               () => { assert.equal(c.endpoints[0].name, 'TCPNetSocket'); });
        it('endpoint-instanceOf', () => { assert.instanceOf(c.endpoints[0], EndPoint); });
        it('endpoint-protocol',   () => { assert.propertyVal(c.endpoints[0], 'protocol', 'TCP'); });
        it('get',                 () => { let n = c.getEndPoint('TCPNetSocket'); assert.isOk(n); });
        it('get-instanceOf',      () => { let n = c.getEndPoint('TCPNetSocket'); assert.instanceOf(n, EndPoint); });
        it('get-name',            () => { let n = c.getEndPoint('TCPNetSocket'); assert.equal(n.name, 'TCPNetSocket'); });
        it('get-fail',            () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('delete',              () => { c.deleteEndPoint('TCPNetSocket'); assert.lengthOf(c.endpoints, 0); });
        it('get-fail',            () => { let n = c.getEndPoint('TCPNetSocket'); assert.isUndefined(n); });
        it('re-add',              () => { e = c.addEndPoint({name: 'TCPNetSocket', spec: {address: '127.0.0.1'}}); assert.isOk(e); });
        it('get-2',               () => { let n = c.getEndPoint('TCPNetSocket'); assert.isOk(n); });
        it('get-2-name',          () => { let n = c.getEndPoint('TCPNetSocket'); assert.equal(n.name, 'TCPNetSocket'); });
    });

    context('stream()', () => {
        var c = Cluster.create({name: 'TCP', protocol: 'TCP', spec: {protocol: 'TCP', port: 16000 , bind: {address: "127.0.0.1", port: 16000}}});
        var e = c.addEndPoint({name: 'TCPNetSocket', spec: {address: '127.0.0.1'}})
        it('runs', async   () => { s = await c.stream({route:{retry:{timeout:1000}}})});
        it('returns ok',   () => { assert.isOk(s.stream); });
        it('isa stream',   () => { assert.instanceOf(s.stream, Stream); });
        it('readable',     () => { assert.isOk(s.stream.readable); });
        it('writeable',    () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('correct-byte-stream',  (done) => {
            s.stream.once('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk =  s.stream.read())) {
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
            await c.stream({route:{retry:{timeout:100}}}).catch(() => {
                assert.isOk(true);
            });
        });
        it('close',(done) =>{
            s.stream.on('finish', ()=>{
                assert.isOk(true);
                done();
            });
            s.stream.end();
        });
    });
});
