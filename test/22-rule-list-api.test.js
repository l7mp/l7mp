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
const http     = require('http');
const Rule     = require('../rule.js').Rule;
const RuleList = require('../rule.js').RuleList;

let static_config = {
    "admin": {
        "log_level": "info",
        "log_file": "stdout",
        "access_log_path": "/tmp/admin_access.log"
    },
    "listeners": [
        {
            "name": "controller-listener",
            "spec": {
                "protocol": "HTTP",
                "port": 1234
            },
            "rules": [
                {
                    "action": {
                        "route": {
                            "destination": {
                                "name": "l7mp-controller",
                                "spec": {
                                    "protocol": "L7mpController"
                                }
                            }
                        }
                    }
                }
            ]
        }
    ]
};

function httpRequest(params, postData) {
    return new Promise((resolve, reject) => {
        var req = http.request(params, (res) => {
            // reject on bad status
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error('statusCode=' + res.statusCode));
            }
            // cumulate data
            var body = [];
            res.on('data', function(chunk) {
                body.push(chunk);
            });
            // resolve on end
            res.on('end', function() {
                try {
                    body = JSON.parse(Buffer.concat(body).toString());
                } catch(e) {
                    reject(e);
                }
                resolve(body);
            });
        });
        // reject on request error
        req.on('error', function(err) {
            // This is not a "Second reject", just a different sort of failure
            reject(err);
        });
        if (postData) {
            req.write(postData);
        }
        // IMPORTANT
        req.end();
    });
}

describe('RuleList API', ()  => {
    before( async () => {
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        l7mp.applyAdmin({ log_level: 'warn' });
        await l7mp.run();
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('get-rulelists', () => {
        let res;
        it('controller-rulelists', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists',
                method: 'GET'
            };
            res = await httpRequest(options);
            console.log(res)
            return Promise.resolve();
        });
        it('length',        () => { assert.lengthOf(res, 1); });
        it('has-name',      () => { assert.property(res[0], 'name'); });
        it('has-rules',     () => { assert.property(res[0], 'rules'); });
        it('lengtOf-rules', () => { assert.lengthOf(res, 1); });
        it('rule-type',     () => { assert.isString(res[0].rules[0]); });
    });
    context('add-check-delete-rulelist-via-api', () =>{
        let res;
        it('add-rulelist', async () =>{
            const postData = JSON.stringify({
                'rulelist': {
                    name: 'test-rulelist',
                    rules: [{name: 'test', action: {route: {destination: 'echo'}}}]
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });
        context('check-properties', ()=>{
            it('rulelist-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/rulelists',
                    method: 'GET'
                };
                res = await httpRequest(options);
                return Promise.resolve();
            });
            it('length-of-routes',  () => { assert.lengthOf(res, 2); });
            it('has-name',          () => { assert.property(res[1], 'name'); });
            it('name-value',        () => { assert.propertyVal(res[1], 'name', 'test-rulelist'); });
        });
        context('delete',()=>{
            let res;
            it('delete-rulelist', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/rulelists/test-rulelist',
                    method: 'DELETE'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res,'status', 200);
                return Promise.resolve()
            });
        });
    });
    context('add-check-delete-multiple-rulelists', ()=>{
        let res;
        it('add-5-rulelists', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json'}
            }
            let reqs = [];
            for(let i = 1; i < 6; i++){
                let postData = JSON.stringify({
                    'rulelist': {
                        name: `test-rulelist-${i}`,
                        rules: ['test']
                    }
                });
                reqs.push(httpRequest(options, postData))
            }
            await Promise.all(reqs);
            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists',
                method: 'GET'
            };

            res = await httpRequest(options_get);
            assert.lengthOf(res, 6);
            return Promise.resolve();
        });
        it('check-rulelist-1', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-rulelist-1');});
        it('check-rulelist-2', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-rulelist-2');});
        it('check-rulelist-3', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-rulelist-3');});
        it('check-rulelist-4', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-rulelist-4');});
        it('check-rulelist-5', ()=>{ assert.nestedPropertyVal(res[5], 'name', 'test-rulelist-5');});
        it('delete-multiple-rulelists', async ()=>{
            let reqs = [];
            for(let i = 1; i < 6; i++){
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/rulelists/test-rulelist-${i}`,
                    method: 'DELETE'
                };
                reqs.push(httpRequest(options))
                await Promise.all(reqs)

            }
            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists',
                method: 'GET'
            };
            res = await httpRequest(options_get);
            assert.lengthOf(res, 1);
            return Promise.resolve();
        });
    });

    context('add/delete-rule-to/from-rulelist', ()=>{
        let res;
        it('add-rule-to-rulelist', async ()=>{
            const postData_rule = JSON.stringify({
                'rule': {
                    name: 'test-rule',
                    action: {route: {destination: 'echo'}}
                }
            });
            let options_rule = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists/controller-listener-RuleList-0/rules/1', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json'}
            }
            res = await httpRequest(options_rule, postData_rule);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
        it('delete-rule-from-rulelist', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists/controller-listener-RuleList-0/rules/1',
                method: 'DELETE'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res,'status', 200);
            return Promise.resolve()
        });
        it('controller-rulelists', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists',
                method: 'GET'
            };
            res = await httpRequest(options);
            return Promise.resolve();
        });
    });

    context('invalid-requests', ()=>{
        it('validation-fail', async ()=>{
            let postData = JSON.stringify({
                'rulelist': {
                    name: 'rulelist-without-required-parameters',
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            await httpRequest(options, postData)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });
        it('already-defined-rulelist', async ()=>{
            let postData = JSON.stringify({
                'rulelist': {
                    name: 'controller-listener-RuleList-0',
                    rules: ['test']
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            await httpRequest(options, postData)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });
        it('delete-nonexistent-rulelist', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists/nonexistent-rulelist', method: 'DELETE'
            }
            await httpRequest(options)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });
        it('add-rule-to-rulelist-at-wrong-position', async ()=>{
            const postData = JSON.stringify({
                'rule': {
                    name: 'test-rule-wrong-pos',
                    action: {route: {destination: 'echo'}}
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists/controller-listener-RuleList-0/rules/10', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json'}
            }
            await httpRequest(options, postData)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });
    })
});