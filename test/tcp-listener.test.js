const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const Net          = require('net');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;

describe('TCPListener', ()  => {
    var l;
    var s;
    var c;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        it('runs',         () => { l = Listener.create( {name: 'TCP', spec: { protocol: 'TCP', port: 54321 }}); assert.exists(l); });
        it('object',       () => { assert.isObject(l); });
        // TCPListener is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(l, Listener); });
        it('Emitter',      () => { assert.instanceOf(l, EventEmitter); });
        it('has-name',     () => { assert.property(l, 'name'); });
        it('has-spec',     () => { assert.property(l, 'spec'); });
        it('has-protocol', () => { assert.nestedPropertyVal(l, 'spec.protocol', 'TCP'); });
        it('has-port',     () => { assert.nestedPropertyVal(l, 'spec.port', 54321); });
        it('can-listen',   () => { l.on('emit', (x) => { s = x }); assert.isOk(true); });
    });

    context('#connect', () => {
        it('connect', (done) => { c = new Net.connect({port: 54321}, () => { assert.isOk(true); done; }) });
        it('address', () => { assert.equal(c.localAddress, '127.0.0.1'); });
        it('remote-address', () => { assert.equal(c.remoteAddress, '127.0.0.1'); });
        it('remote-port', () => { assert.equal(c.remoteAddress, 54321); });
        it('isa stream', () => { assert.instanceOf(c, Stream); });
        it('readable',   () => { assert.isOk(c.readable); });
        it('writeable',  () => { assert.isOk(c.writable); });
    });

    context('emits session', () => {
        it('emits',  () => { assert.isOk(s); });
        it('session-instanceOf',   () => { assert.instanceOf(s, Session); });
        it('session-metadata', () => { assert.property(s, 'metadata'); });
        it('session-metadata-name', () => { assert.nestedProperty(s, 'metadata.name'); });
        it('session-metadata-IP', () => { assert.nestedProperty(s, 'metadata.IP'); });
        it('session-metadata-src-addr', () => { assert.nestedPropertyVal(s, 'metadata.IP.src_addr', '127.0.0.1'); });
        it('session-metadata-dst-addr', () => { assert.nestedPropertyVal(s, 'metadata.IP.dst_addr', '127.0.0.1'); });
        it('session-metadata-TCP', () => { assert.nestedProperty(s, 'metadata.TCP'); });
        it('session-metadata-src-port', () => { assert.nestedProperty(s, 'metadata.TCP.src_port'); });
        it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s, 'metadata.TCP.dst_port', 54321); });
        it('session-listener', () => { assert.nestedPropertyVal(s, 'listener.origin', 'TCP'); });
        it('session-stream', () => { assert.nestedProperty(s, 'listener.stream'); });
        it('session-stream', () => { assert.nestedProperty(s, 'listener.origin', 'TCP'); });
        it('session-stream', () => { assert.instanceOf(s.listener.stream, 'Stream') });
        it('session-stream-readable',   () => { assert.isOk(s.listener.stream.readable); });
        it('session-stream-writeable',  () => { assert.isOk(s.listener.stream.writable); });
    });

    context('I/O', () => {
        it('read',  (done) => {
            s.listener.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.listener.stream.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            c.write('test');
        });
        it('write',  (done) => {
            c.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = c.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            s.listener.stream.write('test');
        });
    });
});
