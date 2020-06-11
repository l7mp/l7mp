const Stream   = require('stream');
const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const EndPoint = require('../cluster.js').EndPoint;

describe('TestEndPoint', ()  => {
    var e, s_ok;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        it('runs',         () => { assert.exists(e = EndPoint.create({protocol: 'Test'}, {name: 'Test', spec: {}})); });
        it('object',       () => { assert.isObject(e); });
        // EchoCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(e, EndPoint); });
        it('has-name',     () => { assert.property(e, 'name'); });
        it('has-spec',     () => { assert.property(e, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(e, 'protocol', 'Test'); });
    });

    context('#connect()', () => {
        it('ok', (done) => {
            e.mode=['ok']; e.timeout=0;
            s_ok = e.connect({});
            s_ok.on('test-open', () => { assert.isOk(true); done(); });
        });
        it('exists',     () => { assert.isOk(s_ok); });
        it('instanceOf', () => { assert.instanceOf(s_ok, Stream); });
        it('readable',   () => { assert.isOk(s_ok.readable); });
        it('writeable',  () => { assert.isOk(s_ok.writable); });
        it('fail', (done) => {
            e.mode=['fail']; e.timeout=0;
            let s = e.connect({});
            s.on('test-error', () => { assert.isOk(true); done(); });
        });
        it('ok timeout', (done) => {
            e.mode=['ok']; e.timeout=300;
            let start = new Date().getTime();
            let s = e.connect({});
            s.on('test-open', () => {
                var end=new Date().getTime();
                assert.approximately(end-start, 300, 100);
                done();
            });
        });
        it('fail timeout', (done) => {
            e.mode=['fail']; e.timeout=300;
            let start = new Date().getTime();
            let s = e.connect({});
            s.on('test-error', () => {
                var end=new Date().getTime();
                assert.approximately(end-start, 300, 100);
                done();
            });
        });
        it('ok-fail-program', (done) => {
            e.mode=['ok', 'fail', 'fail', 'ok', 'fail'];
            e.timeout=0; e.round=0;
            let i = 0;
            let s1 = e.connect({});
            s1.on('test-error', () => { assert.fail('stream-1');});
            s1.on('test-open', () => {
                i++; let s2 = e.connect({});
                s2.on('test-open', () => { assert.fail('stream-2');});
                s2.on('test-error', () => {
                    i++; let s3 = e.connect({});
                    s3.on('test-open', () => { assert.fail('stream-3');});
                    s3.on('test-error', () => {
                        i++; let s4 = e.connect({});
                        s4.on('test-error', () => { assert.fail('stream-4');});
                        s4.on('test-open', () => {
                            i++; let s5 = e.connect({});
                            s5.on('test-open', () => { assert.fail('stream-5');});
                            s5.on('test-error', () => {
                                i++; assert.equal(i, 5); done()
                            });
                        });
                    });
                });
            });
        });
    });
});
