const Stream   = require('stream');
const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const EndPoint = require('../cluster.js').EndPoint;
const udp      = require('dgram');

describe('UDPEndPoint', ()  => {
    var e, s;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });
    //TODO: try to find that thing that is still running after the tests
    context('create', () => {
        it('runs',         () => { assert.exists(e = EndPoint.create(
            {protocol: 'UDP', spec: {protocol: 'UDP' ,port: 16000, bind: {address: "127.0.0.1", port: 16001}}},
            {name: 'UDP', spec: {address: "127.0.0.1"}})); });
        it('object',       () => { assert.isObject(e); });
        it('instanceOf',   () => { assert.instanceOf(e, EndPoint); });
        it('has-name',     () => { assert.property(e, 'name'); });
        it('has-spec',     () => { assert.property(e, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(e, 'protocol', 'UDP'); });
    });

    context('#connect()', () => {
        it('remote connect', (done) => {
            s = e.connect({});
            s.on('connect', () => { assert.isOk(true); done(); });
        });
        it('exists',     () => { assert.isOk(s); });
        it('instanceOf', () => { assert.instanceOf(s, udp.Socket); });
        it('message', (done) => {
            s = e.connect({});
            s.send('test', e.remote_port, e.remote_address, (err) => {
                s.close();
            });
            s.on('message', (msg) => {
                assert.equal(msg, 'test')
            })
            done();
        });
        it('listening', (done) => {
            s = e.connect({});
            s.on('listening', () => { assert.isOk(true); done(); });
        });
        it('close', (done) => {
            s = e.connect({});
            s.on('close', () => { assert.isOk(true); done(); });
            s.close();
        });
    });
    after(() => {
        //things that still running, should be stopped here
    });
});
