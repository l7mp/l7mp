const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const udp          = require('dgram');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;

describe('UDPListener', ()  => {
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
        l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.run(); // should return
    });

    context('create', () => {
        it('created',      () => { l = Listener.create(
            {
                name: 'UDP',
                spec:
                    {
                        protocol: 'UDP',
                        port: 16000 ,
                        address: '127.0.0.1',
                        connect:
                               {
                                   address: '127.0.0.1',
                                   port: 16001
                               },
                        options:
                               {
                                   connections: 'ondemand'
                               }
                    }
            });
        assert.exists(l);
        });
        it('object',       () => { assert.isObject(l); });
        // TCPListener is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(l, Listener); });
        it('Emitter',      () => { assert.instanceOf(l, EventEmitter); });
        it('has-name',     () => { assert.property(l, 'name'); });
        it('has-spec',     () => { assert.property(l, 'spec'); });
        it('has-protocol', () => { assert.nestedPropertyVal(l, 'spec.protocol', 'UDP'); });
        it('has-port',     () => { assert.nestedPropertyVal(l, 'spec.port', 16000); });
        it('can-listen',   () => { l.emitter=(x) =>{ s = x }; assert.isOk(true); });
    });

    context('#run-singleton', () => {
        it('runs', () => { l.run_singleton(); assert.exists(l); });
    });

    context('#connect', () => {
        it('ok',    (done) => { c = new udp.createSocket({type: "udp4", reuseAddr: true});
            assert.isOk(c);
            done(); });
        it('listening',      (done) => {
            c.once('listening', () =>{ assert.isOk(true)})
            c.bind(16001, '127.0.0.1')
            done();
        })
        it('connect-to-remote-host', (done) =>{
            c.once('connect', () => { assert.isOk(true)})
            c.connect(16000,'127.0.0.1');
            done();
        })
        it('address',        () => { assert.equal(c.address().address, '127.0.0.1'); });
        it('port',    () => { assert.equal(c.address().port, 16001); });
        it('remote-address', () => { assert.equal(c.remoteAddress().address, '127.0.0.1'); });
        it('remote-port', () => { assert.equal(c.remoteAddress().port, 16000); });
    });

    context('emits session', () => {
        it('emits',                     () => { assert.isOk(s); });
        it('session-metadata',          () => { assert.property(s, 'metadata'); });
        it('session-metadata-name',     () => { assert.nestedProperty(s, 'metadata.name'); });
        it('session-metadata-IP',       () => { assert.nestedProperty(s, 'metadata.IP'); });
        it('session-metadata-src-addr', () => { assert.nestedProperty(s, 'metadata.IP.src_addr'); });
        it('session-metadata-src-addr', () => { assert.match(s.metadata.IP.src_addr, /127.0.0.1/); });
        it('session-metadata-dst-addr', () => { assert.nestedProperty(s, 'metadata.IP.dst_addr'); });
        it('session-metadata-dst-addr', () => { assert.match(s.metadata.IP.dst_addr, /127.0.0.1/); });
        it('session-metadata-UDP',      () => { assert.nestedProperty(s, 'metadata.UDP'); });
        it('session-metadata-src-port', () => { assert.nestedProperty(s, 'metadata.UDP.src_port'); });
        it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s, 'metadata.UDP.dst_port', 16000); });
        it('session-listener',          () => { assert.nestedPropertyVal(s, 'source.origin', 'UDP'); });
        it('session-stream',            () => { assert.nestedProperty(s, 'source.stream'); });
        it('session-stream',            () => { assert.nestedProperty(s, 'source.origin', 'UDP'); });
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
            c.send('test');
        });
        it('write',  (done) => {
            c.on('message', (msg, rinfo) => {
                assert.equal(msg.toString(), 'test');
                done();
            })
            s.source.stream.write('test');
        });
        it('server-stream-end',  () => {
            s.source.stream.removeAllListeners();
            c.removeAllListeners();
            s.source.stream.destroy();
            assert.isOk(true);
        });
        it('client-stream-end', (done) => {
            c.on('close', () => {
                assert.isOk(true);
                done();
            })
            c.close()
        })
    });

    context('stop', () => {
        it('stop-server',  () => {
            l.close();
            assert.isOk(true);
        });

    });
});
