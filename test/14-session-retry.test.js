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

const udp          = require('dgram');
const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const Net          = require('net');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;
const EndPoint     = require('../cluster.js').EndPoint;
const Cluster      = require('../cluster.js').Cluster;
const Rule         = require('../rule.js').Rule;
const RuleList     = require('../rule.js').RuleList;
const Route        = require('../route.js').Route;
const DuplexPassthrough = require('../stream.js').DuplexPassthrough;
const delay        = require('delay');

// TODO: killing session during retry, killing cluster/lisener under session

describe('Rerty', ()  => {
    var l, e, c, s, r, ru, rl, u;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        // l7mp.applyAdmin({ log_level: 'silly' });
        // l7mp.applyAdmin({ log_level: 'verbose' });
        l7mp.run(); // should return
        l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});

        l7mp.listeners.push(l);
        c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'},
                             endpoints: [{ name: 'Test-e', spec: {}}]});
        e = c.endpoints[0];
        l7mp.clusters.push(c);
        ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
        l7mp.rules.push(ru);
        rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
        l7mp.rulelists.push(rl);
        l.rules='Test-rs';
    });

    context('no-retry-ok', () => {
        var du = new DuplexPassthrough();
        it('route-create', () => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'never',
                    num_retries: 0,
                    timeout: 2000,
                }
            });
            l7mp.routes.push(r);
            assert.isOk(r);
        });
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(s);
        });
        it('route', (done) => {
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('no-retry-fail', () => {
        var du = new DuplexPassthrough();
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(true);
        });
        it('route', (done) => {
            e.mode = ['fail']; e.round = 0;
            s.on('error', () => { assert.isOk(true); done()});
            s.router();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('1-retry-ok-always', () => {
        var du = new DuplexPassthrough();
        it('route-create', () => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'always',
                    num_retries: 1,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            assert.isOk(r);
        });
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(s);
        });
        it('route', (done) => {
            e.mode = ['fail', 'ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('1-retry-ok-connect-failure', () => {
        var du = new DuplexPassthrough();
        it('route-create', () => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'connect-failure',
                    num_retries: 1,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            assert.isOk(r);
        });
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(s);
        });
        it('route', (done) => {
            e.mode = ['fail', 'ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('1-retry-fail', () => {
        var du = new DuplexPassthrough();
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(true);
        });
        it('route', (done) => {
            e.mode = ['fail', 'fail']; e.round = 0; e.timeout=0;
            s.on('error', () => { assert.isOk(true); done()});
            s.router();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('1-retry-fail-timeout', () => {
        var du = new DuplexPassthrough();
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(true);
        });
        it('route', (done) => {
            e.mode = ['fail', 'ok']; e.round = 0; e.timeout=1000;
            s.on('error', () => { assert.isOk(true); done()});
            s.router();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-ok-always', () => {
        var du = new DuplexPassthrough();
        it('route-create', () => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'always',
                    num_retries: 2,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            assert.isOk(r);
        });
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(s);
        });
        it('route', (done) => {
            e.mode = ['fail', 'fail', 'ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-ok-connect-failure', () => {
        var du = new DuplexPassthrough();
        it('route-create', () => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'connect-failure',
                    num_retries: 2,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            assert.isOk(r);
        });
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(s);
        });
        it('route', (done) => {
            e.mode = ['fail', 'fail', 'ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-fail', () => {
        var du = new DuplexPassthrough();
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(true);
        });
        it('route', (done) => {
            e.mode = ['fail', 'fail', 'fail']; e.round = 0; e.timeout=0;
            s.on('error', () => { assert.isOk(true); done()});
            s.router();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-fail-timeout', () => {
        var du = new DuplexPassthrough();
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(true);
        });
        it('route', (done) => {
            e.mode = ['fail', 'fail', 'ok']; e.round = 0; e.timeout=250;
            s.on('error', () => { assert.isOk(true); done()});
            s.router();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('1-retry-disconnect-ok-disconnect', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'disconnect',
                    num_retries: 1,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect', (done) => {
            s.removeAllListeners();
            s.on('connect', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('1-retry-disconnect-ok-always', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'always',
                    num_retries: 1,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect', (done) => {
            s.removeAllListeners();
            s.on('connect', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('1-retry-disconnect-fail', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok', 'fail']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect-fail', (done) => {
            s.removeAllListeners();
            s.on('error', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-disconnect-ok-disconnect', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'disconnect',
                    num_retries: 2,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok', 'fail', 'ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect', (done) => {
            s.removeAllListeners();
            s.on('connect', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-disconnect-ok-always', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'always',
                    num_retries: 2,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok', 'fail', 'ok']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect', (done) => {
            s.removeAllListeners();
            s.on('connect', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-disconnect-fail', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok', 'fail', 'fail']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect-fail', (done) => {
            s.removeAllListeners();
            s.on('error', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-disconnect-fail-kill-cluster', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'always',
                    num_retries: 2,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok', 'fail', 'fail']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect-fail', (done) => {
            s.removeAllListeners();
            s.on('error', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
            setTimeout(() => l7mp.clusters.splice(0, 1), 20);
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('2-retry-disconnect-fail-kill-session', () => {
        var du = new DuplexPassthrough();
        it('route', (done) => {
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'},
                                 endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'always',
                    num_retries: 2,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            s.create();
            e.mode = ['ok', 'fail', 'fail']; e.round = 0; e.timeout=0;
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('re-connect-fail', (done) => {
            s.removeAllListeners();
            s.on('error', () => { assert.isOk(true); done()});
            s.destination.stream.destroy();
            setTimeout(() => s.destroy(Error('')), 20);
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('no-retry-ok', () => {
        var du = new DuplexPassthrough();
        it('route-create', () => {
            e.mode = ['ok', 'fail', 'fail']; e.round = 0; e.timeout=0;
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'never',
                    num_retries: 0,
                    timeout: 2000,
                }
            });
            l7mp.routes.push(r);
            assert.isOk(r);
        });
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(s);
        });
        it('route', (done) => {
            s.on('connect', () => { assert.isOk(true); done()});
            s.router();
        });
        it('echo',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
        it('delete-session', () => {
            du.left.removeAllListeners();
            s.end();
            l7mp.sessions.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('no-retry-fail', () => {
        var du = new DuplexPassthrough();
        it('new-session', () => {
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
            assert.isOk(s);
        });
        it('create-session', () => {
            s.create();
            assert.isOk(true);
        });
        it('route', (done) => {
            e.mode = ['fail']; e.round = 0;
            s.on('error', () => { assert.isOk(true); done()});
            s.router();
        });
        it('delete-session', () => {
            s.end();
            l7mp.sessions.splice(0, 1);
            l7mp.routes.splice(0, 1);
            assert.isOk(true);
        });
    });

    context('jsonsocket-retry', () => {
        beforeEach((done) => {
            if(s) s.end();
            l7mp.clusters.splice(0, 1);
            c = Cluster.create({
                name: 'Test-c',
                spec: {protocol: 'JSONSocket',
                       transport: { protocol: 'UDP', port: 54321 },
                       header: [ { path: '/' } ]
                      },
                endpoints: [{ name: 'Test-e', spec: {address: '127.0.0.1'}}],
            });
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            l7mp.routes.splice(0, 1);
            r = Route.create({
                name: 'Test-r',
                destination: 'Test-c',
                retry: {
                    retry_on: 'always',
                    num_retries: 2,
                    timeout: 100,
                }
            });
            l7mp.routes.push(r);
            u = new udp.createSocket('udp4');
            u.bind(54321, async () => {
                u.once('message', (msg, rinfo) => {
                    u.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}),
                           rinfo.port, rinfo.address);
                    u.on('message', (msg, rinfo) => { u.send(msg, rinfo.port, rinfo.address); });
                });
                du = new DuplexPassthrough()
                let x = { metadata: {name: 'Test-s'},
                          source: { origin: l.name, stream: du.right }};
                s = new Session(x);
                l7mp.sessions.push(s);
                s.create();
                s.router().then(() => done());
            });
        });
        afterEach(() => { u.close(); s.destroy(); l7mp.sessions.splice(0, 1); du.destroy(); });

        it('connect-ok',  (done) => {
            // send one packet
            du.left.write('test');
            assert.isOk(true);
            done();
        });
        it('0-fail-re-connect-ok',  (done) => {
            // send one packet
            du.left.write('test');
            // kill receiver
            setImmediate(() => {
                u.close();
                setImmediate(() => {
                    // send another packet so that cluster emits a disconnect
                    du.left.write('test');
                    // set up listeners to detect reconnect
                    s.on('error', () => { assert.fail(); });
                    s.on('connect', () => { assert.isOk(true); done()});
                    // set up listener again
                    setImmediate(() => {
                        u = new udp.createSocket('udp4');
                        u.bind(54321, () => {
                            u.once('message', (msg, rinfo) => {
                                u.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}),
                                       rinfo.port, rinfo.address);
                            });
                        });
                    }, 25);
                }, 25);
            }, 25);
        });
        it('1-fail-re-connect-ok',  (done) => {
            // send one packet
            du.left.write('test');
            // kill receiver
            setImmediate(() => {
                e.mode = ['fail', 'true']; e.round = 0;
                u.close();
                setImmediate(() => {
                    // send another packet so that cluster emits a disconnect
                    du.left.write('test');
                    // set up listeners to detect reconnect
                    s.on('error', () => { assert.fail();  });
                    s.on('connect', () => { assert.isOk(true); done()});
                    // set up listener again
                    setImmediate(() => {
                        u = new udp.createSocket('udp4');
                        u.bind(54321, () => {
                            u.once('message', (msg, rinfo) => {
                                u.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}),
                                       rinfo.port, rinfo.address);
                            });
                        });
                    }, 50);
                }, 50);
            }, 50);
        });
        it('2-fail-re-connect-error',  (done) => {
            // send one packet
            du.left.write('test');
            // kill receiver
            setImmediate(() => {
                e.mode = ['fail', 'fail', 'true']; e.round = 0;
                u.close();
                setImmediate(() => {
                    // send another packet so that cluster emits a disconnect
                    du.left.write('test');
                    // set up listeners to detect reconnect
                    s.on('error', () => { assert.isOk(true); done();  });
                    s.on('connect', () => { assert.fail()});
                    // set up listener again
                    setImmediate(() => {
                        u = new udp.createSocket('udp4');
                        u.bind(54321, () => {
                            u.once('message', (msg, rinfo) => {
                                u.send(JSON.stringify({JSONSocketVersion: 1,JSONSocketStatus: 200,JSONSocketMessage: "OK"}),
                                       rinfo.port, rinfo.address);
                            });
                        });
                    }, 50);
                }, 50);
            }, 50);
        });
    });
});
