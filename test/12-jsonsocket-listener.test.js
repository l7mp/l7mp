const udp          = require('dgram');
const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const Net          = require('net');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;

describe('JSONSocketListener', ()  => {
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
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        it('created',      () => {
            l = Listener.create( {
                name: 'JSONSocket',
                spec: { protocol: 'JSONSocket',
                        transport_spec: { protocol: 'UDP', port: 54321 }
                      }
            });
            assert.exists(l);
        });
        it('object',                  () => { assert.isObject(l); });
        it('instanceOf',              () => { assert.instanceOf(l, Listener); });
        it('Emitter',                 () => { assert.instanceOf(l, EventEmitter); });
        it('has-name',                () => { assert.property(l, 'name'); });
        it('has-spec',                () => { assert.property(l, 'spec'); });
        it('has-protocol',            () => { assert.nestedPropertyVal(l, 'spec.protocol', 'JSONSocket'); });
        it('has-transport-spec',      () => { assert.property(l, 'transport'); });
        it('transport-spec-obj',      () => { assert.isObject(l.transport); });
        it('has-transport-spec-spec', () => { assert.nestedProperty(l, 'transport.spec'); });
        it('has-transport-protocol',  () => { assert.nestedPropertyVal(l, 'transport.spec.protocol', 'UDP'); });
        it('has-transport-port',      () => { assert.nestedPropertyVal(l, 'transport.spec.port', 54321); });
    });

    context('#run', () => {
        it('runs', () => { l.run(); assert.exists(l); });
    });

    context('#connect', () => {
        // it('transport-connect', (done) => {
        //     c = new udp.createSocket('udp4');
        //     c.on('connect', () => { assert.isOk(true); done() });
        //     c.connect(54321, 'localhost');
        // });
        it('close-on-invalid-jsonheader', (done) => {
            c = new udp.createSocket('udp4');
            c.on('connect', () => { c.send('dummy'); });
            c.on('error', (e) => { c.unref(); assert.fail(); done(); });
            c.on('close', () => { c.unref(); assert.fail(); done(); });
            c.on('message', (msg) => {
                let header = JSON.parse(msg);
                if(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 400){
                    c.unref(); assert.isOk(true); done();
                } else {
                    c.unref(); assert.fail(); done();
                }
            });
            c.connect(54321, 'localhost');
        });
    });

    // context('emits session', () => {
    //     it('emits',  () => { assert.isOk(s); });
    //     it('session-metadata', () => { assert.property(s, 'metadata'); });
    //     it('session-metadata-name', () => { assert.nestedProperty(s, 'metadata.name'); });
    //     it('session-metadata-IP', () => { assert.nestedProperty(s, 'metadata.IP'); });
    //     it('session-metadata-src-addr', () => { assert.nestedProperty(s, 'metadata.IP.src_addr'); });
    //     it('session-metadata-src-addr', () => { assert.match(s.metadata.IP.src_addr, /127.0.0.1/); });
    //     it('session-metadata-dst-addr', () => { assert.nestedProperty(s, 'metadata.IP.dst_addr'); });
    //     it('session-metadata-dst-addr', () => { assert.match(s.metadata.IP.dst_addr, /127.0.0.1/); });
    //     it('session-metadata-TCP', () => { assert.nestedProperty(s, 'metadata.TCP'); });
    //     it('session-metadata-src-port', () => { assert.nestedProperty(s, 'metadata.TCP.src_port'); });
    //     it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s, 'metadata.TCP.dst_port', 54321); });
    //     it('session-listener', () => { assert.nestedPropertyVal(s, 'listener.origin', 'TCP'); });
    //     it('session-stream', () => { assert.nestedProperty(s, 'listener.stream'); });
    //     it('session-stream', () => { assert.nestedProperty(s, 'listener.origin', 'TCP'); });
    //     it('session-stream', () => { assert.instanceOf(s.listener.stream, Stream) });
    //     it('session-stream-readable',   () => { assert.isOk(s.listener.stream.readable); });
    //     it('session-stream-writeable',  () => { assert.isOk(s.listener.stream.writable); });
    // });

    // context('I/O', () => {
    //     it('read',  (done) => {
    //         s.listener.stream.on('readable', () => {
    //             let data = ''; let chunk;
    //             while (null !== (chunk = s.listener.stream.read())) {
    //                 data += chunk;
    //             }
    //             assert.equal(data, 'test');
    //             done();
    //         });
    //         c.write('test');
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
    //         s.listener.stream.write('test');
    //     });
    //     it('server-stream-end',  () => {
    //         s.listener.stream.removeAllListeners();
    //         c.removeAllListeners();
    //         s.listener.stream.destroy();
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
