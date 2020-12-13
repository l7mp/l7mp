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
const HashRing      = require('hashring');
const { NotFoundError } = require('../error.js');

describe('LoadBalancing', () => {
    before( () => {
        l7mp = new L7mp();
        // l7mp.applyAdmin({ log_level: 'silly' })
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run() ;
    });

    context('Base class', () => {
        let lb;
        it('Create', () => {
            lb = LoadBalancer.create({policy: 'None'});
            assert.exists(lb);
        });
        it('Update', () => {
            lb.update([{test: 'test'}]);
            assert.propertyVal(lb.es[0], 'test', 'test');
        });
        it('Apply', () => {
            assert.isNotOk(lb.apply([]));
        });
        it('toJSON', () => {
            let lbJSON = lb.toJSON();
            assert.propertyVal(lbJSON, 'policy', 'None');
        });
    });

    context('Default', () => {
        it('Non-exist policy', () => {
            assert.throws(() => LoadBalancer.create({policy: 'none'}), Error, 'LoadBalancer.create: TODO: Policy "none" unimplemented');
        });

        it('Empty object', () => {
            assert.throws(() => LoadBalancer.create({}), Error, 'LoadBalancer.create: TODO: Policy undefined');
        });
    });

    context('Trivial', () => {
        var tl, es;
        it('create', () => { 
            tl = LoadBalancer.create({policy: 'Trivial'});
            assert.exists(tl);
        });
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
        it('single-es-apply', () => { 
            es = tl.apply({});
            assert.exists(es);
        });
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
        var hl, hlkey;
        it('create-without-key', () => { 
            hl = LoadBalancer.create({policy: 'HashRing'});
            assert.exists(hl);
        });
        it('create-with-key', () => {
            hlkey = LoadBalancer.create({policy: 'HashRing', key: '/key'});
            assert.exists(hlkey);
        });
        it('toJSON()', () => {
            let hlkeyJSON = hlkey.toJSON();
            assert.propertyVal(hlkeyJSON, 'policy', 'HashRing');
            assert.propertyVal(hlkeyJSON, 'key', '/key');
        });

        context('Update', () =>{
            let endpoints = [
                { endpoint: 'E1', name: 'E1', weight: 1, spec: {address: '0.0.0.0'}},
                { endpoint: 'E2', name: 'E2', weight: 2, spec: {address: '0.0.0.1'}}
            ];
            it('update()', () => {
                hlkey.update(endpoints);
                assert.hasAllKeys(hlkey.keys, ['0.0.0.0', '0.0.0.1']);
            });
            it('hashring', () => {
                assert.instanceOf(hlkey.hashring, HashRing);
            });
        });

        context('Apply', () => {
            it('No-keys', () => {
                assert.throws(() => hl.apply({name: 'Test'}), NotFoundError);
            });
            it('No-key-found', () => {
                assert.isOk(hlkey.apply({name: 'Test', metadata: {keys: '1.1.1.1'}}));
            });
            it('Matching-key', () => {
                assert.propertyVal(hlkey.apply({name: 'Test', metadata: {key: '0.0.0.1'}}), 'name', 'E2');
            });
        });
    });

    context('ConsistentHash', () => {
        var chl;
        it('Create', () => {
            chl = LoadBalancer.create({policy: 'ConsistentHash'});
            assert.exists(chl);
        });
    });
});
