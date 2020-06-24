const Stream   = require('stream');
const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const EndPoint = require('../cluster.js').EndPoint;
const net      = require('net');

describe('NetSocketEndPoint', ()  => {
    var e, s_ok, server;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
        //should stop after
        var server = net.createServer(function(socket){
            socket.pipe(socket);
        });
        server.listen(16001,"127.0.0.1")
    });

    context('create', () => {
        it('runs',         () => { assert.exists(e = EndPoint.create(
            {protocol: 'TCP', spec: {port: 16001}},
            {name: 'NetSocket', spec: {address: 'localhost'}})); });
        //, bind: {address: "127.0.0.1", port: 16000}
        it('object',       () => { assert.isObject(e); });
        // EchoCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(e, EndPoint); });
        it('has-name',     () => { assert.property(e, 'name'); });
        it('has-spec',     () => { assert.property(e, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(e, 'protocol', 'TCP'); });
    });

    context('#connect()', () => {
        it('ok', (done) => {
            s_ok = e.connect({});
            s_ok.on('connect', () => {
                assert.isOk(true);
                s_ok.destroy()
                done();
            });
        });
        it('exists',     () => { assert.isOk(s_ok); });
        it('instanceOf', () => { assert.instanceOf(s_ok, net.Socket); });
        // it('readable',   () => {
        //     let s = e.connect({});
        //     assert.isOk(s.readable);
        //     s.destroy();
        //  });
        // it('writeable',  () => {
        //     let s = e.connect({});
        //     assert.isOk(s.writable);
        //     s.destroy()
        // });
        it('ready', (done) => {
            let s = e.connect({});
            s.on('ready', () => {
                assert.isOk(true);
                s.destroy();
                done();
            });
        });
        it('lookup', (done) => {
           let s = e.connect({});
           s.on('lookup', () => {
               assert.isOk(true);
               done();
           });
            s.destroy();
        });
        it('data', (done) => {
            let s = e.connect({});
            s.setEncoding("utf8")
            s.write('test');
            s.on('data', (data) => {
                assert.strictEqual(data, 'test')
                s.destroy();
                done();
            })
        });
        it('close', (done) => {
            let s = e.connect({});
            s.end();
            s.on('close', () => {
                assert.isOk(true);
                done();
            });
            s.destroy();
        });
        it('timeout', (done) => {
           let s = e.connect({});
           s.setTimeout(300);
           s.on('timeout', () => {
               assert.isOk(true);
               s.destroy();
               done();
           });
        });
    });
});
