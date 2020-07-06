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
                EndPoint.create({protocol: 'Test'}, {name: 'Test1', spec: {}}),
                EndPoint.create({protocol: 'Test'}, {name: 'Test2', spec: {}})
            ]);
            hl.apply({name: 'test'});
        });
    });
});