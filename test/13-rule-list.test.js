const assert     = require('chai').assert;
const L7mp       = require('../l7mp.js').L7mp;
const Rule       = require('../rule.js').Rule;
const RuleList   = require('../rule.js').RuleList;

describe('RuleList', () => {
    var r; 
    before( () => {
        l7mp = new L7mp();
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('Create', () => {
        it('created', () => {
            var rule = new Rule({name: 'Test', match: true, action: 'test', stats: {total_applied: 0}});
            r = RuleList.create({
                name: 'Test List', 
                rules: [rule]
            }); 
        });
        it('has-name',     () => { assert.property(r, 'name'); });
        it('object',       () => { assert.instanceOf(r, RuleList); });
        it('rules-object', () => { assert.instanceOf(r.rules, Object); });
        it('length',       () => { assert.equal(r.rules.length, 1); }); 
        it('rule-object',  () => { assert.instanceOf(r.rules[0], Rule); });
    });
});