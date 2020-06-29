const { inRange } = require('lodash');

const assert = require('chai').assert;
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Route = require('../route.js').Route;

describe('Route', () => {
    var c; 
    before( () => {
        l7mp = new L7mp();
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('Create', () => {
        it('created', () => {
            c = Route.create({name: 'Route', destination: '127.0.0.1',  ingress: '127.0.0.1', egress: '127.0.0.1'}); 
            assert.exists(c);
        }); 
        it('object',            () => { assert.isObject(c); }); 
        it('instanceOf',        () => { assert.instanceOf(c, Route); });
        it('has-name',          () => { assert.property(c, 'name'); });
        it('has-destination',   () => { assert.property(c, 'destination'); }); 
        it('has-ingress',       () => { assert.property(c, 'ingress'); });
        it('has-egress',        () => { assert.property(c, 'egress'); });
        it('has-retry',         () => { assert.property(c, 'retry'); }); 
        it('retry-retry_on',    () => { assert.nestedPropertyVal(c, 'retry.retry_on', 'never'); });
        it('retry-num_retries', () => { assert.nestedPropertyVal(c, 'retry.num_retries', 1); });
        it('retry-timeout',     () => { assert.nestedPropertyVal(c, 'retry.timeout', 2000); }); 
    }); 
});