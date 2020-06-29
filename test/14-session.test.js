const assert     = require('chai').assert;
const L7mp       = require('../l7mp.js').L7mp;
const Session     = require('../session.js').Session;

describe('Session', () => {
    var sess; 
    before( () => {
        l7mp = new L7mp();
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('Create', () => {
        it('created', () => {
            sess = new Session({
                metadata: {name: 'Test'},
                source: {
                    origin: {
                        type: 'TCP',
                    },
                    stream: {

                    }
                },
                priv: 'priv',
            }); 
            assert.exists(sess); 
        });
        it('object',        () => { assert.isObject(sess); }); 
        it('has-metadata',  () => { assert.property(sess, 'metadata'); }); 
        it('has-name',      () => { assert.property(sess, 'name'); });
        it('has-source',    () => { assert.property(sess, 'source'); });
        it('type',          () => { assert.propertyVal(sess, 'type', 'TCP'); });
        it('has-events',    () => { assert.property(sess, 'events'); });
        it('event-object',  () => { assert.instanceOf(sess, Object); });
        it('event-length',  () => { assert.equal(sess.events.length, 1); });
        it('event-status',  () => { assert.propertyVal(sess.events[0], 'event', 'INIT'); }); 
        it('event-message', () => { assert.propertyVal(sess.events[0], 'message', 'Session Test initialized'); });
        it('status',        () => { assert.propertyVal(sess, 'status', 'INIT'); }); 
    });
});