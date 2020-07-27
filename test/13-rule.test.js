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

    context('Contains-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'contains', path: '/name', value: 'test'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'test'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'not'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { console.log(s); assert.notEqual(s, r.action); }); 
        });
    });

    context('Contains-IgnoreCase-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'contains', path: '/name', value: 'TEST', ignore_case: true}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'test'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'NOT'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { console.log(s); assert.notEqual(s, r.action); }); 
        });
    });

    context('Defined-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'defined', path: '/name'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: null}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: null}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Ends-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'ends', path: '/name', value: 'test'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'This is a test'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 'test a is This'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Ends-IgnoreCase-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'ends', path: '/name', value: 'test', ignore_case: true}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'This is a TEST'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 'TEST A IS THIS'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('In-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'in', path: '/name', value: ['test', 10]}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 10}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 11}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Less-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'less', path: '/name', value: 15}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 10}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 15}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Matches-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'matches', path: '/name', value: "[a-z]"}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'test'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 'TEST'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Matches-IgnoreCase-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'matches', path: '/name', value: "[a-z]", ignore_case: true}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'TEST'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 'test '}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('More-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'more', path: '/name', value: 5}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 10}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 0}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Starts-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'starts', path: '/name', value: 'test'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'test '}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 'This a test'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Starts-IgnoreCase-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'starts', path: '/name', value: 'test', ignore_case: true}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'TEST is it'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 'THIS IS A TEST'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Test-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'test', path: '/name', value: 'test'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'test'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: 'This a test'}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Type-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'type', path: '/name', value: 'string'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: 'test'}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {names: true}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Undefined-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {op: 'undefined', path: '/name'}, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {not_name: null}}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {name: null}}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('And-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {
            op: 'and',
            apply: [
                { op: 'defined', path: '/a/b' },
                { op: 'less', path: '/a/c/d', value: 15 }
            ]
        }, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: 'foo',
                    c: {
                        d: 10
                    }
                }
            }}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: 'foo',
                    c: {
                        d: 15
                    }
                }
            }}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Not-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {
            op: 'not',
            apply: [
                { op: 'defined', path: '/a/b/e' },
                { op: 'less', path: '/a/c/d', value: 5 }
            ]
        }, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: 'foo',
                    c: {
                        d: 10
                    }
                }
            }}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: 'foo',
                    c: {
                        d: 4
                    }
                }
            }}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Or-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {
            op: 'or',
            apply: [
                { op: 'defined', path: '/a/b/e' },
                { op: 'less', path: '/a/c/d', value: 5 }
            ]
        }, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: 'foo',
                    c: {
                        d: 4
                    }
                }
            }}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: 'foo',
                    c: {
                        d: 5
                    }
                }
            }}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });

    context('Nested-Second-Order-JSONPredicate', () => {
        it('created',         () => { r = Rule.create({name: 'Rule', match: {
            op: 'or',
            apply: [
                {
                op: 'not',
                apply: [
                    { op: 'undefined', path: '/a/b/e' },
                    { op: 'starts', path: '/a/b/c', value: 'f' }
                ]
                },
                {
                op:  'or',
                apply: [
                    { op: 'defined', path: '/a/b/f' },
                    { op: 'type', path: '/a/b/d', value: 'number' }
                ]
                }
            ]
        }, action: 'test'}); assert.exists(r); }); 
        it('object',          () => { assert.isObject(r);}); 
        it('has-name',        () => { assert.property(r, 'name'); }); 
        it('instanceOf-rule', () => { assert.instanceOf(r, Rule); });
        it('rule.match',      () => { assert.nestedProperty(r, 'match'); });
        it('has-action',      () => { assert.property(r, 'action'); });
        
        context('Apply-JSONPredicate-true', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: {
                        d: 10
                    }
                }
            }}); assert.exists(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.equal(s, r.action); }); 
        });

        context('Apply-JSONPredicate-false', () => {
            it('applied',       () => { s = r.apply({name: 'Rule', metadata: {
                a: {
                    b: {
                        c: 'f'
                    }
                }
            }}); assert.isUndefined(s); });
            it('Stats-applied', () => { assert.equal(r.stats.total_applied, 1); }); 
            it('action-equal',  () => { assert.notEqual(s, r.action); }); 
        });
    });
}); 