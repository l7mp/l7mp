const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const EndPoint = require('../cluster.js').EndPoint;
const Cluster  = require('../cluster.js').Cluster;

describe('JSONSocket', () => {
    var e, c, s_ok;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run();
    });

    context('create', () => {
        it('runs', async  () => {
            c = Cluster.create({
                name: 'JSONSocket',
                spec: {protocol: 'JSONSocket',
                       transport: { protocol: 'UDP', port: 54321 },
                      },
            });
            await c.run();
            assert.exists(e = EndPoint.create(c.transport, {name: 'Test', spec: {address: '127.0.0.1'}}));
        });
        it('object',       () => { assert.isObject(e); });
        it('instanceOf',   () => { assert.instanceOf(e, EndPoint); });
        it('has-name',     () => { assert.property(e, 'name'); });
        it('has-spec',     () => { assert.property(e, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(e, 'protocol', 'UDP'); });
    });
});
