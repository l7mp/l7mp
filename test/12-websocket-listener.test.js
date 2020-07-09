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

const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const Net          = require('net');
const WebSocket    = require('ws');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;

describe('WebSocketListener', () => {
    var c, l, s; 
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('create', () => {
        it('created',      () => { l = Listener.create( {name: 'WebSocket', spec: { protocol: 'WebSocket', port: 12345 }}); assert.exists(l); });
        it('object',       () => { assert.isObject(l); });
        it('instanceOf',   () => { assert.instanceOf(l, Listener); });
        it('Emitter',      () => { assert.instanceOf(l, EventEmitter); });
        it('has-name',     () => { assert.property(l, 'name'); });
        it('has-spec',     () => { assert.property(l, 'spec'); });
        it('has-protocol', () => { assert.nestedPropertyVal(l, 'spec.protocol', 'WebSocket'); });
        it('has-port',     () => { assert.nestedPropertyVal(l, 'spec.port', 12345); });
        it('can-listen',   () => { l.emitter = (x) => { s = x; }; assert.isOk(true); });
    });

    context('#run', () => {
        it('runs', () => { l.run(); assert.exists(l); });
    });

    context('#connect', () => {
        it('connect',    (done) => { c = new WebSocket('ws://127.0.0.1:12345'); assert.instanceOf(c, WebSocket); done(); });
        // it('address',        () => { assert.equal(c.localAddress, '127.0.0.1'); });
        // it('remote-address', () => { assert.equal(c.remoteAddress, '127.0.0.1'); });
        // it('remote-port',    () => { assert.equal(c.remotePort, 54321); });
        // it('isa stream',     () => { assert.instanceOf(c, Stream); });
        // it('readable',       () => { assert.isOk(c.readable); });
        // it('writeable',      () => { assert.isOk(c.writable); });
    });

    context('emits session', () => {
        it('emits',                     () => { assert.isOk(s); });
        it('session-metadata',          () => { assert.property(s, 'metadata'); });
        it('session-metadata-name',     () => { assert.nestedProperty(s, 'metadata.name'); });
        it('session-metadata-IP',       () => { assert.nestedProperty(s, 'metadata.IP'); });
        it('session-metadata-src-addr', () => { assert.nestedProperty(s, 'metadata.IP.src_addr'); });
        it('session-metadata-src-addr', () => { assert.match(s.metadata.IP.src_addr, /127.0.0.1/); });
        it('session-metadata-dst-addr', () => { assert.nestedProperty(s, 'metadata.IP.dst_addr'); });
        it('session-metadata-dst-addr', () => { assert.match(s.metadata.IP.dst_addr, /127.0.0.1/); });
        it('session-metadata-TCP',      () => { assert.nestedProperty(s, 'metadata.TCP'); });
        it('session-metadata-src-port', () => { assert.nestedProperty(s, 'metadata.TCP.src_port'); });
        it('session-metadata-dst-port', () => { assert.nestedPropertyVal(s, 'metadata.TCP.dst_port', 12345); });
        it('session-metadata-http',     () => { assert.nestedProperty(s, 'metadata.HTTP'); });
        it('session-metadata-http-version', () => { assert.nestedPropertyVal(s, 'metadata.HTTP.version', '1.1'); });
        it('session-metadata-http-method', () => { assert.nestedProperty(s, 'metadata.HTTP.method'); });
        it('session-listener',          () => { assert.nestedPropertyVal(s, 'source.origin', 'WebSocket'); });
        it('session-stream',            () => { assert.nestedProperty(s, 'source.stream'); });
        it('session-stream',            () => { assert.instanceOf(s.source.stream, Stream) });
        it('session-stream-readable',   () => { assert.isOk(s.source.stream.readable); });
        it('session-stream-writeable',  () => { assert.isOk(s.source.stream.writable); });
    });

    context('I/O', () => {
        it('read',  (done) => {
            s.source.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.source.stream.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                done();
            });
            c.send('test');
        });
        it('write',  (done) => {
            c.on('message', data => {
                assert.equal(data, 'test');
                done();
            });
            s.source.stream.write('test');
        });
        it('server-stream-end',  () => {
            s.source.stream.removeAllListeners();
            c.removeAllListeners();
            s.source.stream.destroy();
            assert.isOk(true);
        });
        it('client-stream-end',  () => { c.close(); assert.isOk(true); });
    });

    context('stop', () => {
        it('stop-server',  () => {
            l.close();
            assert.isOk(true);
        });
    });
}); 