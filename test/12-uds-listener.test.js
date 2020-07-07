const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const Net          = require('net');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;

describe('UDSListener', ()  => {
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
        it('created',      () => { l = Listener.create( {name: 'UnixDomainSocket', spec: { protocol: 'UnixDomainSocket', filename: '/tmp/unixSocket.sock' }}); assert.exists(l); });
        it('object',       () => { assert.isObject(l); });
        it('instanceOf',   () => { assert.instanceOf(l, Listener); });
        it('Emitter',      () => { assert.instanceOf(l, EventEmitter); });
        it('has-name',     () => { assert.property(l, 'name'); });
        it('has-spec',     () => { assert.property(l, 'spec'); });
        it('has-protocol', () => { assert.nestedPropertyVal(l, 'spec.protocol', 'UnixDomainSocket'); });
        it('has-port',     () => { assert.nestedPropertyVal(l, 'spec.filename', '/tmp/unixSocket.sock'); });
        it('can-listen',   () => { l.emitter=(x) =>{ s = x }; assert.isOk(true); });
    });

    context('#run', () => {
        it('runs', () => { l.run(); assert.exists(l); });
    });

    context('#connect', () => {
        it('connect',    (done) => { c = new Net.connect({path: '/tmp/unixSocket.sock'}, () => { assert.isOk(true); done(); }) });
        it('isa stream',     () => { assert.instanceOf(c, Stream); });
        it('readable',       () => { assert.isOk(c.readable); });
        it('writeable',      () => { assert.isOk(c.writable); });
    });

    context('emits session', () => {
        it('emits',                     () => { assert.isOk(s); });
        it('session-metadata',          () => { assert.property(s, 'metadata'); });
        it('session-metadata-name',     () => { assert.nestedProperty(s, 'metadata.name'); });
        it('session-metadata-UNIX',      () => { assert.nestedProperty(s, 'metadata.UNIX'); });
        it('session-metadata-filename', () => { console.log(s.metadata.UNIX.filename);assert.nestedProperty(s, 'metadata.UNIX.filename'); });
        it('session-listener',          () => { assert.nestedPropertyVal(s, 'source.origin', 'UnixDomainSocket'); });
        it('session-stream',            () => { assert.nestedProperty(s, 'source.stream'); });
        it('session-stream',            () => { assert.nestedProperty(s, 'source.origin', 'UnixDomainSocket'); });
        it('session-stream',            () => { assert.instanceOf(s.source.stream, Stream) });
        it('session-stream-readable',   () => { assert.isOk(s.source.stream.readable); });
        it('session-stream-writeable',  () => { assert.isOk(s.source.stream.writable); });
    });

    context('I/O', () => {
        it('read',  (done) => {
            s.source.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.source.stream.read())) {
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
            s.source.stream.write('test');
        });
        it('server-stream-end',  () => {
            s.source.stream.removeAllListeners();
            c.removeAllListeners();
            s.source.stream.destroy();
            assert.isOk(true);
        });
        it('client-stream-end',  () => { c.destroy(); assert.isOk(true); });
    });

    context('stop', () => {
        it('stop-server',  () => {
            l.close();
            assert.isOk(true);
        });
    });
});
