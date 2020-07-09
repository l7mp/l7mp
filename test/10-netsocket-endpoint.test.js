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
const net      = require('net');

describe('NetSocketEndPoint', ()  => {
    var e, s, server;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
        //should stop after
        server = net.createServer(function(socket){
            socket.pipe(socket);
        });
        server.listen(16001,"127.0.0.1")
    });

    context('create', () => {
        it('runs',         () => { assert.exists(e = EndPoint.create(
            {protocol: 'TCP', spec: {port: 16001}},
            {name: 'NetSocket', spec: {address: 'localhost'}})); });
        //, bind: {address: "127.0.0.1", port: 16000}
        it('object',       () => { assert.isObject(e); });
        // EchoCluster is not exported so we cannot check from here
        it('instanceOf',   () => { assert.instanceOf(e, EndPoint); });
        it('has-name',     () => { assert.property(e, 'name'); });
        it('has-spec',     () => { assert.property(e, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(e, 'protocol', 'TCP'); });
    });

    context('#connect()', () => {
        it('ok', (done) => {
            s = e.connect({});
            s.on('connect', () => {
                assert.isOk(true);
                s.destroy()
                done();
            });
        });
        it('exists', () => {
            assert.isOk(s);
        });
        it('instanceOf', () => {
            assert.instanceOf(s, net.Socket);
        });
        it('ready', (done) => {
            s = e.connect({});
            s.on('ready', () => {
                assert.isOk(true);
                s.destroy();
                done();
            });
        });
        it('lookup', (done) => {
            s = e.connect({});
            s.on('lookup', () => {
                assert.isOk(true);
                done();
            });
            s.destroy();
        });
        it('data', (done) => {
            s = e.connect({});
            s.setEncoding("utf8")
            s.write('test');
            s.on('data', (data) => {
                assert.strictEqual(data, 'test')
                s.destroy();
                done();
            })
        });
        it('close', (done) => {
            s = e.connect({});
            s.end();
            s.on('close', () => {
                assert.isOk(true);
                done();
            });
            s.destroy();
        });
        it('timeout', (done) => {
            let start = new Date().getMilliseconds();
            s = e.connect({});
            s.on('connect', () => {
                let end = new Date().getMilliseconds();
                assert.isOk(s);
                assert.approximately(end - start, 150, 150, "Could not connect within 300 ms")
                done();
            });
        });
    });
    after(() =>{
       server.close();
       s.end();
    });
});
