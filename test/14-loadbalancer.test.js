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
const LoadBalancer = require('../cluster.js').LoadBalancer;
const EndPoint     = require('../cluster.js').EndPoint;

describe('LoadBalancing', () => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); 
    });

    context('Trivial', () => {
        var tl, es; 
        it('create', () => { tl = LoadBalancer.create({policy: 'Trivial'}); assert.exists(tl); });
        it('no-endpoint', () => {
            try {
                tl.apply({});
            } catch (error) {
                assert.isOk(true);
            }
        });
        it('single-es', () => {
            tl.update([EndPoint.create({protocol: 'Test'}, {name: 'Test', spec: {}})]);
            assert.isNotEmpty(tl.es);
        });
        it('es-length', () => { assert.lengthOf(tl.es, 1); });
        it('single-es-apply', () => { es = tl.apply({}); assert.exists(es); }); 
        it('es-class', () => { assert.instanceOf(es, EndPoint); });
        it('multiple-endpoints', () => {
            tl.update([
                EndPoint.create({protocol: 'Test'}, {name: 'Test1', spec: {}}), 
                EndPoint.create({protocol: 'Test'}, {name: 'Test2', spec: {}}),
                EndPoint.create({protocol: 'Test'}, {name: 'Test3', spec: {}})
            ]);
            assert.lengthOf(tl.es, 3);
        });
        it('multiple-apply', () => {
            es = tl.apply({});
            assert.exists(es);
        });
        it('first', () => { assert.equal(tl.es[0], es); });
    });

    context('Hash', () => {
        var hl; 
        it('create', () => { hl = LoadBalancer.create({policy: 'HashRing'}); assert.exists(hl); });
        it('no-endpoint', () => {
            try {
                hl.apply({});
            } catch (error) {
                assert.isOk(true);
            }
        });
        it('singe-es', () => {
            hl.update([
                EndPoint.create({protocol: 'Test'}, {name: 'Test1', spec: {address: 'localhost1'}}),
                EndPoint.create({protocol: 'Test'}, {name: 'Test2', spec: {address: 'localhost2'}})
            ]);
            assert.exists(hl.keys['localhost1']);
            assert.exists(hl.keys['localhost2']);
        });
        it('hashring', () => { assert.exists(hl.hashring); }); 
        it('create-with-keys', () => {
            hl = LoadBalancer.create({policy: 'HashRing', key: '/key'}); 
            assert.exists(hl);
        });
        it('update-es', () => {
            hl.update([
                EndPoint.create({protocol: 'Test'}, {name: 'Test1', spec: {address: 'localhost1'}}),
                EndPoint.create({protocol: 'Test'}, {name: 'Test2', spec: {address: 'localhost2'}})
            ]);
            assert.exists(hl.keys['localhost1']);
            assert.exists(hl.keys['localhost2']);
        });
        it('hashring', () => { assert.exists(hl.hashring); }); 
        it('apply', () => { 
            e = hl.apply({name: 'test', metadata: {key: 'localhost1'}}); 
            assert.instanceOf(e, EndPoint); 
        });
        it('name', () => { assert.equal(e.name, 'Test1'); });
    });
});