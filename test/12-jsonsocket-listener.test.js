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
                        transport: { protocol: 'UDP', port: 54321 }
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
        it('can-listen',              () => { l.on('emit', (x) => { s = x }); assert.isOk(true); });
    });

    context('#run', () => {
        it('runs', () => { l.run(); assert.exists(l); });
    });

    context('#connect', () => {
        beforeEach(() => { c = new udp.createSocket('udp4')});
        afterEach(() => { c.unref(); });

        it('close-on-invalid-jsonheader-invalid-json', (done) => {
            c.on('connect', () => { c.send('dummy'); });
            c.on('error', (e) => { assert.fail(); });
            c.on('close', () => { assert.fail();});
            c.on('message', (msg) => {
                let header = JSON.parse(msg);
                assert.isOk(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 400);
                done();
            });
            c.connect(54321, 'localhost');
        });
        it('close-on-invalid-jsonheader-no-version', (done) => {
            c.on('connect', () => { c.send(JSON.stringify({dummy: 1})); });
            c.on('error', (e) => { assert.fail();});
            c.on('close', () => { assert.fail();});
            c.on('message', (msg) => {
                let header = JSON.parse(msg);
                assert.isOk(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 400);
                done();
            });
            c.connect(54321, 'localhost');
        });
        it('close-on-invalid-jsonheader-bad-version-1', (done) => {
            c.on('connect', () => { c.send(JSON.stringify({JSONSocketVersion: 'a'}));});
            c.on('error', (e) => { assert.fail(); });
            c.on('close', () => { assert.fail();});
            c.on('message', (msg) => {
                let header = JSON.parse(msg);
                assert.isOk(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 400);
                done();
            });
            c.connect(54321, 'localhost');
        });
        it('close-on-invalid-jsonheader-bad-version-2', (done) => {
            c.on('connect', () => { c.send(JSON.stringify({JSONSocketVersion: 0.4}));});
            c.on('error', (e) => { assert.fail();});
            c.on('close', () => { assert.fail();});
            c.on('message', (msg) => {
                let header = JSON.parse(msg);
                assert.isOk(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 400);
                done();
            });
            c.connect(54321, 'localhost');
        });
        it('close-on-invalid-jsonheader-bad-version-3', (done) => {
            c.on('connect', () => { c.send(JSON.stringify({JSONSocketVersion: 2}));});
            c.on('error', (e) => { assert.fail();});
            c.on('close', () => { assert.fail(); });
            c.on('message', (msg) => {
                let header = JSON.parse(msg);
                assert.isOk(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 505);
                done();
            });
            c.connect(54321, 'localhost');
        });
        it('connect-ok', (done) => {
            l.emitter = (x) => { s = x; assert.isOk(true); done() };
            c.on('connect', () => { c.send(JSON.stringify({JSONSocketVersion: 1, some:{nested:{meta:'data'}}}));});
            c.on('error', (e) => { assert.fail(); });
            c.on('close', () => { assert.fail(); });
            // c.on('message', (msg) => {
            //     let header = JSON.parse(msg);
            //     assert.isOk(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 200);
            //     done();
            // });
            c.connect(54321, 'localhost');
        });
    });

    context('emits session', () => {
        it('emits',                     () => { assert.isOk(s); });
        it('session-metadata',          () => { assert.property(s, 'metadata'); });
        it('session-metadata-name',     () => { assert.nestedProperty(s, 'metadata.name'); });
        it('session-metadata-IP',       () => { assert.nestedProperty(s, 'metadata.IP'); });
        it('session-metadata-src-addr', () => { assert.nestedProperty(s, 'metadata.IP.src_addr'); });
        it('session-metadata-src-addr', () => { assert.match(s.metadata.IP.src_addr, /127.0.0.1/); });
        it('session-metadata-dst-addr', () => { assert.nestedProperty(s, 'metadata.IP.dst_addr'); });
        // it('session-metadata-dst-addr', () => { dump(s.metadata,4);assert.match(s.metadata.IP.dst_addr, /127.0.0.1/); });
        it('session-metadata-UDP',      () => { assert.nestedProperty(s, 'metadata.UDP'); });
        it('session-metadata-src-port', () => { assert.nestedProperty(s, 'metadata.UDP.src_port'); });
        it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s, 'metadata.UDP.dst_port', 54321); });
        it('session-meta-jsonsocket-1', () => { assert.nestedProperty(s, 'metadata.JSONSocket'); });
        it('session-meta-jsonsocket-2', () => { assert.nestedProperty(s, 'metadata.JSONSocket.JSONSocketVersion'); });
        it('session-meta-jsonsocket-3', () => { assert.nestedPropertyVal(s, 'metadata.JSONSocket.JSONSocketVersion', 1); });
        it('session-meta-jsonsocket-4', () => { assert.nestedProperty(s, 'metadata.JSONSocket.some'); });
        it('session-meta-jsonsocket-5', () => { assert.nestedProperty(s, 'metadata.JSONSocket.some.nested'); });
        it('session-meta-jsonsocket-6', () => { assert.nestedProperty(s, 'metadata.JSONSocket.some.nested.meta'); });
        it('session-meta-jsonsocket-7', () => { assert.nestedPropertyVal(s, 'metadata.JSONSocket.some.nested.meta', 'data'); });
        it('session-listener',          () => { assert.nestedPropertyVal(s, 'source.origin', 'JSONSocket'); });
        it('session-stream',            () => { assert.nestedProperty(s, 'source.stream'); });
        it('session-stream',            () => { assert.instanceOf(s.source.stream, Stream) });
        it('session-stream-readable',   () => { assert.isOk(s.source.stream.readable); });
        it('session-stream-writeable',  () => { assert.isOk(s.source.stream.writable); });
        it('close-ok',              (done) => {
            if(s && s.source.stream){
                s.source.stream.destroy();
                assert.isOk(true);
                done();
            }
        });
    });

    context('I/O', () => {
        beforeEach((done) => {
            l.removeAllListeners();
            l.emitter = (x) => { s = x; done();};
            c = new udp.createSocket('udp4');
            c.on('connect', () => { c.send(JSON.stringify({JSONSocketVersion: 1}));});
            c.connect(54321, 'localhost');
        });
        afterEach(() => { if(c) c.unref(); if(s && s.source.stream)s.source.stream.destroy(); });

        it('read',  (done) => {
            s.source.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.source.stream.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            c.send('test');
        });
        it('write',  (done) => {
            var header_ok = false;
            c.on('message', (msg) => {
                msg = msg instanceof Buffer ? msg.toString() : msg;
                try {
                    let header = JSON.parse(msg);
                    if(header['JSONSocketVersion'] === 1 && header['JSONSocketStatus'] === 200)
                        header_ok = true
                } catch(e){
                    if(header_ok) { assert.equal(msg, 'test'); done(); }
                }
            });
            setImmediate( () => s.source.stream.write('test'));
        });
    });

    context('close', () => {
        it('close-listener',  () => {
            l.close();
            assert.isOk(true);
        });
    });
});
