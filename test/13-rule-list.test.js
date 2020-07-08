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