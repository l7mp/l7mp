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

const util      = require('util');
const assert    = require('chai').assert;
const _         = require('lodash');
const Rule      = require('../rule.js').Rule;

var d, l, listener = {
    "listener": {
        "name": "user-1-2-l",
        "spec": {
            "protocol": "UDP",
            "port": 15000
        },
        "rules": [
            {
                "action": {
                    "route": {
                        "destination": "user-1-2-c",
                        "ingress": [
                            {
                                "name": "Echo",
                                "spec": {
                                    "protocol": "Echo"
                                }
                            }
                        ],
                        "retry": {
                            "retry_on": "always",
                            "num_retries": 10,
                            "timeout": 2000
                        }
                    }
                }
            }
        ],
        "options": {
            "track": 60
        }
    }
};

describe('getAtPath', ()  => {
    beforeEach( () => {
        l = _.cloneDeep(listener);
    });

    context('leading-slash', () => {
        it('/',                                          () => { let x = Rule.getAtPath(l, '/'); assert.deepEqual(x, listener); });
        it('/listener',                                  () => { let x = Rule.getAtPath(l, '/listener'); assert.deepEqual(x, listener.listener); });
        it('/listener/rules',                            () => { let x = Rule.getAtPath(l, '/listener/rules'); assert.deepEqual(x, listener.listener.rules); });
        it('/listener/rules/0',                          () => { let x = Rule.getAtPath(l, '/listener/rules/0'); assert.deepEqual(x, listener.listener.rules[0]) });
        it('/listener/rules/0/action',                   () => { let x = Rule.getAtPath(l, '/listener/rules/0/action'); assert.deepEqual(x, listener.listener.rules[0].action); });
        it('/listener/rules/0/action/route',             () => { let x = Rule.getAtPath(l, '/listener/rules/0/action/route'); assert.deepEqual(x, listener.listener.rules[0].action.route); });
        it('/listener/rules/0/action/route/destination', () => { let x = Rule.getAtPath(l, '/listener/rules/0/action/route/destination'); assert.equal(x, "user-1-2-c"); });
    });

    context('no-leading-slash', () => {
        it('listener',                                  () => { let x = Rule.getAtPath(l, 'listener'); assert.deepEqual(x, listener.listener); });
        it('listener/rules',                            () => { let x = Rule.getAtPath(l, 'listener/rules'); assert.deepEqual(x, listener.listener.rules); });
        it('/listener/rules/0',                         () => { let x = Rule.getAtPath(l, '/listener/rules/0'); assert.deepEqual(x, listener.listener.rules[0]) });
        it('listener/rules/0/action',                   () => { let x = Rule.getAtPath(l, 'listener/rules/0/action'); assert.deepEqual(x, listener.listener.rules[0].action); });
        it('listener/rules/0/action/route',             () => { let x = Rule.getAtPath(l, 'listener/rules/0/action/route'); assert.deepEqual(x, listener.listener.rules[0].action.route); });
        it('listener/rules/0/action/route/destination', () => { let x = Rule.getAtPath(l, 'listener/rules/0/action/route/destination'); assert.equal(x, "user-1-2-c"); });
    });

    context('leading-slash-trailing-slash', () => {
        it('/listener/',                                  () => { let x = Rule.getAtPath(l, '/listener/'); assert.deepEqual(x, listener.listener); });
        it('/listener/rules/',                            () => { let x = Rule.getAtPath(l, '/listener/rules/'); assert.deepEqual(x, listener.listener.rules); });
        it('/listener/rules/0',                           () => { let x = Rule.getAtPath(l, '/listener/rules/0'); assert.deepEqual(x, listener.listener.rules[0]) });
        it('/listener/rules/0/action/',                   () => { let x = Rule.getAtPath(l, '/listener/rules/0/action/'); assert.deepEqual(x, listener.listener.rules[0].action); });
        it('/listener/rules/0/action/route/',             () => { let x = Rule.getAtPath(l, '/listener/rules/0/action/route/'); assert.deepEqual(x, listener.listener.rules[0].action.route); });
        it('/listener/rules/0/action/route/destination/', () => { let x = Rule.getAtPath(l, '/listener/rules/0/action/route/destination/'); assert.equal(x, "user-1-2-c"); });
    });

    context('no-leading-slash-trailing-slash', () => {
        it('listener/',                                  () => { let x = Rule.getAtPath(l, 'listener/'); assert.deepEqual(x, listener.listener); });
        it('listener/rules/',                            () => { let x = Rule.getAtPath(l, 'listener/rules/'); assert.deepEqual(x, listener.listener.rules); });
        it('/listener/rules/0',                          () => { let x = Rule.getAtPath(l, '/listener/rules/0'); assert.deepEqual(x, listener.listener.rules[0]) });
        it('listener/rules/0/action/',                   () => { let x = Rule.getAtPath(l, 'listener/rules/0/action/'); assert.deepEqual(x, listener.listener.rules[0].action); });
        it('listener/rules/0/action/route/',             () => { let x = Rule.getAtPath(l, 'listener/rules/0/action/route/'); assert.deepEqual(x, listener.listener.rules[0].action.route); });
        it('listener/rules/0/action/route/destination/', () => { let x = Rule.getAtPath(l, 'listener/rules/0/action/route/destination/'); assert.equal(x, "user-1-2-c"); });
    });
});


describe('setAtPath', ()  => {
    context('leading-slash - value', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = "metadata";
        });

        it('/',                                          () => { let x = Rule.setAtPath(l, '/', d); assert.deepEqual(x, d); });
        it('/listener',                                  () => { let x = Rule.setAtPath(l, '/listener', d); assert.deepEqual(x.listener, d); });
        it('/listener/rules',                            () => { let x = Rule.setAtPath(l, '/listener/rules', d); assert.deepEqual(x.listener.rules, d); });
        it('/listener/rules/1',                          () => { let x = Rule.setAtPath(l, '/listener/rules/1', d); assert.deepEqual(x.listener.rules[1], d) });
        it('/listener/rules/1/action',                   () => { let x = Rule.setAtPath(l, '/listener/rules/1/action', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('/listener/rules/1/action/route',             () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route',d);assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('/listener/rules/1/action/route/destination', () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route/destination', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

    context('leading-slash - object', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = {
                "some": {
                    "nested": {
                        "meta-1": "data",
                        "meta-2": "data",
                    }
                }
            };
        });

        it('/',                                          () => { let x = Rule.setAtPath(l, '/', d); assert.deepEqual(x, d); });
        it('/listener',                                  () => { let x = Rule.setAtPath(l, '/listener', d); assert.deepEqual(x.listener, d); });
        it('/listener/rules',                            () => { let x = Rule.setAtPath(l, '/listener/rules', d); assert.deepEqual(x.listener.rules, d); });
        it('/listener/rules/1',                          () => { let x = Rule.setAtPath(l, '/listener/rules/1', d); assert.deepEqual(x.listener.rules[1], d) });
        it('/listener/rules/1/action',                   () => { let x = Rule.setAtPath(l, '/listener/rules/1/action', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('/listener/rules/1/action/route',             () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route',d); assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('/listener/rules/1/action/route/destination', () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route/destination', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

    context('leading-slash-trailing-slash - value', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = "metadata";
        });

        it('/listener/',                                  () => { let x = Rule.setAtPath(l, '/listener/', d); assert.deepEqual(x.listener, d); });
        it('/listener/rules/',                            () => { let x = Rule.setAtPath(l, '/listener/rules/', d); assert.deepEqual(x.listener.rules, d); });
        it('/listener/rules/1/',                          () => { let x = Rule.setAtPath(l, '/listener/rules/1/', d); assert.deepEqual(x.listener.rules[1], d) });
        it('/listener/rules/1/action/',                   () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('/listener/rules/1/action/route/',             () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route/',d);assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('/listener/rules/1/action/route/destination/', () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route/destination/', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

    context('leading-slash-trailing-slash - object', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = {
                "some": {
                    "nested": {
                        "meta-1": "data",
                        "meta-2": "data",
                    }
                }
            };
        });

        it('/listener/',                                  () => { let x = Rule.setAtPath(l, '/listener/', d); assert.deepEqual(x.listener, d); });
        it('/listener/rules/',                            () => { let x = Rule.setAtPath(l, '/listener/rules/', d); assert.deepEqual(x.listener.rules, d); });
        it('/listener/rules/1/',                          () => { let x = Rule.setAtPath(l, '/listener/rules/1/', d); assert.deepEqual(x.listener.rules[1], d) });
        it('/listener/rules/1/action/',                   () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('/listener/rules/1/action/route/',             () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route/',d); assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('/listener/rules/1/action/route/destination/', () => { let x = Rule.setAtPath(l, '/listener/rules/1/action/route/destination/', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

    context('no-leading-slash-trailing-slash - value', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = "metadata";
        });

        it('listener/',                                  () => { let x = Rule.setAtPath(l, 'listener/', d); assert.deepEqual(x.listener, d); });
        it('listener/rules/',                            () => { let x = Rule.setAtPath(l, 'listener/rules/', d); assert.deepEqual(x.listener.rules, d); });
        it('listener/rules/1/',                          () => { let x = Rule.setAtPath(l, 'listener/rules/1/', d); assert.deepEqual(x.listener.rules[1], d) });
        it('listener/rules/1/action/',                   () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('listener/rules/1/action/route/',             () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route/',d);assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('listener/rules/1/action/route/destination/', () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route/destination/', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

    context('no-leading-slash-trailing-slash - object', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = {
                "some": {
                    "nested": {
                        "meta-1": "data",
                        "meta-2": "data",
                    }
                }
            };
        });

        it('listener/',                                  () => { let x = Rule.setAtPath(l, 'listener/', d); assert.deepEqual(x.listener, d); });
        it('listener/rules/',                            () => { let x = Rule.setAtPath(l, 'listener/rules/', d); assert.deepEqual(x.listener.rules, d); });
        it('listener/rules/1/',                          () => { let x = Rule.setAtPath(l, 'listener/rules/1/', d); assert.deepEqual(x.listener.rules[1], d) });
        it('listener/rules/1/action/',                   () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('listener/rules/1/action/route/',             () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route/',d); assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('listener/rules/1/action/route/destination/', () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route/destination/', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

    context('no-leading-slash-no-trailing-slash - value', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = "metadata";
        });

        it('listener',                                  () => { let x = Rule.setAtPath(l, 'listener', d); assert.deepEqual(x.listener, d); });
        it('listener/rules',                            () => { let x = Rule.setAtPath(l, 'listener/rules', d); assert.deepEqual(x.listener.rules, d); });
        it('listener/rules/1',                          () => { let x = Rule.setAtPath(l, 'listener/rules/1', d); assert.deepEqual(x.listener.rules[1], d) });
        it('listener/rules/1/action',                   () => { let x = Rule.setAtPath(l, 'listener/rules/1/action', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('listener/rules/1/action/route',             () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route',d);assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('listener/rules/1/action/route/destination', () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route/destination', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

    context('no-leading-slash-no-trailing-slash - object', () => {
        beforeEach( () => {
            l = _.cloneDeep(listener);
            d = {
                "some": {
                    "nested": {
                        "meta-1": "data",
                        "meta-2": "data",
                    }
                }
            };
        });

        it('listener',                                  () => { let x = Rule.setAtPath(l, 'listener', d); assert.deepEqual(x.listener, d); });
        it('listener/rules',                            () => { let x = Rule.setAtPath(l, 'listener/rules', d); assert.deepEqual(x.listener.rules, d); });
        it('listener/rules/1',                          () => { let x = Rule.setAtPath(l, 'listener/rules/1', d); assert.deepEqual(x.listener.rules[1], d) });
        it('listener/rules/1/action',                   () => { let x = Rule.setAtPath(l, 'listener/rules/1/action', d); assert.deepEqual(x.listener.rules[1].action, d); });
        it('listener/rules/1/action/route',             () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route',d); assert.deepEqual(x.listener.rules[1].action.route, d); });
        it('listener/rules/1/action/route/destination', () => { let x = Rule.setAtPath(l, 'listener/rules/1/action/route/destination', d); assert.deepEqual(x.listener.rules[1].action.route.destination, d); });
    });

});
