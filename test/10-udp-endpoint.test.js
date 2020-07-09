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
        it('instanceOf', () => {
            assert.instanceOf(s, udp.Socket);
        s.close();
        });
        it('listening', (done) => {
            s = e.connect({});
            s.on('listening', () => { assert.isOk(true); done(); s.close() });
        });
        it('message', (done) => {
            s = e.connect({});
            let client = udp.createSocket("udp4")
            client.bind(16000)
            let message = Buffer.from('test')
            s.on('message', (msg, rinfo) => {
                assert.equal(msg.toString(), 'test');
                client.close();
                s.close();
                done();
            })
            client.send(message,16001, "127.0.0.1" , (err, bytes) => {
                if(err) {
                    client.close();
                    s.close();
                    console.log(msg)
                }
            });
        });
        it('close', (done) => {
            s = e.connect({});
            s.on('close', () => { assert.isOk(true); done(); });
            s.close();
        });
    });
});
