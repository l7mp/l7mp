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

describe('Session', () => {
    var stage; 
    var l, e, c, r, ru, rl, u;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
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
    });

    context('Init', () => {
        let sess;
        before( () => {
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after(              () => { l7mp.sessions.pop(); });
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
        let sess; 
        before( () => {
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
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

    // context('GetStages', () => {
    //     it('get_stages', () => { console.log(sess.get_stages()); }); 
    // });

    context('Stage-Connect', () => {
        var du = new DuplexPassthrough();
        let s, to;
        before( () => {
            let x = { metadata: {name: 'Test'},
                        source: { origin: c.name, stream: du.right }};
            s = new Session(x);
            l7mp.sessions.push(s);
        });
        after( () => {
            l7mp.sessions.pop();
        })
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
        let sess;
        before( () => {
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after(               () => { l7mp.sessions.pop(); });
        it('connect-status', () => { sess.create(); sess.connected(); assert.propertyVal(sess, 'status', 'CONNECTED'); });
        it('event-length',   () => { assert.equal(sess.events.length, 3); }); 
        it('event-status',   () => { assert.propertyVal(sess.events[2], 'event', 'CONNECT'); });
    });

    context('Router', () => {
        let s;
        let sess;
        before( () => {
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after(                  () => { l7mp.sessions.pop(); });
        it('router',      async () => { s = await sess.router(); assert.isOk(s); }); 
        it('number-of-streams', () => { assert.property(s, 'num_streams'); });
        it('active_streams',    () => { assert.property(s, 'active_streams'); });
        it('equal',             () => { assert.equal(s.num_streams, s.active_streams); }); 
    });

    context('Lookup', () => {
        var action; 
        let sess;
        before( () => {
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
        });
        after(       () => { l7mp.sessions.pop(); });
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

    context('Pipeline', () => {
        let sess;
        before( () => {
            var du = new DuplexPassthrough();
            let x = { metadata: {name: 'Test-s'},
                      source: { origin: l.name, stream: du.right }};
            sess = new Session(x);
            l7mp.sessions.push(sess);
            sess.create();
        });
        after(               () => { l7mp.sessions.pop(); });
        it('pipeline', async () => { assert.isOk(await sess.pipeline()); });
        // TODO: Other pipeline methods
    });
});