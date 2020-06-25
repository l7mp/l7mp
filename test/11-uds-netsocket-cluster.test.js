const Stream  = require('stream');
const assert  = require('chai').assert;
const L7mp    = require('../l7mp.js').L7mp;
const Cluster = require('../cluster.js').Cluster;
const EndPoint = require('../cluster.js').EndPoint;
const fs = require('fs');
const net      = require('net');
const {PassThrough} = require('stream');


describe('UDS-NetSocketCluster', ()  => {
    var s, unixSocketServer;
    before( () => {
        unixSocketServer = net.createServer();
        unixSocketServer.listen('/tmp/unixSocket.sock', () => {
        });
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    after( () => {
       // fs.unlink('/tmp/unixSocket.sock',(err => {
       //      if(err) {
       //          console.log(err);
       //      }
       //      console.log('unlinked')
       // }));
       unixSocketServer.close();
    });

    context('create', () => {
        var c;
        it('runs',         () => { assert.exists(c = Cluster.create({name: 'UnixDomainSocket', spec: {protocol: 'UnixDomainSocket'}})); });
        it('object',       () => { assert.isObject(c); });
        // EchoCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(c, 'spec', {protocol: 'UnixDomainSocket'}); });
    });

    context('endpoints', () => {
        var c = Cluster.create({name: 'UnixDomainSocket', spec: {protocol: 'UnixDomainSocket'}});
        var e;
        it('add',                 () => { e = c.addEndPoint({name: 'UDSNetSocket', spec: {address: '/tmp/unixSocket.sock'}}); assert.isOk(e); });
        it('exists',              () => { assert.lengthOf(c.endpoints, 1); });
        it('instanceOf',          () => { assert.instanceOf(e, EndPoint); });
        it('equal',               () => { assert.equal(c.endpoints[0].name, 'UDSNetSocket'); });
        it('endpoint-instanceOf', () => { assert.instanceOf(c.endpoints[0], EndPoint); });
        it('endpoint-protocol',   () => { assert.propertyVal(c.endpoints[0], 'protocol', 'UnixDomainSocket'); });
        it('get',                 () => { let n = c.getEndPoint('UDSNetSocket'); assert.isOk(n); });
        it('get-instanceOf',      () => { let n = c.getEndPoint('UDSNetSocket'); assert.instanceOf(n, EndPoint); });
        it('get-name',            () => { let n = c.getEndPoint('UDSNetSocket'); assert.equal(n.name, 'UDSNetSocket'); });
        it('get-fail',            () => { let n = c.getEndPoint('Never'); assert.isUndefined(n); });
        it('delete',              () => { c.deleteEndPoint('UDSNetSocket'); assert.lengthOf(c.endpoints, 0); });
        it('get-fail',            () => { let n = c.getEndPoint('UDSNetSocket'); assert.isUndefined(n); });
        it('re-add',              () => { e = c.addEndPoint({name: 'UDSNetSocket', spec: {address: '/tmp/unixSocket.sock'}}); assert.isOk(e); });
        it('get-2',               () => { let n = c.getEndPoint('UDSNetSocket'); assert.isOk(n); });
        it('get-2-name',          () => { let n = c.getEndPoint('UDSNetSocket'); assert.equal(n.name, 'UDSNetSocket'); });
    });

    context('stream()', () => {
        var c = Cluster.create({name: 'UnixDomainSocket',protocol: 'UnixDomainSocket', spec: {protocol: 'UnixDomainSocket'}});
        var e = c.addEndPoint({name: 'UDSNetSocket', spec: {address: '/tmp/unixSocket.sock'}})
        it('runs', async   () => { s = await c.stream({ route:{retry:{timeout:1000}}})});
        it('returns ok',   () => { assert.isOk(s.stream); });
        it('isa stream',   () => { assert.instanceOf(s.stream, Stream); });
        it('readable',     () => { assert.isOk(s.stream.readable); });
        it('writable',    () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('close-1',(done) =>{
            s.stream.on('finish', ()=>{
                assert.isOk(true);
                done();
            });
            s.stream.end();
        });
        it('correct-byte-stream',  async () => {
            // create an UDS echo server
            fs.unlink('/tmp/unixSocket.sock', () => {});
            const server = net.createServer((c) => { c.pipe(c); });
            server.listen('/tmp/unixSocket.sock');
            s = await c.stream({ route:{retry:{timeout:1000}}});
            s.stream.once('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk =  s.stream.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                server.close();
                return Promise.resolve();
            });
            s.stream.write('test');
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
        it('close-2',(done) =>{
            s.stream.on('finish', ()=>{
                assert.isOk(true);
                done();
            });
            s.stream.end();
        });
    });
});
