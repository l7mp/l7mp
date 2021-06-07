// L7mp: A programmable L7 meta-proxy
//
// Copyright 2020 by its authors.
// Some rights reserved. See AUTHORS.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const process      = require("process");

const Stream       = require('stream');
const assert       = require('chai').assert;
const L7mp         = require('../l7mp.js').L7mp;
const EndPoint     = require('../cluster.js').EndPoint;
const Cluster      = require('../cluster.js').Cluster;
const udp          = require('dgram');
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;
const Rule         = require('../rule.js').Rule;
const RuleList     = require('../rule.js').RuleList;
const Route        = require('../route.js').Route;

describe('UDP-Offload', () => {
    var sender, receiver, sess;

    before( () => {
        // works only if run as root
        if(process.getuid() !== 0){
            console.error('NOTE: Offload tests skipped, need root privs');
            process.exit(0);
        };
    });

    after( () => {
        if(sender)sender.close();
        if(receiver)receiver.close();
        if(sess)sess.destroy();
        l7mp.offload.shutdown();
        l7mp.offload = null;
    });

    context('offloader', () => {
        it('init',  async () => {
            l7mp = new L7mp();
            l7mp.static_config.admin = {
                log_level: 'warn',
                offload: 'init',
                offload_ifs: ['lo'],
            };
            await l7mp.run();
            assert.isOk(l7mp.offload);
        });

        it('create-offloaded-session',  async () => {
            var c = Cluster.create({name: 'UDP-c', spec: {protocol: 'UDP', port: 54321,
                                                        bind: {address: '127.0.0.1', port: 54320}}});
            await c.run();
            l7mp.clusters.push(c);
            var e = c.addEndPoint({name: 'UDP-e', spec: {address: '127.0.0.1'}});
            var l = Listener.create({name: 'UDP-l', spec: { protocol: 'UDP', port: 16001, address: '127.0.0.1',
                                                            connect: { address: '127.0.0.1', port: 16000}}});
            l7mp.listeners.push(l);
            let ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            let rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
            let r = Route.create({name: 'Test-r', destination: 'UDP-c'});
            l7mp.routes.push(r);
            l.emitter = l7mp.addSession.bind(l7mp);
            await l.run();
            sess = l7mp.sessions[0];
        });

        it('send-via-offloaded-session',  () => {
            // create a sender
            sender = new udp.createSocket({type: "udp4", reuseAddr: true});
            sender.bind(16000, '127.0.0.1');
            sender.connect(16001, '127.0.0.1');

            // create a receiiver
            receiver = new udp.createSocket({type: "udp4", reuseAddr: true});
            receiver.bind(54321);

            receiver.once('message', (msg, rinfo) => {
                assert.equal(msg.toString(), 'test');
                assert.equal(rinfo.address, '127.0.0.1');
                assert.equal(rinfo.port, 54320);
                assert.equal(msg.toString(), 'test');
                done();
            });

            receiver.send("test", 16001, "127.0.0.1");
        });
    });
});
