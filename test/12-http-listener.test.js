const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const Net          = require('net');
const http         = require('http');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;

describe('HTTPListener', () => {
    var l, s, c;
    var readers = {};
    var reader = (name, stream, done) => {
        let f = () => {
            let data = ''; let chunk;
            while (null !== (chunk = stream.read())) {
                data += chunk;
            }
            assert.equal(data, 'test');
            done();
        };
        readers[name] = f;
        return f;
    };

    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        it('created',      () => { l = Listener.create( {name: 'HTTP', spec: { protocol: 'HTTP', port: 12345 }}); assert.exists(l); });
        it('object',       () => { assert.isObject(l); });
        it('instanceOf',   () => { assert.instanceOf(l, Listener); });
        it('Emitter',      () => { assert.instanceOf(l, EventEmitter); });
        it('has-name',     () => { assert.property(l, 'name'); });
        it('has-spec',     () => { assert.property(l, 'spec'); });
        it('has-protocol', () => { assert.nestedPropertyVal(l, 'spec.protocol', 'HTTP'); });
        it('has-port',     () => { assert.nestedPropertyVal(l, 'spec.port', 12345); });
        it('can-listen',   () => { l.emitter = (x) => { s = x }; assert.isOk(true); });
    });

    context('#run', () => {
        it('runs', () => { 
            l.run(); 
            var req = new Stream.Readable();
            req.connection = { 
                remoteAddress: '127.0.0.1', 
                remotePort: 12345, 
                localAddress: '127.0.0.1', 
                localPort: 12345
            };
            req.httpVersion = 'HTTP/1.0';
            req.method = 'GET';
            req.url = '127.0.0.1';
            req._read = function () {};
            var res = new Stream.Writable();
            l.server.emit('request', req, res); 
            assert.exists(l); 
        });
    });

    context('#connect', () => {
        it('connect',    (done) => { c = new Net.connect({port: 12345}, () => { assert.isOk(true); done(); }) });
        // it('connect', (done) => { 
        //     // const req = http.request({
        //     //     port: 12345,
        //     //     host: '127.0.0.1',
        //     //     method: 'POST',
        //     //     body: 'test'
        //     // });
        //     l.write('GET / HTTP/1.0\r\n' +
        //          'Host: 127.0.0.1:12345\r\n' +
        //          'Connection: close\r\n' +
        //          '\r\n');
        // console.log(s); done(); }); 
        it('address',        () => { assert.equal(c.localAddress, '127.0.0.1'); });
        it('remote-address', () => { assert.equal(c.remoteAddress, '127.0.0.1'); });
        it('remote-port',    () => { assert.equal(c.remotePort, 12345); });
        it('isa stream',     () => { assert.instanceOf(c, Stream); });
        it('readable',       () => { assert.isOk(c.readable); });
        it('writeable',      () => { assert.isOk(c.writable); });
    });

    context('emits session', () => {
        it('emits',                        () => { assert.isOk(s); });
        it('session-metadata',             () => { assert.property(s, 'metadata'); });
        it('session-metadata-name',        () => { assert.nestedProperty(s, 'metadata.name'); });
        it('session-metadata-IP',          () => { assert.nestedProperty(s, 'metadata.IP'); });
        it('session-metadata-src-addr',    () => { assert.nestedProperty(s, 'metadata.IP.src_addr'); });
        it('session-metadata-src-addr',    () => { assert.match(s.metadata.IP.src_addr, /127.0.0.1/); });
        it('session-metadata-dst-addr',    () => { assert.nestedProperty(s, 'metadata.IP.dst_addr'); });
        it('session-metadata-dst-addr',    () => { assert.match(s.metadata.IP.dst_addr, /127.0.0.1/); });
        it('session-metadata-TCP',         () => { assert.nestedProperty(s, 'metadata.TCP'); });
        it('session-metadata-src-port',    () => { assert.nestedProperty(s, 'metadata.TCP.src_port'); });
        it('session-metadata-dst-port',    () => { assert.nestedPropertyVal(s, 'metadata.TCP.dst_port', 12345); });
        it('session-metadata-http',        () => { assert.nestedProperty(s, 'metadata.HTTP'); });
        it('session-metadata-http-ver',    () => { assert.equal(s.metadata.HTTP.version, 'HTTP/1.0'); });
        it('session-metadata-http-method', () => { assert.equal(s.metadata.HTTP.method, 'GET'); });
        it('session-metadata-http-url',    () => { assert.isObject(s.metadata.HTTP.url); });
        it('session-listener',             () => { assert.nestedPropertyVal(s, 'source.origin', 'HTTP'); });
        it('session-stream',               () => { assert.nestedProperty(s, 'source.stream'); });
        it('session-stream',               () => { assert.instanceOf(s.source.stream, Stream) });
        it('session-stream-readable',      () => { assert.isOk(s.source.stream.readable); });
        it('session-stream-writeable',     () => { assert.isOk(s.source.stream.writable); });
        it('session-stream-priv-readable', () => { assert.instanceOf(s.priv.req, Stream.Readable); });
        it('session-stream-priv-writable', () => { assert.instanceOf(s.priv.res, Stream.Writable); });
    });

    // context('I/O', () => {
    //     it('read', (done) => {
    //         s.source.stream.on('readable', () => {
    //             let data = ''; let chunk;
    //             while (null !== (chunk = s.source.stream.read())) {
    //                 data += chunk;
    //             }
    //             assert.equal(data, 'test');
    //             done();
    //         });

    //         console.log(c.write(`
    //             GET / HTTP/1.0
    //             Host: 127.0.0.1:12345
    //         `));     
    //     });
    //     it('write',  (done) => {
    //         c.on('readable', () => {
    //             let data = ''; let chunk;
    //             while (null !== (chunk = c.read())) {
    //                 data += chunk;
    //             }
    //             assert.equal(data, 'test');
    //             done();
    //         });
    //         s.source.stream.write('test');
    //     });
    //     it('server-stream-end',  () => {
    //         s.source.stream.removeAllListeners();
    //         c.removeAllListeners();
    //         s.source.stream.destroy();
    //         assert.isOk(true);
    //     });
    //     it('client-stream-end',  () => { c.destroy(); assert.isOk(true); });
    // });

    context('stop', () => {
        it('stop-server',  () => {
            l.close();
            assert.isOk(true);
        });
    });
});