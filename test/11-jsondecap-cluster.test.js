const Stream  = require('stream');
const assert  = require('chai').assert;
const L7mp    = require('../l7mp.js').L7mp;
const Cluster = require('../cluster.js').Cluster;
const log     = require('npmlog');

describe('JSONDecapCluster', () => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run();
    });

    context('create', () => {
        var c;
        it('runs',         () => { assert.exists(c = Cluster.create({name: 'JSONDecap', spec: {protocol: 'JSONDecap'}})); });
        it('object',       () => { assert.isObject(c); });
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(c, 'spec', {protocol: 'JSONDecap'}); });
    });

    context('stream()', () => {
        var c, s;
        c = Cluster.create({name: 'JSONDecap', spec: {protocol: 'JSONDecap'}});
        it('runs', async () => { s = await c.stream({name:"test-session"}); assert.exists(s); });
        it('returns ok', () => { assert.isOk(s.stream); });
        it('isa stream', () => { assert.instanceOf(s.stream, Stream); });
        it('readable',   () => { assert.isOk(s.stream.readable); });
        it('writeable',  () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('correct', (done) => {
            s.stream.write('{"payload": "test"}');
            s.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.stream.read())) {
                    data += chunk.toString('base64');
                }
                assert.equal(data, 'test');
                done();
            });
        });
    });

    context('stream()-with-invalid-json' , () => {
        var c, s;
        c = Cluster.create({name: 'JSONDecap', spec: {protocol: 'JSONDecap'}});
        it('runs', async () => { s = await c.stream({name:"test-session"}); assert.exists(s); });
        it('not-correct', (done) => {
            s.stream.write('');
            s.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.stream.read())) {
                    data += chunk.toString('base64');
                }
                assert.equal(log.record[10].prefix, 'JSONDecapCluster.stream.transform:');
                done();
            });
        });
    });
});