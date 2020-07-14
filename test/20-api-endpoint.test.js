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
const Rule         = require('../rule.js').Rule;
const RuleList     = require('../rule.js').RuleList;
const http     = require('http');


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

describe('Rule API', ()  => {
    var e, s;
    before( async() => {
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        l7mp.applyAdmin({ log_level: 'error' , strict: true});
        await l7mp.run(); // should return
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('create', () => {
        it('controller-listener',         () => { assert.lengthOf(l7mp.listeners, 1); } );
        it('add-cluster', (done) =>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'test-cluster',
                    spec: {protocol: 'UDP', port: 16000, bind: {port: 16001, address: '127.0.0.1'}}
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            let req = http.request(options, (res)=>{
                res.setEncoding('utf8');
                let str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });
                res.on('end', () =>{
                    let par = JSON.parse(str);
                    done();
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });
        // it('get-cluster', (done) =>{
        //     let options = {
        //         host: 'localhost', port: 1234,
        //         path: '/api/v1/clusters',
        //         method: 'GET'
        //     };
        //     let callback = function (response) {
        //         let str = '';
        //         response.on('data', function (chunk) {
        //             str += chunk;
        //         });
        //         response.on('end', function () {
        //             let res = JSON.parse(str);
        //             assert.nestedPropertyVal(res[0], 'name', 'L7mpControllerCluster');
        //             done();
        //         });
        //
        //     }
        //     let req = http.request(options, callback).end();
        // });
    });
    context('add-check-delete-endpoints-via-api', ()=> {
        let res, str = '';

        it('add-endpoint', (done) => {
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name: 'test-cluster-EndPoint-0',
                        spec: { port: 15000, address: '127.0.0.1'}
                    }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            let req = http.request(options, (res) => {
                res.setEncoding('utf8');
                let str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });
                res.on('end', () => {
                    res = JSON.parse(str);
                    assert.nestedPropertyVal(res, 'status', 200);
                    done();
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });
        it('has-endpoint', (done) =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints',
                method: 'GET'
            };
            let callback = function (response) {
                str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    res = JSON.parse(str);
                    assert.lengthOf(res, 1);
                    done();
                });
            }
            http.request(options, callback).end();
        });
        it('has-endpoint-name', ()=>{ assert.nestedPropertyVal(res[0], 'name', 'test-cluster-EndPoint-0')});
        it('has-endpoint-spec', ()=>{ assert.nestedProperty(res[0], 'spec')});
        it('has-endpoint-spec-address', ()=>{ assert.nestedProperty(res[0], 'spec.address', '127.0.0.1')});
        it('has-endpoint-spec-port', ()=>{ assert.nestedProperty(res[0], 'spec.port', 15000)});

        it('delete-endpoint', (done)=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/test-cluster/endpoints/${res[0].name}`,
                method: 'DELETE'
            };

            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.once('end', function () {
                    let res = JSON.parse(str);
                    assert.nestedPropertyVal(res, 'status', 200);
                    done();
                });

            }
            http.request(options,callback).end();
        });
    });

    context('add-check-delete-multiple-clusters', ()=>{
        let res;
        it('add-5-endpoints', (done)=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints', method: 'POST'
                , headers: {'Content-Type' : 'application/json'}
            }
            for(let i = 1; i < 6; i++){
                let postData = JSON.stringify({
                    'endpoint':
                        {
                            name: `test-cluster-EndPoint-${i}`,
                            spec: { port: 15000 + i, address: '127.0.0.1'}
                        }
                });
                let req = http.request(options);
                req.once('error', (e) =>{
                    log.error(`Error: ${e.message}`);
                })
                req.write(postData);
                req.end();
            }
            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints',
                method: 'GET'
            };
            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.once('end', function () {
                    res = JSON.parse(str);
                    assert.lengthOf(res,5);
                    done();
                });

            }
            http.request(options_get, callback).end();
        });
        it('check-endpoint-1', ()=>{ assert.nestedPropertyVal(res[0], 'name', 'test-cluster-EndPoint-1');});
        it('check-endpoint-2', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-cluster-EndPoint-2');});
        it('check-endpoint-3', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-cluster-EndPoint-3');});
        it('check-endpoint-4', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-cluster-EndPoint-4');});
        it('check-endpoint-5', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-cluster-EndPoint-5');});
        it('delete-multiple-clusters', (done)=>{
            let req;
            for(let i = 1; i < 6; i++){
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/clusters/test-cluster/endpoints/test-cluster-EndPoint-${i}`,
                    method: 'DELETE'
                };
                req = http.request(options).end();

            }
            // leave some room for l7mp to process the delete requests
            setTimeout(() => {
                let callback = function (response) {
                    let str = '';
                    response.on('data', function (chunk) {
                        str += chunk;
                    });
                    response.once('end', function () {
                        res = JSON.parse(str);
                        assert.lengthOf(res,0);
                        done();
                    });

                }
                let options_get = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/test-cluster/endpoints',
                    method: 'GET'
                };
                http.request(options_get, callback).end();
            }, 500);
        });
    });
    context('error',()=>{
        it('add-existing-endpoint', (done)=>{
            //name should be test-cluster-EndPoint-6
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name:'test-cluster-EndPoint-exists' ,
                        spec: { port: 15000, address: '127.0.0.1'}
                    }
            });
            const postData_1 = JSON.stringify({
                'endpoint':
                    {
                        name:'test-cluster-EndPoint-exists' ,
                        spec: { port: 15000, address: '127.0.0.1'}
                    }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            let req = http.request(options);
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();

            let req_1 = http.request(options, (res) => {
                res.setEncoding('utf8');
                let str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });
                res.on('end', () => {
                    res = JSON.parse(str);
                    assert.nestedPropertyVal(res, 'status', 400);
                    done();
                });
            });
            req_1.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req_1.write(postData_1);
            req_1.end();
        });

        //TODO: should be deleted
        it('has-endpoint', (done) =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints',
                method: 'GET'
            };
            let callback = function (response) {
                str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    res = JSON.parse(str);
                    assert.lengthOf(res, 1);
                    done();
                });
            }
            http.request(options, callback).end();
        });

        // it('delete-non-existing-cluster',(done)=>{
        //     let options = {
        //         host: 'localhost', port: 1234,
        //         path: `/api/v1/clusters/non-existing-cluster`,
        //         method: 'DELETE'
        //     };
        //     let callback = function (response) {
        //         let str = '';
        //         response.on('data', function (chunk) {
        //             str += chunk;
        //         });
        //         response.once('end', function () {
        //             res = JSON.parse(str);
        //             assert.propertyVal(res, 'status', 400)
        //             done();
        //
        //         });
        //
        //     }
        //     let req = http.request(options, callback);
        //     req.once('error', (err)=>{
        //         log.error(err);
        //     })
        //     req.end();
        // });
    });
});
