const Stream  = require('stream');
const assert  = require('chai').assert;
const L7mp    = require('../l7mp.js').L7mp;
const Cluster = require('../cluster.js').Cluster;

describe('EchoCluster', ()  => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        var c;
        it('runs',         () => { assert.exists(c = Cluster.create({name: 'Echo', spec: {protocol: 'Echo'}})); });
        it('object',       () => { assert.isObject(c); });
        // EchoCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(c, 'spec', {protocol: 'Echo'}); });
    });

    context('stream()', () => {
        var c = Cluster.create({name: 'Echo', spec: {protocol: 'Echo'}});
        var s;
        it('runs', async   () => { s = await c.stream({name:"test-session"}); });
        it('returns ok',   () => { assert.isOk(s.stream); });
        it('isa stream',   () => { assert.instanceOf(s.stream, Stream); });
        it('readable',     () => { assert.isOk(s.stream.readable); });
        it('writeable',    () => { assert.isOk(s.stream.writable); });
        it('has-endpoint', () => { assert.isObject(s.endpoint); });
        it('correct-byte-stream', (done) => {
            s.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.stream.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            s.stream.write('test');
        });
        // it('correct-datagram-stream', (done) => {
        //     let data = '';
        //     s.on('data', (chunk) => {
        //         data += chunk;
        //         assert.equal(data, 'test');
        //         done();
        //     });
        //     s.write('test');
        // });
    });
});
