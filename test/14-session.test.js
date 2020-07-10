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

const assert            = require('chai').assert;
const L7mp              = require('../l7mp.js').L7mp;
const Session           = require('../session.js').Session;
const Stage             = require('../session.js').Stage;
const Listener          = require('../listener.js').Listener;
const Cluster           = require('../cluster.js').Cluster;
const Rule              = require('../rule.js').Rule;
const RuleList          = require('../rule.js').RuleList;
const DuplexPassthrough = require('../stream.js').DuplexPassthrough;
const Route             = require('../route.js').Route;
const PassThrough       = require('stream').PassThrough;
const NotFoundError     = require('../error.js');

function remove(){
    l7mp.listeners.pop();
    l7mp.clusters.pop();
    l7mp.rules.pop();
    l7mp.rulelists.pop();
    l7mp.routes.pop();
    l7mp.sessions.pop();
}

describe('Session', () => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('Init', () => {
        let stage, sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after( () => {
            remove();
        });
        it('init',          () => { assert.exists(sess); });
        it('object',        () => { assert.isObject(sess); });
        it('has-metadata',  () => { assert.property(sess, 'metadata'); });
        it('has-name',      () => { assert.property(sess, 'name'); });
        it('has-source',    () => { assert.property(sess, 'source'); });
        it('type',          () => { assert.property(sess, 'type'); });
        it('has-events',    () => { assert.property(sess, 'events'); });
        it('event-object',  () => { assert.instanceOf(sess, Object); });
        it('event-length',  () => { assert.equal(sess.events.length, 1); });
        it('event-status',  () => { assert.propertyVal(sess.events[0], 'event', 'INIT'); });
        it('event-message', () => { assert.propertyVal(sess.events[0], 'message', 'Session Test-s initialized'); });
        it('status',        () => { assert.propertyVal(sess, 'status', 'INIT'); });
    });

    context('Create', () => {
        let stage, sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after( () => {
            remove();
        });
        after(                        () => { l7mp.sessions.pop(); });
        it('create',                  () => { sess.create(); assert.isOk(true); });
        it('status',                  () => { assert.propertyVal(sess.source, 'status', 'READY'); });
        it('origin',                  () => { assert.instanceOf(sess.source.session, Session); });
        it('last-conn',               () => { assert.isOk(sess.source.last_conn); });
        it('route',                   () => { assert.instanceOf(sess.route, Route); });
        it('route-name',              () => { assert.property(sess.route, 'name'); });
        it('route-name-equal',        () => { assert.propertyVal(sess.route, 'name', 'Test-r'); });
        it('route-destionation',      () => { assert.property(sess.route, 'destination'); });
        it('route-destination-equal', () => { assert.propertyVal(sess.route, 'destination', 'Test-c'); });
        it('route-retry-retry_on',    () => { assert.propertyVal(sess.route.retry, 'retry_on', 'never'); });
        it('route-retry-num_retries', () => { assert.propertyVal(sess.route.retry, 'num_retries', 0); });
        it('route-retry-timeout',     () => { assert.propertyVal(sess.route.retry, 'timeout', 2000); });
        it('event-length',            () => { assert.equal(sess.events.length, 2); });
        it('event-status',            () => { assert.propertyVal(sess.events[1], 'event', 'LOOKUP SUCCESS'); });
    });

    context('Stage-Connect', () => {
        let s, to;
        let stage, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test'},
                        source: { origin: c.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
        });
        after( () => {
            remove();
        });
        it('connect', async () => {
            s.source = new Stage({session: s, origin: s.source.origin, stream: s.source.stream, source: true});
            s.route = r;
            await s.source.connect(0, 2000);
            assert.isOk(true);
        });
        it('retriable',               () => { assert.isOk(s.source.retriable); });
        it('stream',                  () => { assert.instanceOf(s.source.stream, PassThrough); });
        it('last-connection',         () => { assert.notEqual(s.source.last_conn, 0); });
        it('status',                  () => { assert.propertyVal(s.source, 'status', 'CONNECTED'); });
        it('already-connected', async () => {
            try {
                await s.source.connect(0, 2000);
            } catch (e) {
                assert.equal(e.status, 500);
            }
        });
        it('finalize',          async () => {
            s.source.status = 'FINALIZING';
            try {
                await s.source.connect(0, 2000);
            } catch (e) {
                assert.equal(e.status, 200);
            }
        });
        it('finalize',          async () => {
            s.source.status = 'END';
            try {
                await s.source.connect(0, 2000);
            } catch (e) {
                assert.equal(e.status, 200);
            }
        });
        it('set-event-handler',       () => { s.source.set_event_handlers(); assert.isOk(s.source.on_disc); });
        it('on_disc-close',           () => { assert.property(s.source.on_disc, 'close'); });
        it('on_disc-error',           () => { assert.property(s.source.on_disc, 'error'); });
        it('pipe', () => {
            stage = new Stage({session: s, origin: s.source.origin, stream: s.source.stream, source: true});
            to = s.source.pipe(stage)
            assert.isOk(to);
        });
        it('pipe-passthrough',        () => { assert.instanceOf(to, PassThrough); });
        it('reconnect', async () => {
            s.source.status = 'INIT';
            await s.source.reconnect({retry_on: 'always', num_retries: 2, timeout: 2000}).then(assert.isOk(true));
        });
    });

    context('Connected', () => {
        let stage, sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after( () => {
            remove();
        });
        it('connect-status', () => { sess.create(); sess.connected(); assert.propertyVal(sess, 'status', 'CONNECTED'); });
        it('event-length',   () => { assert.equal(sess.events.length, 3); });
        it('event-status',   () => { assert.propertyVal(sess.events[2], 'event', 'CONNECT'); });
    });

    context('Error', () => {
        let sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        after( () => {
            remove();
        });
        it('make-an-error', () => {
            try {
                sess.error(Error("Test"));
            } catch (error) {
                assert.isOk(true);
            }
        });
        it('error-status',  () => { assert.propertyVal(sess, 'status', 'FINALIZING'); })
        it('event-length',  () => { assert.equal(sess.events.length, 3); });
        it('event-status',  () => { assert.propertyVal(sess.events[2], 'event', 'ERROR'); });
        it('event-message', () => { assert.propertyVal(sess.events[2], 'message', 'Test'); });
        it('event-content', () => { assert.instanceOf(sess.events[2].content, Error); });
    });

    context('End', () => {
        let sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        after( () => {
            remove();
        });
        it('make-an-end', () => {
            try {
                sess.end(Error("Test"));
            } catch (error) {
                assert.isOk(true);
            }
        });
        it('end-status',  () => { assert.propertyVal(sess, 'status', 'FINALIZING'); })
        it('event-length',  () => { assert.equal(sess.events.length, 3); });
        it('event-status',  () => { assert.propertyVal(sess.events[2], 'event', 'END'); });
        it('event-message', () => { assert.propertyVal(sess.events[2], 'message', 'Test'); });
        it('event-content', () => { assert.instanceOf(sess.events[2].content, Error); });
    });

    context('Router', () => {
        let s;
        let stage, sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after( () => {
            remove();
        });
        it('router',      async () => { s = await sess.router(); assert.isOk(s); });
        it('number-of-streams', () => { assert.property(s, 'num_streams'); });
        it('active_streams',    () => { assert.property(s, 'active_streams'); });
        it('equal',             () => { assert.equal(s.num_streams, s.active_streams); });
    });

    context('Lookup', () => {
        var action;
        let stage, sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after( () => {
            remove();
        });
        it('lookup', () => { action = sess.lookup('Test-rs'); assert.isOk(action); });
        it('action', () => { assert.propertyVal(action, 'route', 'Test-r'); });
        it('cannot-find-rulelist', (done) => {
            try {
                action = sess.lookup('wrong');
            } catch(e) {
                assert.isOk(true);
                done();
            }
        });
        it('cannot-find-rules',    (done) => {
            ruleList = RuleList.create({name: 'no-rule', rules: ['']});
            l7mp.rulelists.push(ruleList);
            try {
                action = sess.lookup('no-rule');
            } catch(e) {
                assert.isOk(true);
                done();
            }
        });
    });

    context('Pipeline-Init', () => {
        let wait_list, sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        after( () => {
            remove();
        });
        it('pipeline-init',  () => { assert.isOk(sess.pipeline_init()); });
        it('empty-ingress',  () => { assert.isEmpty(sess.chain.ingress); });
        it('empty-egress',   () => { assert.isEmpty(sess.chain.egress); });
        it('destination',    () => { assert.instanceOf(sess.destination, Stage); });
        it('pipeline-init-ingess-egress', () => {
            sess.route.ingress = ['Test-c'];
            sess.route.egress = ['Test-c'];
            wait_list = sess.pipeline_init();
            assert.isOk(wait_list);
        });
        it('wait-list',        () => { assert.instanceOf(wait_list, Array); });
        it('wait-list-length', () => { assert.lengthOf(wait_list, 3); });
        it('ingress',          () => { assert.instanceOf(sess.chain.ingress[0], Stage); });
        it('egress',           () => { assert.instanceOf(sess.chain.egress[0], Stage); });
        it('destination',      () => { assert.instanceOf(sess.destination, Stage); });
    });

    context('Pipeline-Finish', () => {
        let sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
            sess.pipeline_init();
        });
        after( () => {
            remove();
        });
        it('pipeline-finish', () => {
            sess.destination.stream = new PassThrough();
            try {
                sess.pipeline_finish(sess.source, sess.destination, sess.chain.ingress, 'ingress');
                assert.isOk(true);
            } catch (error) {
                assert.fail(error);
            }
        });
        it('pipeline-finish-reverse', () => {
            try {
                sess.pipeline_finish(sess.destination, sess.source, sess.chain.egress, 'egress');
                assert.isOk(true);
            } catch (error) {
                assert.fail(error);
            }
        });
        it('chain-loop', () => {
            sess.route.ingress = ['Test-c'];
            sess.route.egress = ['Test-c'];
            wait_list = sess.pipeline_init();
            sess.chain.egress[0].stream = new PassThrough();
            sess.chain.ingress[0].stream = new PassThrough();
            sess.destination.stream = new PassThrough();
            try {
                sess.pipeline_finish(sess.source, sess.destination, sess.chain.ingress, 'ingress');
                assert.isOk(true);
            } catch (error) {
                assert.fail(error);
            }
        });
    });

    context('Pipeline-Event-Handler', () => {
        let sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
            sess.pipeline_init();
        });
        after( () => {
            remove();
        });
        it('single-events', () => {
            sess.destination.stream = new PassThrough();
            try {
                sess.pipeline_event_handlers();
            } catch (error) {
                asssert.fail(error);
            }
        });
        it('source-has-on_disc', () => { assert.property(sess.source, 'on_disc'); });
        it('destination-has-on_disc', () => { assert.property(sess.destination, 'on_disc'); });
        it('with-chain', () => {
            sess.route.ingress = ['Test-c'];
            sess.route.egress = ['Test-c'];
            wait_list = sess.pipeline_init();
            sess.chain.egress[0].stream = new PassThrough();
            sess.chain.ingress[0].stream = new PassThrough();
            sess.destination.stream = new PassThrough();
            try {
                sess.pipeline_event_handlers();
            } catch (error) {
                console.log(error);
            }
        });
        it('source-has-on_disc', () => { assert.property(sess.source, 'on_disc'); });
        it('destination-has-on_disc', () => { assert.property(sess.destination, 'on_disc'); });
        it('ingress-has-on_disc' , () => { assert.property(sess.chain.ingress[0], 'on_disc'); });
        it('egress-has-on_disc' , () => { assert.property(sess.chain.egress[0], 'on_disc'); });
    });

    context('Get-Stages', () => {
        let sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        after( () => {
            remove();
        });
        it('source', () => {
            let s = sess.get_stages();
            if (s.length == 1){
                assert.equal(sess.source, s[0]);
            } else {
                assert.fail("The returned list length not equal 1");
            }
        });
        it('destination-source', () => {
            sess.pipeline_init();
            let s = sess.get_stages();
            if (s.length == 2){
                assert.equal(sess.source, s[0]);
                assert.equal(sess.destination, s[1]);
            } else {
                assert.fail("The returned list length not equal 2");
            }
        });
        it('egress', () => {
            sess.route.egress = ['Test-c'];
            sess.pipeline_init();
            sess.destination = undefined;
            let s = sess.get_stages();
            if (s.length == 2){
                assert.equal(sess.source, s[0]);
                assert.equal(sess.chain.egress[0], s[1]);
            } else {
                assert.fail("The returned list length not equal 2");
            }
        });
        it('ingress', () => {
            sess.route.egress = undefined;
            sess.route.ingress = ['Test-c'];
            sess.pipeline_init();
            sess.destination = undefined;
            let s = sess.get_stages();
            if (s.length == 2){
                assert.equal(sess.source, s[0]);
                assert.equal(sess.chain.ingress[0], s[1]);
            } else {
                assert.fail("The returned list length not equal 2");
            }
        });
    });

    context('Pipeline', () => {
        let sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        after( () => {
            remove();
        });
        it('pipeline', async () => { sess = await sess.pipeline(); assert.isOk(sess); });
        it('has-num-stresms', () => { assert.property(sess, 'num_streams'); });
        it('has-active_streams',    () => { assert.property(sess, 'active_streams'); });
        it('source-has-on_disc', () => { assert.property(sess.source, 'on_disc'); });
        it('destination-has-on_disc', () => { assert.property(sess.destination, 'on_disc'); });
        it('connected-status', () => { assert.propertyVal(sess, 'status', 'CONNECTED'); });
    });

    context('Disconnect', () => {
        let stage, sess, l, c, e, ru, rl, r;
        before( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        after( () => {
            remove();
        });
        it('not-ready', () => {
            stage = new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: true});
            try {
                sess.disconnect(stage, Error('Test'));
            } catch (error) {
                assert.fail(error);
            }
        });
        it('events-length',      () => { assert.lengthOf(sess.events, 3); });
        it('event-meassage',     () => { assert.equal(sess.events[2].message, 'Session.disconnect: Stage: Test-l: Error: Test'); });
        it('event-content_type', () => { assert.instanceOf(sess.events[2].content, Error); });
        it('stage-status',       () => { assert.equal(stage.status, 'INIT'); });
        it('ready-connected',    () => {
            sess.active_streams = 1;
            sess.status = 'CONNECTED';
            stage.set_event_handlers();
            stage.status = 'READY';
            stage.origin.status = 'INIT';
            try {
                sess.disconnect(stage, Error('Test'));
            } catch (error) {
                assert.fail(error);
            }
        });
        it('stage-status',     () => { assert.equal(stage.status, 'DISCONNECTED'); });
        it('active-strems',    () => { assert.equal(sess.active_streams, 0); });
        it('destroyed',        () => { assert.isOk(stage.stream.destroyed); });
        it('retry-disconnect', async() => {
            l7mp.sessions.pop();
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
            sess.active_streams = 1;
            sess.num_streams = 1;
            sess.route.retry.retry_on = 'disconnect';
            sess.route.retry.num_retries = 1;
            stage.status = 'READY';
            stage.retriable = true;
            stage.origin = 'Test-c';
            sess.destination = stage;
            try {
                await sess.disconnect(stage, Error('Test'));
            } catch (error) {
                assert.fail(error);
            }
        });
        it('stage-status', () => { assert.equal(stage.session.source.status, 'READY'); });
        it('active-streams', () => { assert.equal(sess.active_streams, 1); });
        it('sess-status', () => { assert.equal(sess.status, 'CONNECTED'); });
        it('last-event', () => { assert.equal(sess.events[sess.events.length - 1].event, 'CONNECT'); });
    });

    context('Repipe', () => {
        let stage, sess, l, c, e, ru, rl, r;
        beforeEach( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        afterEach( () => {
            remove();
        });
        it('Error-on-source', () => {
            stage = new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: true});
            sess.route.ingress = ['Test-c'];
            sess.route.egress = ['Test-c'];
            sess.pipeline_init();
            sess.chain.egress[0].id = sess.source.id;
            sess.chain.egress.push(stage);
            sess.destination = stage;
            sess.destination.id = 1;
            sess.stream = new PassThrough();
            // listener socket cannot be repiped
            assert.isNotOk(sess.repipe(sess.source));
        });
        it('Error-on-destination', (done) => {
            stage = new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false});
            sess.destination = stage;
            sess.chain.ingress.push(new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false}));
            sess.chain.ingress.push(new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false}));
            sess.chain.egress.push(new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false}));
            sess.chain.egress.push(new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false}));
            stage.stream = new PassThrough();
            stage.stream.on('pipe', (src) => {assert.isOk(true); done()});
            sess.repipe(stage);
        });
        it('Error-on-ingress-chain', (done) => {
            stage = new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false});
            sess.destination = new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false});
            sess.chain.ingress.push(new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false}));
            sess.chain.ingress.push(stage);
            sess.chain.egress.push(new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false}));
            sess.chain.egress.push(new Stage({session: sess, origin: sess.source.origin, stream: sess.source.stream, source: false}));
            stage.stream = new PassThrough();
            stage.stream.on('pipe', (src) => {assert.isOk(true); done()});
            sess.repipe(stage);
        });
    });

    context('Destroy', () => {
        let stage, sess, l, c, e, ru, rl, r;
        beforeEach( () => {
            l = Listener.create( {name: 'Test-l', spec: { protocol: 'Test' }, rules: 'Test-rs'});
            l7mp.listeners.push(l);
            c = Cluster.create({ name: 'Test-c', spec: {protocol: 'Test'}, endpoints: [{ name: 'Test-e', spec: {}}]});
            e = c.endpoints[0];
            l7mp.clusters.push(c);
            ru = Rule.create({name: 'Test-ru', action: {route: 'Test-r'}});
            l7mp.rules.push(ru);
            rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
            l7mp.rulelists.push(rl);
            l.rules='Test-rs';
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
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        afterEach( () => {
            remove();
        });
        it('destroy', () => { assert.equal(sess.destroy(), 1); });
        it('with-retry', () => { sess.source.status = 'RETRYING'; assert.equal(sess.destroy(), 0); });
        it('on_disc', () => {
            sess.source.set_event_handlers();
            assert.equal(sess.destroy(), 1);
        });
    });
});
