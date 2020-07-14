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
}); 