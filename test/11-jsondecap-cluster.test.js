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
const log     = require('npmlog');

describe('JSONDecapCluster', () => {
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run();
    });

    context('create', () => {
        var c;
        it('created',      () => { assert.exists(c = Cluster.create({name: 'JSONDecap', spec: {protocol: 'JSONDecap'}})); });
        it('runs',   async () => { await c.run(); assert.isOk(true); });
        it('object',       () => { assert.isObject(c); });
        it('instanceOf',   () => { assert.instanceOf(c, Cluster); });
        it('has-name',     () => { assert.property(c, 'name'); });
        it('has-spec',     () => { assert.property(c, 'spec'); });
        it('has-protocol', () => { assert.deepPropertyVal(c, 'spec', {protocol: 'JSONDecap'}); });
    });

    context('stream()', () => {
        var c, s;
        c = Cluster.create({name: 'JSONDecap', spec: {protocol: 'JSONDecap'}});
        it('runs', async () => { await c.run(); assert.isOk(true);});
        it('stream',async() => { s = await c.stream({name:"test-session"}); assert.exists(s); });
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
        it('runs',   async () => { await c.run(); assert.isOk(true); });
        it('stream', async () => { s = await c.stream({name:"test-session"}); assert.exists(s); });
        it('not-correct', (done) => {
            s.stream.write('dummy');
            s.stream.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = s.stream.read())) {
                    data += chunk.toString('base64');
                }
                // decap cluster should slilently drop invalid data
                assert.equal(data, '');
                done();
            });
        });
    });
});
