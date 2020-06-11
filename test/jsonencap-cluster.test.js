const Stream  = require('stream');
const assert  = require('chai').assert;
const L7mp    = require('../l7mp.js').L7mp;
const Cluster = require('../cluster.js').Cluster;
const log     = require('npmlog');

describe('JSONEncapCluster', ()  => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        var c;
        it('runs',         () => { assert.exists(c = Cluster.create({name: 'JSONEncap', spec: {protocol: 'JSONEncap'}})); });
        it('object',       () => { assert.isObject(c); });
        // JSONEncapCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(c, 'spec', {protocol: 'JSONEncap'}); });
    });

    context('stream()', () => {
        var c = Cluster.create({name: 'JSONEncap', spec: {protocol: 'JSONEncap'}});
        var s;
        it('runs', async () => { s = await c.stream({name:"test-session"}); });
        it('returns ok', () => { assert.isOk(s); });
        it('isa stream', () => { assert.instanceOf(s, Stream); });
        it('readable',   () => { assert.isOk(s.readable); });
        it('writeable',  () => { assert.isOk(s.writable); });
        it('correct', (done) => {
            s.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.read())) {
                    data += chunk;
                }
                let res = JSON.parse(data);
                // base64
                assert.equal(res.payload, 'dGVzdA==');
                done();
            });
            s.write('test');
        });
    });
});
