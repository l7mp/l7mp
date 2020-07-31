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
const Session    = require('../session.js').Session;
const DuplexPassthrough = require('../stream.js').DuplexPassthrough;


describe('RuleList', () => {
    var r;
    before( () => {
        l7mp = new L7mp();
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
        var du = new DuplexPassthrough();
        let x = { metadata: {name: 'Test-s'},
                  source: { origin: 'Test-l', stream: du.right }};
        sess = new Session(x);
        l7mp.sessions.push(sess);
    });

    context('Create', () => {
        // created with an empty rule
        it('created', () => {
            r = RuleList.create({
                name: 'Test List',
                rules: []
            });
            assert.isOk(r);
        });
        it('has-name',     () => { assert.property(r, 'name'); });
        it('object',       () => { assert.instanceOf(r, RuleList); });
        it('rules-array',  () => { assert.instanceOf(r.rules, Array); });
        it('length',       () => { assert.equal(r.rules.length, 0); });
        it('add-rule',     () => {
            var rule = Rule.create({ name: 'Test', match: true, action: 'test'});
            r.rules.push(rule);
            assert.isOk(r.rules[0]);
        });
        it('rules-array',  () => { assert.instanceOf(r.rules, Array); });
        it('length',       () => { assert.equal(r.rules.length, 1); });
        it('rule-object',  () => { assert.instanceOf(r.rules[0], Rule); });
    });

    context('lookup', () => {
        it('add-rules-to-l7mp', () => {
            l7mp.rules.push(Rule.create({name: 'Rule1', match: {op: 'contains', path: '/a/b', value: 'test'}, action: 'test1'}));
            l7mp.rules.push(Rule.create({name: 'Rule2', match: {op: 'starts', path: '/a/b', value: 'lorem'}, action: 'test2'}));
            l7mp.rules.push(Rule.create({name: 'Rule3', match: {op: 'ends', path: '/a/b', value: 'lorem'}, action: 'test3'}));
            l7mp.rules.push(Rule.create({name: 'Rule4', match: {op: 'defined', path: '/a/b'}, action: 'test4'}));
            l7mp.rules.push(Rule.create({name: 'Rule5', match: {op: 'undefined', path: '/a/b'}, action: 'test5'}));
            assert.lengthOf(l7mp.rules, 5);
        });
        it('create-rulelist-with-rules', () => {
            r = RuleList.create({
                name: 'Test List',
                rules: ['Rule1', 'Rule2', 'Rule3', 'Rule4', 'Rule5']
            });
            assert.isOk(r);
        });
        it('add-l7mp-rulesList', () => {
            l7mp.rulelists.push(r);
            assert.isOk(l7mp.rulelists);
        });
        it('action-test1', () => {
            sess.metadata = {a: {b: 'test'}}; 
            let action = sess.lookup('Test List'); 
            assert.strictEqual(action, 'test1');
        });
        it('action-test2', () => {
            sess.metadata = {a: {b: 'lorem ipsum'}}; 
            let action = sess.lookup('Test List'); 
            assert.strictEqual(action, 'test2');
        });
        it('action-test3', () => {
            sess.metadata = {a: {b: 'ipsum lorem'}}; 
            let action = sess.lookup('Test List'); 
            assert.strictEqual(action, 'test3');
        });
        it('action-test4', () => {
            sess.metadata = {a: {b: ''}}; 
            let action = sess.lookup('Test List'); 
            assert.strictEqual(action, 'test4');
        });
        it('action-test5', () => {
            sess.metadata = {a: {c: ''}}; 
            let action = sess.lookup('Test List'); 
            assert.strictEqual(action, 'test5');
        });
    });
});
