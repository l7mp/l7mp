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

const log      = require('npmlog');
const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const http     = require('http');
const Rule     = require('../rule.js').Rule;
const RuleList = require('../rule.js').RuleList;

let static_config = {
    admin: {
        log_level: "error",
        // log_level: "silly",
        log_file: "stdout",
        access_log_path: "/tmp/admin_access.log",
        strict: true,
    },
    listeners: [
        {
            name: "controller-listener",
            spec: {
                protocol: "HTTP",
                port: 1234
            },
            rules: [
                {
                    action: {
                        route: {
                            destination: {
                                name: "l7mp-controller",
                                spec: {
                                    protocol: "L7mpController"
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
    let controller_rulelist_name;
    before( async function () {
        this.timeout(8000);
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        // validate the static config
        l7mp.admin.strict = true;
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
            controller_rulelist_name = res[0].name;
            return Promise.resolve();
        });
        it('length',        () => { assert.lengthOf(res, 1); });
        it('has-name',      () => { assert.property(res[0], 'name'); });
        it('has-rules',     () => { assert.property(res[0], 'rules'); });
        it('lengthOf-rules', () => { assert.lengthOf(res, 1); });
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
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
        context('check-properties', ()=>{
            it('get-rulelist-by-name', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/rulelists/test-rulelist',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.isOk(res);
                return Promise.resolve();
            });
            it('has-name',          () => { assert.property(res, 'name')});
            it('name-value',        () => { assert.propertyVal(res, 'name', 'test-rulelist')});
            it('has-rules',         () => {assert.property(res, 'rules')});
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
        it('check-rulelist-1', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-rulelist-1'));});
        it('check-rulelist-2', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-rulelist-2'));});
        it('check-rulelist-3', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-rulelist-3'));});
        it('check-rulelist-4', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-rulelist-4'));});
        it('check-rulelist-5', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-rulelist-5'));});
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
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1`, method: 'POST'
                , headers: {'Content-Type' : 'text/x-json'}
            }
            res = await httpRequest(options_rule, postData_rule);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
        it('get-rule-by-position', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1`,
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res, 'name', 'test-rule');
        });
        it('has-match', () => { assert.nestedProperty(res, 'match.match')});
        it('has-action-route', () => { assert.nestedProperty(res, 'action.route')});
        it('delete-rule-from-rulelist', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1`,
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

    context('recursive-get-delete',()=>{
        let res, name;
        it('recursive-get', async()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists?recursive=true',
                method: 'GET'
            };
            res = await httpRequest(options);
            name = res[0].name;
            //check response if it is fully recursive or not
            assert.nestedProperty(res[0],'rules');
            assert.nestedProperty(res[0].rules[0],'name');
            assert.nestedProperty(res[0].rules[0],'match');
            assert.nestedProperty(res[0].rules[0],'action');
            assert.nestedProperty(res[0].rules[0].action.route,'destination');
            assert.nestedProperty(res[0].rules[0].action.route.destination,'name');
            return Promise.resolve();
        });
        it('recursive-get-by-name', async()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${name}?recursive=true`,
                method: 'GET'
            };
            res = await httpRequest(options);
            //check response if it is fully recursive or not
            assert.nestedProperty(res,'rules');
            assert.nestedProperty(res.rules[0],'name');
            assert.nestedProperty(res.rules[0],'match');
            assert.nestedProperty(res.rules[0],'action');
            assert.nestedProperty(res.rules[0].action.route,'destination');
            assert.nestedProperty(res.rules[0].action.route.destination,'name');
            return Promise.resolve();
        });
        it('add-rulelist-to-delete-recursively', async () =>{
            const postData = JSON.stringify({
                'rulelist': {
                    name: 'recursive-rulelist',
                    rules:
                        [
                            {
                                name: 'recursive-test',
                                action:
                                    {
                                        route:
                                            {
                                                destination:
                                                    {
                                                        name: "recursive-test",
                                                        spec:
                                                            {
                                                                protocol: "Echo"
                                                            }
                                                    }
                                            }
                                    }
                            }
                        ]
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });

        it('recursive-get-rule-from-rulelist', async()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists/recursive-rulelist/rules/0?recursive=true',
                method: 'GET'
            };
            res = await httpRequest(options);
            //check response if it is fully recursive or not
            assert.nestedProperty(res,'name');
            assert.nestedPropertyVal(res,'name','recursive-test');
            assert.nestedProperty(res.action.route,'name');
            assert.nestedProperty(res.action.route,'destination',);
            assert.nestedPropertyVal(res.action.route.destination,'name','recursive-test');
            return Promise.resolve();
        });

        it('recursive-delete-rulelist', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists/recursive-rulelist?recursive=true',
                method: 'DELETE'
            };
            res = await httpRequest(options);
            assert.isNotOk(l7mp.getRuleList('recursive-rulelist'))
            return Promise.resolve()
        });
    })

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
                    name: `${controller_rulelist_name}`,
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
    });

    context('delete-rule-from-rulelist-by-pos-recursive', ()=>{
        let res;
        it('controller-rulelists', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rulelists',
                method: 'GET'
            };
            res = await httpRequest(options);
            controller_rulelist_name = res[0].name;
            return Promise.resolve();
        });
        it('add-rule-to-rulelist', async ()=>{
            // rule contains implicit cluster spec
            // delete test-rule if exists and add it back again
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rules/test-rule',
                method: 'DELETE'
            };
            try {
                res = await httpRequest(options);
            } catch(err) { /* ignore */ }            
            const postData_rule = JSON.stringify({
                'rule': {
                    name: 'test-rule',
                    action: {route: {destination: { name: "echo-2", spec: { protocol: "Echo"}}}}
                }
            });
            let options_rule = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1`, method: 'POST',
                headers: {'Content-Type' : 'text/x-json'}
            }
            res = await httpRequest(options_rule, postData_rule);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
        it('get-rule-by-position', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1`,
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res, 'name', 'test-rule');
        });
        it('get-cluster', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/echo-2`,
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res, 'name', 'echo-2');
            return Promise.resolve()
        });
        it('delete-rule-from-rulelist-by-pos-recursive', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1?recursive=true`,
                method: 'DELETE'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res,'status', 200);
            return Promise.resolve()
        });
        it('get-cluster-missing', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/echo-2`,
                method: 'GET'
            };
            await httpRequest(options).catch( (err) => {
                return Promise.resolve()
            });
        });
        it('controller-rulelists', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}`,
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.lengthOf(res.rules,1);
            return Promise.resolve();
        });
    });

    context('delete-rule-from-rulelist-by-name-recursive', ()=>{
        let res;
        it('add-rule-to-rulelist', async ()=>{
            // rule contains implicit cluster spec
            const postData_rule = JSON.stringify({
                'rule': {
                    name: 'test-rule',
                    action: {route: {destination: { name: "echo-2", spec: { protocol: "Echo"}}}}
                }
            });
            let options_rule = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1`, method: 'POST',
                headers: {'Content-Type' : 'text/x-json'}
            }
            res = await httpRequest(options_rule, postData_rule);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
        it('get-rule-by-position', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/1`,
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res, 'name', 'test-rule');
        });
        it('get-cluster', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/echo-2`,
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res, 'name', 'echo-2');
            return Promise.resolve()
        });
        it('delete-rule-from-rulelist-by-namerecursive', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}/rules/test-rule?recursive=true`,
                method: 'DELETE'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res,'status', 200);
            return Promise.resolve()
        });
        it('get-cluster-missing', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/echo-2`,
                method: 'GET'
            };
            await httpRequest(options).catch( (err) => {
                return Promise.resolve()
            });
        });
        it('controller-rulelists', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/rulelists/${controller_rulelist_name}`,
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.lengthOf(res.rules,1);
            return Promise.resolve();
        });
    });

    // The functionality is NOT implemented yet, should check before uncomment
    // context('remove', ()=>{
    //     let res;
    //     // Next two tests stick together
    //     it('add-rulelist-to-remove', async ()=>{
    //         const postData = JSON.stringify({
    //             'rulelist': {
    //                 name: 'test-remove-last-rule',
    //                 rules: ['test']
    //             }
    //         });
    //         let options = {
    //             host: 'localhost', port: 1234,
    //             path: '/api/v1/rulelists', method: 'POST'
    //             , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
    //         }
    //         res = await httpRequest(options, postData);
    //         assert.nestedPropertyVal(res,'status', 200);
    //         return Promise.resolve()
    //     })
    //     it('remove-last-rule-remove-rulelist', async()=>{
    //         let options_delete_rule = {
    //             host: 'localhost', port: 1234,
    //             path: '/api/v1/rulelists/test-remove-last-rule/rules/0',
    //             method: 'DELETE'
    //         };
    //         res = await httpRequest(options_delete_rule);
    //         assert.nestedPropertyVal(res,'status', 200);
    //
    //         let options_get = {
    //             host: 'localhost', port: 1234,
    //             path: '/api/v1/rulelists/test-remove-last-rule',
    //             method: 'GET'
    //         };
    //         await httpRequest(options_get)
    //             .then(
    //                 ()=>{return Promise.reject(new Error('Expected method to reject.'))},
    //                 err => { assert.instanceOf(err, Error); return Promise.resolve()}
    //             )
    //     });
    //
    //     it('add-listener', async() => {
    //         const postData = JSON.stringify({
    //             "listener": {
    //                 name: "test-listener",
    //                 spec: {protocol: "UDP", port: 15000},
    //                 rules: [{
    //                     action: {
    //                         route: {
    //                             destination: "user-1-2-c",
    //                             ingress: [
    //                                 {name: "Echo", spec: {protocol: "Echo"}}
    //                             ],
    //                             retry: {retry_on: "always", num_retries: 10, timeout: 2000}
    //                         }
    //                     }
    //                 }
    //                 ]
    //             }
    //         });
    //         let options = {
    //             host: 'localhost', port: 1234,
    //             path: '/api/v1/listeners', method: 'POST'
    //             , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
    //         }
    //         res = await httpRequest(options, postData);
    //         assert.nestedPropertyVal(res, 'status', 200);
    //         return Promise.resolve()
    //     });
    //     it('remove-rulelist-from-listener', async ()=>{
    //
    //     });
    // });

});
