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

describe('Rerty', ()  => {
    var l, e, c, s, r, ru, rl;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        // l7mp.applyAdmin({ log_level: 'silly' });
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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
            let m = l.getSession( {name: 'Test-s'}, du.right);
            s = new Session(m);
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

});
