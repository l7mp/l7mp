const assert       = require('chai').assert;
const L7mp         = require('../l7mp.js').L7mp;
const Rule         = require('../rule.js').Rule;
const Match        = require('../rule.js').Match;

describe('Rule', () => {
    var r, s; 
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('Create-WildCard', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
    });

    context('Apply-WildCard', () => {
        it('applied',       () => { s = r.apply({name: 'Rule'}); assert.exists(s); });
        it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
        it('action-equal',  () => { assert.equal(s, r.action); }); 
    });

    context('Create-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'contains', path: '/name', value: 'test'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
    });

    context('Apply-JSONPredicate', () => {
        it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'test'}}); assert.exists(s); });
        it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
        it('action-equal',  () => { assert.equal(s, r.action); }); 
    });

    context('getAtPath', () => {
        it('get-path', () => { 
            var data = Rule.getAtPath({a: {b: {c: 'test'}}}, '/a/b/c'); 
            assert.equal(data, 'test'); 
        }); 
    });

    context('setAtPath', () => {
        it('set-path-replace', () => {
            var data = Rule.setAtPath({a: {b: {c: 'test'}}}, '/a/b/c', 'test1'); 
            assert.equal(data.a.b.c, 'test1');
        });
        it('set-path-new', () => {
            var data = Rule.setAtPath({}, '/a/b/c', 'test'); 
            assert.equal(data.a.b.c, 'test');
        }); 
    });
}); 