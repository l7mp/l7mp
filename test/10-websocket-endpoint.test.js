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

const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const EndPoint = require('../cluster.js').EndPoint;
const WebSocket = require('ws');

describe('WebSocket', () => {
    var e, s_ok;
    before( () => {
        wss = new WebSocket.Server({ port: 8080 });
        wss.on("connection", ws => {
            ws.on("message", data => {        
                ws.send(data);
            });
        }); 
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); 
    });

    after( () => {
        wss.close();
    });

    context('create', () => {
        it('runs',         () => { 
            assert.exists(e = EndPoint.create(
                {protocol: 'WebSocket', spec: {port: 8080}},
                {spec: {address: '127.0.0.1', port: 8080}})); });
        it('object',       () => { assert.isObject(e); });        it('instanceOf',   () => { assert.instanceOf(e, EndPoint); });
        it('has-name',     () => { assert.property(e, 'name'); });
        it('has-spec',     () => { assert.property(e, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(e, 'protocol', 'WebSocket'); });
    });

    context('create-with-bind', () => {
        it('runs',         () => { 
            assert.exists(e = EndPoint.create(
                {protocol: 'WebSocket', spec: {port: 8080, bind: {address: '127.0.0.1', port: 8080}}},
                {spec: {address: '127.0.0.1', port: 8080}})); });
        it('object',       () => { assert.isObject(e); });        it('instanceOf',   () => { assert.instanceOf(e, EndPoint); });
        it('has-name',     () => { assert.property(e, 'name'); });
        it('has-spec',     () => { assert.property(e, 'spec'); });
        it('has-protocol', () => { assert.propertyVal(e, 'protocol', 'WebSocket'); });
    });

    context('#connect()', () => {
        it('ok', (done) => {
            s_ok = e.connect({metadata: {HTTP: {}}});
            s_ok.once('open', () => { assert.isOk(true); done(); });
        });
        it('exists',     () => { assert.isOk(s_ok); });
        it('instanceOf', () => { assert.instanceOf(s_ok, WebSocket); });
        it('error', (done) => {
            let ew = EndPoint.create(
                {protocol: 'WebSocket', spec: {port: 10000, bind: {address: '127.0.0.1', port: 10000}}},
                {spec: {address: '127.0.0.1', port: 10000}});
            let ok  = ew.connect({metadata: {HTTP: {}}});
            ok.once('error', () => { assert.isOk(true); done(); });
        }); 
        it('end', (done) => {
            s_ok.once('end', () => { assert.isOk(true); done(); });
            s_ok.emit('end');
        }); 
        it('send', () => {
            s_ok.addEventListener("message", msg => {
                assert.equal(msg.data, 'Test');
            });
            s_ok.send('Test');
        });
        it('options', (done) => {
            let s = { 
                metadata: {
                    HTTP: {
                        url: {
                            protocol: 'ws',
                            host: '127.0.0.1',
                            port: 8080,
                            path: '/',
                        },
                        headers: {
                            host: '127.0.0.1',
                        }
                    }
                },
            }; 
            s_ok = e.connect(s);
            s_ok.once('open', () => { assert.isOk(true); done(); });
        });
    }); 
}); 