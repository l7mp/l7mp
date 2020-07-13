const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const udp          = require('dgram');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;

describe('UDPListener', ()  => {

    let readers = {};
    let reader = (name, stream, done) => {
        let f = () => {
            let data = '';
            let chunk;
            while (null !== (chunk = stream.read())) {
                data += chunk;
            }
            assert.equal(data, 'test');
            done();
        };
        readers[name] = f;
        return f;
    };

    before( async () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error'});
        await l7mp.run();
    });

    /*
    * Enforce server with fully specified connect.address/port
    */

    context('server-no-connect-rules',  () => {
        let ls, c1, c2, s1, s2;
        context('create', () => {
            it('created',      () => {  ls = Listener.create(
                {
                    name: 'UDP',
                    spec:
                        {
                            protocol: 'UDP',
                            port: 16000 ,
                            address: '127.0.0.1',
                        }
                })

            });
            it('object',       () => { assert.isObject(ls); });
            // UDPListener is not exported so we cannot check from here
            it('instanceOf',   () => { assert.instanceOf(ls, Listener); });
            it('Emitter',      () => { assert.instanceOf(ls, EventEmitter); });
            it('has-name',     () => { assert.property(ls, 'name'); });
            it('has-spec',     () => { assert.property(ls, 'spec'); });
            it('has-protocol', () => { assert.nestedPropertyVal(ls, 'spec.protocol', 'UDP'); });
            it('has-port',     () => { assert.nestedPropertyVal(ls, 'spec.port', 16000); });
            it('can-listen',   () => { ls.emitter=(x) =>{
                l7mp.sessions.push(x);
                if(!s2){
                    !s1 ? s1 = x : s2 = x ;
                }
            }});
        });


        context('#run', () => {
            it('runs', () => { ls.run(); assert.exists(ls); });
        });
        context('#connect', () => {
            it('connect-from-client', (done) =>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    c1.send('connect1');
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            })
            it('connect-from-other-client', (done) =>{
                c2 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c2.on('connect',  () => {
                    c2.send('connect2');
                    done();
                });
                c2.on('listening',()=>{
                    c2.connect(16000,'127.0.0.1');
                })
                c2.bind(16002, '127.0.0.1');
            })
            it('address',        () => { assert.equal(c1.address().address, '127.0.0.1'); });
            it('port',    () => { assert.equal(c1.address().port, 16001); });
            it('remote-address', () => { assert.equal(c1.remoteAddress().address, '127.0.0.1'); });
            it('remote-port', () => { assert.equal(c1.remoteAddress().port, 16000); });
        });

        context('emits session', () => {
            it('emits',                     () => { assert.isNotEmpty(l7mp.sessions); });
            it('session-metadata',          () => { assert.property(s1, 'metadata'); });
            it('session-metadata-name',     () => { assert.nestedProperty(s1, 'metadata.name'); });
            it('session-metadata-IP',       () => { assert.nestedProperty(s1, 'metadata.IP'); });
            it('session-metadata-src-addr', () => { assert.nestedProperty(s1, 'metadata.IP.src_addr'); });
            it('session-metadata-src-addr', () => { assert.match(s1.metadata.IP.src_addr, /127.0.0.1/); });
            it('session-metadata-dst-addr', () => { assert.nestedProperty(s1, 'metadata.IP.dst_addr'); });
            it('session-metadata-dst-addr', () => { assert.match(s1.metadata.IP.dst_addr, /127.0.0.1/); });
            it('session-metadata-UDP',      () => { assert.nestedProperty(s1, 'metadata.UDP'); });
            it('session-metadata-src-port', () => { assert.nestedProperty(s1, 'metadata.UDP.src_port'); });
            it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s1, 'metadata.UDP.dst_port', 16000); });
            it('session-listener',          () => { assert.nestedPropertyVal(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.stream'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.instanceOf(s1.source.stream, Stream) });
            it('session-stream-readable',   () => { assert.isOk(s1.source.stream.readable); });
            it('session-stream-writeable',  () => { assert.isOk(s1.source.stream.writable); });
        });

        context('I/O', () => {
            it('read-1-connect',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'connect1');
                    done();
                });
            });
            it('read-2-connect',  (done) => {
                s2.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s2.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'connect2');
                    done();
                });
            });
            it('read-1',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'test1');
                    done();
                });
                c1.send('test1');
            });
            it('read-2',  (done) => {
                s2.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s2.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'test2');
                    done();
                });
                c2.send('test2');
            });
            it('write-1',  (done) => {
                c1.once('message', (msg, rinfo) => {
                    assert.equal(msg.toString(), 'test1');
                    done();
                })
                s1.source.stream.write('test1');
            });
            it('write-2',  (done) => {
                c2.once('message', (msg, rinfo) => {
                    assert.equal(msg.toString(), 'test2');
                    done();
                })
                s2.source.stream.write('test2');
            });
            it('server-stream-end',  () => {
                s1.source.stream.removeAllListeners();
                s2.source.stream.removeAllListeners();
                c1.removeAllListeners();
                c2.removeAllListeners();
                s1.source.stream.destroy();
                s2.source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-1-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
            it('client-2-stream-end', (done) => {
                c2.on('close', () => {
                    assert.isOk(true);
                    done();
                })
                c2.close()
            });

        });

        context('sessions', ()=>{
            it('burst-from-client',(done)=>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    for(let i = 0; i < 10; i++){
                        c1.send('connect');
                    }
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            });
            it('no-duplicate-sessions-on-fast-init', ()=>{
                assert.lengthOf(l7mp.sessions,1);
            });
            it('server-stream-end',  () => {
                l7mp.sessions[0].source.stream.removeAllListeners();
                c1.removeAllListeners();
                l7mp.sessions[0].source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
        });

        context('stop', () => {
            it('stop-server',  () => {
                ls.close();
                assert.isOk(true);
            });
        });
    });

    /*
    * Enforce server with fully specified connect.address/port
    */

    context('server-specified-address-port',  () => {
        let ls, c1, c2, s1, s2;
        context('create', () => {
            it('created',      () => {  ls = Listener.create(
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
                                    mode: 'server'
                                }
                        }
                })

            });
            it('object',       () => { assert.isObject(ls); });
            // UDPListener is not exported so we cannot check from here
            it('instanceOf',   () => { assert.instanceOf(ls, Listener); });
            it('Emitter',      () => { assert.instanceOf(ls, EventEmitter); });
            it('has-name',     () => { assert.property(ls, 'name'); });
            it('has-spec',     () => { assert.property(ls, 'spec'); });
            it('has-protocol', () => { assert.nestedPropertyVal(ls, 'spec.protocol', 'UDP'); });
            it('has-port',     () => { assert.nestedPropertyVal(ls, 'spec.port', 16000); });
            it('has-connect',  () => { assert.nestedProperty(ls, 'spec.connect')});
            it('has-connect-port',  () => { assert.nestedProperty(ls, 'spec.connect.port', 16001)});
            it('has-connect-address',  () => { assert.nestedProperty(ls, 'spec.connect.address', '127.0.0.1')});
            it('has-options',  () => { assert.nestedPropertyVal(ls, 'spec.options.mode', 'server')});
            it('can-listen',   () => { ls.emitter=(x) =>{
                l7mp.sessions.push(x);
                if(!s1){s1 = x}
                assert.isOk(true);
            }});
        });


        context('#run', () => {
            it('runs', () => { ls.run(); assert.exists(ls); });
        });
        context('#connect', () => {
            it('connect-from-client', (done) =>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    c1.send('connect1');
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            })
            // it('connect-from-other-client', (done) =>{
            //     c2 = new udp.createSocket({type: "udp4", reuseAddr: true});
            //     c2.on('connect',  () => {
            //         c2.send('connect2');
            //         done();
            //     });
            //     c2.on('listening',()=>{
            //         c2.connect(16000,'127.0.0.1');
            //     })
            //     c2.bind(16002, '127.0.0.1');
            // })
            it('address',        () => { assert.equal(c1.address().address, '127.0.0.1'); });
            it('port',    () => { assert.equal(c1.address().port, 16001); });
            it('remote-address', () => { assert.equal(c1.remoteAddress().address, '127.0.0.1'); });
            it('remote-port', () => { assert.equal(c1.remoteAddress().port, 16000); });
        });

        context('emits session', () => {
            it('emits',                     () => { assert.isNotEmpty(l7mp.sessions); });
            it('session-metadata',          () => { assert.property(s1, 'metadata'); });
            it('session-metadata-name',     () => { assert.nestedProperty(s1, 'metadata.name'); });
            it('session-metadata-IP',       () => { assert.nestedProperty(s1, 'metadata.IP'); });
            it('session-metadata-src-addr', () => { assert.nestedProperty(s1, 'metadata.IP.src_addr'); });
            it('session-metadata-src-addr', () => { assert.match(s1.metadata.IP.src_addr, /127.0.0.1/); });
            it('session-metadata-dst-addr', () => { assert.nestedProperty(s1, 'metadata.IP.dst_addr'); });
            it('session-metadata-dst-addr', () => { assert.match(s1.metadata.IP.dst_addr, /127.0.0.1/); });
            it('session-metadata-UDP',      () => { assert.nestedProperty(s1, 'metadata.UDP'); });
            it('session-metadata-src-port', () => { assert.nestedProperty(s1, 'metadata.UDP.src_port'); });
            it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s1, 'metadata.UDP.dst_port', 16000); });
            it('session-listener',          () => { assert.nestedPropertyVal(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.stream'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.instanceOf(s1.source.stream, Stream) });
            it('session-stream-readable',   () => { assert.isOk(s1.source.stream.readable); });
            it('session-stream-writeable',  () => { assert.isOk(s1.source.stream.writable); });
        });

        context('I/O', () => {
            it('read-1-connect',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'connect1');
                    done();
                });
            });
            // it('read-2-connect',  (done) => {
            //     s2.source.stream.once('readable', () => {
            //         let data = ''; let chunk;
            //         while (null !== (chunk = s2.source.stream.read())) {
            //             data += chunk;
            //         }
            //         assert.equal(data, 'connect2');
            //         done();
            //     });
            // });
            it('read-1',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'test1');
                    done();
                });
                c1.send('test1');
            });
            // it('read-2',  (done) => {
            //     s2.source.stream.once('readable', () => {
            //         let data = ''; let chunk;
            //         while (null !== (chunk = s2.source.stream.read())) {
            //             data += chunk;
            //         }
            //         assert.equal(data, 'test2');
            //         done();
            //     });
            //     c2.send('test2');
            // });
            it('write-1',  (done) => {
                c1.once('message', (msg, rinfo) => {
                    assert.equal(msg.toString(), 'test1');
                    done();
                })
                s1.source.stream.write('test1');
            });
            // it('write-2',  (done) => {
            //     c2.once('message', (msg, rinfo) => {
            //         assert.equal(msg.toString(), 'test2');
            //         done();
            //     })
            //     s2.source.stream.write('test2');
            // });
            it('server-stream-end',  () => {
                s1.source.stream.removeAllListeners();
                // s2.source.stream.removeAllListeners();
                c1.removeAllListeners();
                // c2.removeAllListeners();
                s1.source.stream.destroy();
                // s2.source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-1-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
            // it('client-2-stream-end', (done) => {
            //     c2.on('close', () => {
            //         assert.isOk(true);
            //         done();
            //     })
            //     c2.close()
            // });

        });

        context('sessions', ()=>{
            it('burst-from-client',(done)=>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    for(let i = 0; i < 10; i++){
                        c1.send('connect');
                    }
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            });
            it('no-duplicate-sessions-on-fast-init', ()=>{
                assert.lengthOf(l7mp.sessions,1);
            });
            it('server-stream-end',  () => {
                l7mp.sessions[0].source.stream.removeAllListeners();
                c1.removeAllListeners();
                l7mp.sessions[0].source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
        });

        context('stop', () => {
            it('stop-server',  () => {
                ls.close();
                assert.isOk(true);
            });
        });
    });

    /*
     * server mode by default with specified port
     */

    context('server-specified-port',  () => {
        let l, c1, c2, s1, s2;
        context('create', () => {
            it('created',      () => {  l = Listener.create(
                {
                    name: 'UDP',
                    spec:
                        {
                            protocol: 'UDP',
                            port: 16000 ,
                            address: '127.0.0.1',
                            connect:
                                {
                                    port: 16001
                                }
                        }
                });
                l7mp.listeners.push(l);
                assert.exists(l);
            });
            it('object',       () => { assert.isObject(l); });
            it('instanceOf',   () => { assert.instanceOf(l, Listener); });
            it('Emitter',      () => { assert.instanceOf(l, EventEmitter); });
            it('has-name',     () => { assert.property(l, 'name'); });
            it('has-spec',     () => { assert.property(l, 'spec'); });
            it('has-protocol', () => { assert.nestedPropertyVal(l, 'spec.protocol', 'UDP'); });
            it('has-port',     () => { assert.nestedPropertyVal(l, 'spec.port', 16000); });
            it('has-connect-address',     () => { assert.nestedPropertyVal(l, 'spec.connect.port', 16001); })
            it('can-listen',   () => { l.emitter=(x) =>{
                l7mp.sessions.push(x);
                if(!s2){
                    !s1 ? s1 = x : s2 = x ;
                }
                assert.isOk(true);
            }});
        });

        context('#run', () => {
            it('runs', () => { l.run(); assert.exists(l); });
        });

        context('#connect', () => {

            it('connect-from-client', (done) =>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    c1.send('connect1');
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            })
            it('connect-from-other-client', (done) =>{
                c2 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c2.on('connect',  () => {
                    c2.send('connect2');
                    done();
                });
                c2.on('listening',()=>{
                    c2.connect(16000,'127.0.0.1');
                })
                c2.bind(16001,'127.0.0.2');
            })
            it('address',        () => { assert.equal(c1.address().address, '127.0.0.1'); });
            it('port',    () => { assert.equal(c1.address().port, 16001); });
            it('remote-address', () => { assert.equal(c1.remoteAddress().address, '127.0.0.1'); });
            it('remote-port', () => { assert.equal(c1.remoteAddress().port, 16000); });
        });

        context('emits session', () => {
            it('emits',                     () => { assert.isNotEmpty(l7mp.sessions); });
            it('session-metadata',          () => { assert.property(s1, 'metadata'); });
            it('session-metadata-name',     () => { assert.nestedProperty(s1, 'metadata.name'); });
            it('session-metadata-IP',       () => { assert.nestedProperty(s1, 'metadata.IP'); });
            it('session-metadata-src-addr', () => { assert.nestedProperty(s1, 'metadata.IP.src_addr'); });
            it('session-metadata-src-addr', () => { assert.match(s1.metadata.IP.src_addr, /127.0.0.1/); });
            it('session-metadata-dst-addr', () => { assert.nestedProperty(s1, 'metadata.IP.dst_addr'); });
            it('session-metadata-dst-addr', () => { assert.match(s1.metadata.IP.dst_addr, /127.0.0.1/); });
            it('session-metadata-UDP',      () => { assert.nestedProperty(s1, 'metadata.UDP'); });
            it('session-metadata-src-port', () => { assert.nestedProperty(s1, 'metadata.UDP.src_port'); });
            it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s1, 'metadata.UDP.dst_port', 16000); });
            it('session-listener',          () => { assert.nestedPropertyVal(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.stream'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.instanceOf(s1.source.stream, Stream) });
            it('session-stream-readable',   () => { assert.isOk(s1.source.stream.readable); });
            it('session-stream-writeable',  () => { assert.isOk(s1.source.stream.writable); });
        });

        context('I/O', () => {
            it('read-1-connect',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'connect1');
                    done();
                });
            });
            it('read-2-connect',  (done) => {
                s2.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s2.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'connect2');
                    done();
                });
            });
            it('read-1',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'test1');
                    done();
                });
                c1.send('test1');
            });
            it('read-2',  (done) => {
                s2.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s2.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'test2');
                    done();
                });
                c2.send('test2');
            });
            it('write-1',  (done) => {
                c1.once('message', (msg, rinfo) => {
                    assert.equal(msg.toString(), 'test1');
                    done();
                })
                s1.source.stream.write('test1');
            });
            it('write-2',  (done) => {
                c2.once('message', (msg, rinfo) => {
                    assert.equal(msg.toString(), 'test2');
                    done();
                })
                s2.source.stream.write('test2');
            });
            it('server-stream-end',  () => {
                s1.source.stream.removeAllListeners();
                s2.source.stream.removeAllListeners();
                c1.removeAllListeners();
                c2.removeAllListeners();
                s1.source.stream.destroy();
                s2.source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-1-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
            it('client-2-stream-end', (done) => {
                c2.on('close', () => {
                    assert.isOk(true);
                    done();
                })
                c2.close()
            });
        });

        context('sessions', ()=>{
            it('burst-from-client',(done)=>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    for(let i = 0; i < 10; i++){
                        c1.send('connect');
                    }
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            });
            it('no-duplicate-sessions-on-fast-init', ()=>{
                assert.lengthOf(l7mp.sessions,1);
            });
            it('server-stream-end',  () => {
                l7mp.sessions[0].source.stream.removeAllListeners();
                c1.removeAllListeners();
                l7mp.sessions[0].source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
        });

        context('stop', () => {
            it('stop-server',  () => {
                l.close();
                assert.isOk(true);
            });
        });
    });

    /*
     * server mode by default with specified address
     */

    context('server-specified-address',  () => {
        let l, c1, c2, s1, s2;
        context('create', () => {
            it('created',      () => {  l = Listener.create(
                {
                    name: 'UDP',
                    spec:
                        {
                            protocol: 'UDP',
                            port: 16000 ,
                            address: '127.0.0.1',
                            connect:
                                {
                                    address: '127.0.0.1'
                                }
                        }
                });
                l7mp.listeners.push(l);
                assert.exists(l);
            });
            it('object',       () => { assert.isObject(l); });
            it('instanceOf',   () => { assert.instanceOf(l, Listener); });
            it('Emitter',      () => { assert.instanceOf(l, EventEmitter); });
            it('has-name',     () => { assert.property(l, 'name'); });
            it('has-spec',     () => { assert.property(l, 'spec'); });
            it('has-protocol', () => { assert.nestedPropertyVal(l, 'spec.protocol', 'UDP'); });
            it('has-port',     () => { assert.nestedPropertyVal(l, 'spec.port', 16000); });
            it('has-connect-address',     () => { assert.nestedPropertyVal(l, 'spec.connect.address', '127.0.0.1'); });
            it('can-listen',   () => { l.emitter=(x) =>{
                l7mp.sessions.push(x);
                if(!s2){
                    !s1 ? s1 = x : s2 = x ;
                }
                assert.isOk(true);
            }});
        });

        context('#run', () => {
            it('runs', () => { l.run(); assert.exists(l); });
        });

        context('#connect', () => {

            it('connect-from-client', (done) =>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    c1.send('connect1');
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            })
            it('connect-from-other-client', (done) =>{
                c2 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c2.on('connect',  () => {
                    c2.send('connect2');
                    done();
                });
                c2.on('listening',()=>{
                    c2.connect(16000,'127.0.0.1');
                })
                c2.bind(16002,'127.0.0.1');
            })
            it('address',        () => { assert.equal(c1.address().address, '127.0.0.1'); });
            it('port',    () => { assert.equal(c1.address().port, 16001); });
            it('remote-address', () => { assert.equal(c1.remoteAddress().address, '127.0.0.1'); });
            it('remote-port', () => { assert.equal(c1.remoteAddress().port, 16000); });
        });

        context('emits session', () => {
            it('emits',                     () => { assert.isNotEmpty(l7mp.sessions); });
            it('session-metadata',          () => { assert.property(s1, 'metadata'); });
            it('session-metadata-name',     () => { assert.nestedProperty(s1, 'metadata.name'); });
            it('session-metadata-IP',       () => { assert.nestedProperty(s1, 'metadata.IP'); });
            it('session-metadata-src-addr', () => { assert.nestedProperty(s1, 'metadata.IP.src_addr'); });
            it('session-metadata-src-addr', () => { assert.match(s1.metadata.IP.src_addr, /127.0.0.1/); });
            it('session-metadata-dst-addr', () => { assert.nestedProperty(s1, 'metadata.IP.dst_addr'); });
            it('session-metadata-dst-addr', () => { assert.match(s1.metadata.IP.dst_addr, /127.0.0.1/); });
            it('session-metadata-UDP',      () => { assert.nestedProperty(s1, 'metadata.UDP'); });
            it('session-metadata-src-port', () => { assert.nestedProperty(s1, 'metadata.UDP.src_port'); });
            it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s1, 'metadata.UDP.dst_port', 16000); });
            it('session-listener',          () => { assert.nestedPropertyVal(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.stream'); });
            it('session-stream',            () => { assert.nestedProperty(s1, 'source.origin', 'UDP'); });
            it('session-stream',            () => { assert.instanceOf(s1.source.stream, Stream) });
            it('session-stream-readable',   () => { assert.isOk(s1.source.stream.readable); });
            it('session-stream-writeable',  () => { assert.isOk(s1.source.stream.writable); });
        });

        context('I/O', () => {
            it('read-1-connect',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'connect1');
                    done();
                });
            });
            it('read-2-connect',  (done) => {
                s2.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s2.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'connect2');
                    done();
                });
            });
            it('read-1',  (done) => {
                s1.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s1.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'test1');
                    done();
                });
                c1.send('test1');
            });
            it('read-2',  (done) => {
                s2.source.stream.once('readable', () => {
                    let data = ''; let chunk;
                    while (null !== (chunk = s2.source.stream.read())) {
                        data += chunk;
                    }
                    assert.equal(data, 'test2');
                    done();
                });
                c2.send('test2');
            });
            it('write-1',  (done) => {
                c1.once('message', (msg, rinfo) => {
                    assert.equal(msg.toString(), 'test1');
                    done();
                })
                s1.source.stream.write('test1');
            });
            it('write-2',  (done) => {
                c2.once('message', (msg, rinfo) => {
                    assert.equal(msg.toString(), 'test2');
                    done();
                })
                s2.source.stream.write('test2');
            });
            it('server-stream-end',  () => {
                s1.source.stream.removeAllListeners();
                s2.source.stream.removeAllListeners();
                c1.removeAllListeners();
                c2.removeAllListeners();
                s1.source.stream.destroy();
                s2.source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-1-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
            it('client-2-stream-end', (done) => {
                c2.on('close', () => {
                    assert.isOk(true);
                    done();
                })
                c2.close()
            });
        });

        context('sessions', ()=>{
            it('burst-from-client',(done)=>{
                c1 = new udp.createSocket({type: "udp4", reuseAddr: true});
                c1.on('connect',  () => {
                    for(let i = 0; i < 10; i++){
                        c1.send('connect');
                    }
                    done();
                });
                c1.on('listening',()=>{
                    c1.connect(16000,'127.0.0.1');
                })
                c1.bind(16001, '127.0.0.1');
            });
            it('no-duplicate-sessions-on-fast-init', ()=>{
                assert.lengthOf(l7mp.sessions,1);
            });
            it('server-stream-end',  () => {
                l7mp.sessions[0].source.stream.removeAllListeners();
                c1.removeAllListeners();
                l7mp.sessions[0].source.stream.destroy();
                l7mp.sessions.splice(0,2);
                assert.isOk(true);
            });
            it('client-stream-end', (done) => {
                c1.once('close', () => {
                    assert.isOk(true);
                    done();
                })
                c1.close()
            });
        });

        context('stop', () => {
            it('stop-server',  () => {
                l.close();
                assert.isOk(true);
            });
        });
    });
});
