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
        it('created',      () => { assert.exists(c = Cluster.create({name: 'Echo', spec: {protocol: 'Echo'}})); });
        it('runs',   async () => { await c.run(); assert.isOk(true);});
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
        it('runs', async   () => { await c.run(); assert.isOk(c); });
        it('stream', async () => { s = await c.stream({name:"test-session"}); });
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
