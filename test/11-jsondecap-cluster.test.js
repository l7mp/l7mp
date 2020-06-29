const Stream  = require('stream');
const assert  = require('chai').assert;
const L7mp    = require('../l7mp.js').L7mp;
const Cluster = require('../cluster.js').Cluster;
const log     = require('npmlog');

describe('JSONDecapCluster', () => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
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
        var c = Cluster.create({name: 'JSONDecap', spec: {protocol: 'JSONDecap'}});
        var s;
        it('runs', async () => { s = await c.stream({name:"test-session"});});
        it('returns ok', () => { assert.isOk(s.stream); });
        it('isa stream', () => { assert.instanceOf(s.stream, Stream); });
        it('readable',   () => { assert.isOk(s.stream.readable); });
        it('writeable',  () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('correct', (done) => {
            s.stream.write('{"payload": "test"}');
            s.stream.on('readable', () => {
                let data = ''; let chunk;
                // console.log(s.stream); 
                while (null !== (chunk = s.stream.read())) {
                    data += chunk.toString('base64');
                }
                assert.equal(data, 'test');
                done();
            });
        });
    });
});