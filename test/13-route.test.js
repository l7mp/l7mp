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

const assert = require('chai').assert;
const L7mp   = require('../l7mp.js').L7mp;
const Route  = require('../route.js').Route;

describe('Route', () => {
    var c; 
    before( () => {
        l7mp = new L7mp();
        // l7mp.applyAdmin({ log_level: 'silly' });
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
    });

    context('Create', () => {
        it('created', () => {
            c = Route.create({name: 'Route', destination: '127.0.0.1',  ingress: '127.0.0.1', egress: '127.0.0.1'}); 
            assert.exists(c);
        }); 
        it('object',            () => { assert.isObject(c); }); 
        it('instanceOf',        () => { assert.instanceOf(c, Route); });
        it('has-name',          () => { assert.property(c, 'name'); });
        it('has-destination',   () => { assert.property(c, 'destination'); }); 
        it('has-ingress',       () => { assert.property(c, 'ingress'); });
        it('has-egress',        () => { assert.property(c, 'egress'); });
        it('has-retry',         () => { assert.property(c, 'retry'); }); 
        it('retry-retry_on',    () => { assert.nestedPropertyVal(c, 'retry.retry_on', 'never'); });
        it('retry-num_retries', () => { assert.nestedPropertyVal(c, 'retry.num_retries', 1); });
        it('retry-timeout',     () => { assert.nestedPropertyVal(c, 'retry.timeout', 2000); }); 
    }); 
});