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
    ],
    "clusters": [
        {
            "name": "websocket-cluster",
            "spec": {
                "protocol": "WebSocket", "port" : 15001
            }
        },
        {
            "name": "tcp-cluster",
            "spec": {
                "protocol": "TCP", "port" : 15002
            }
        },
        {
            "name": "uds-cluster",
            "spec": {
                "protocol": "UnixDomainSocket"
            }
        },
        {
            "name": "jsonsocket-cluster",
            "spec": {
                "protocol" : "JSONSocket",
                "port" : 15003,
                "transport" : {
                    "protocol" : "UDP",
                    "port" : 15003
                }
            }
        },
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

describe('EndPoint API', ()  => {
    var e, s;
    before( async function () {
        this.timeout(5000);
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        l7mp.applyAdmin({ log_level: 'warn' , strict: true});
        await l7mp.run(); // should return
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('create', () => {
        it('controller-listener',         () => { assert.lengthOf(l7mp.listeners, 1); } );
        it('add-cluster', async() =>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'test-cluster',
                    spec: {protocol: 'UDP', port: 16000, bind: {port: 16001, address: '127.0.0.1'}},
                    endpoints: [{spec: {address: '127.0.0.1'}}]
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            let res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200)
            return Promise.resolve()
        });
        ///
        it('has-endpoint-name', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/config',
                method: 'GET'
            };
            let res = await httpRequest(options);
            return Promise.resolve();
        });
        ///
    });
    context('UDP-add-check-delete-endpoints-via-api', ()=> {
        let res;

        it('add-endpoint', async () => {
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name: 'test-cluster-EndPoint-1',
                        spec: { port: 15000, address: '127.0.0.1'}
                    }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve()
        });
        it('has-endpoint-name', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints',
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res[1], 'name', 'test-cluster-EndPoint-1');
            return Promise.resolve();
        });
        it('has-endpoint-spec', ()=>{ assert.nestedProperty(res[1], 'spec')});
        it('has-endpoint-spec-address', ()=>{ assert.nestedProperty(res[1], 'spec.address', '127.0.0.1')});
        it('has-endpoint-spec-port', ()=>{ assert.nestedProperty(res[1], 'spec.port', 15000)});

        it('delete-endpoint-default', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/test-cluster/endpoints/${res[0].name}`,
                method: 'DELETE'
            };

            let d_res = await httpRequest(options)
            assert.nestedPropertyVal(d_res, 'status', 200);
            return Promise.resolve();
        });
        it('delete-endpoint-added-via-api', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/test-cluster/endpoints/${res[1].name}`,
                method: 'DELETE'
            };

            let d_res = await httpRequest(options)
            assert.nestedPropertyVal(d_res, 'status', 200);
            return Promise.resolve();
        });
    });

    context('add-check-delete-multiple-clusters', ()=>{
        let res;
        it('add-5-endpoints', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints', method: 'POST'
                , headers: {'Content-Type' : 'application/json'}
            }
            let reqs = [];
            for(let i = 1; i < 6; i++){
                let postData = JSON.stringify({
                    'endpoint':
                        {
                            name: `test-cluster-EndPoint-${i}`,
                            spec: { port: 15000 + i, address: '127.0.0.1'}
                        }
                });
                reqs.push(httpRequest(options, postData))
            }
            await Promise.all(reqs);
            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints',
                method: 'GET'
            };

            res = await httpRequest(options_get);
            assert.lengthOf(res, 5);
            return Promise.resolve();
        });
        it('check-endpoint-1', ()=>{ assert.nestedPropertyVal(res[0], 'name', 'test-cluster-EndPoint-1');});
        it('check-endpoint-2', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-cluster-EndPoint-2');});
        it('check-endpoint-3', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-cluster-EndPoint-3');});
        it('check-endpoint-4', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-cluster-EndPoint-4');});
        it('check-endpoint-5', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-cluster-EndPoint-5');});
        it('delete-multiple-clusters', async ()=>{
            let reqs = [];
            for(let i = 1; i < 6; i++){
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/clusters/test-cluster/endpoints/test-cluster-EndPoint-${i}`,
                    method: 'DELETE'
                };
                reqs.push(httpRequest(options))
                await Promise.all(reqs)

            }
            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints',
                method: 'GET'
            };
            res = await httpRequest(options_get);
            assert.lengthOf(res, 0);
            return Promise.resolve();
        });
    });
    context('invalid-request',()=>{
        it('add-endpoint-validation-fail', async ()=>{
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name: 'endpoint-without-required-parameters'
                    }
            });

            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            await httpRequest(options, postData)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });
        it('add-existing-endpoint', async ()=>{
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
            await httpRequest(options, postData);
            return httpRequest(options, postData_1)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });
        it('add-endpoint-to-non-existent-cluster', async ()=>{
            const postData = JSON.stringify({
                'endpoint':
                    {
                        spec: { port: 15000, address: '127.0.0.1'}
                    }
            });

            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/non-existent-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            await httpRequest(options, postData)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });

        it('delete-non-existent-endpoint',()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/test-cluster/endpoints/non-existent-endpoint`,
                method: 'DELETE'
            };
            return httpRequest(options)
                .then(
                    ()=>{ return Promise.reject(new Error('Expected method to reject'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                )
        });
    });

    context('WebSocket endpoint',()=>{
        let res;
        it('add', async ()=>{
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name: 'websocket-cluster-endpoint',
                        spec: { port: 15005, address: '127.0.0.1'}
                    }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/websocket-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve()
        });
        it('has-endpoint-name', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/websocket-cluster/endpoints',
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res[0], 'name', 'websocket-cluster-endpoint');
            return Promise.resolve();
        });
        it('has-endpoint-spec', ()=>{ assert.nestedProperty(res[0], 'spec')});
        it('has-endpoint-spec-address', ()=>{ assert.nestedProperty(res[0], 'spec.address', '127.0.0.1')});
        it('has-endpoint-spec-port', ()=>{ assert.nestedProperty(res[0], 'spec.port', 15005)});
        it('delete-endpoint-default', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/websocket-cluster/endpoints/${res[0].name}`,
                method: 'DELETE'
            };

            res = await httpRequest(options)
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
    });

    context('TCP endpoint',()=>{
        let res;
        it('add', async ()=>{
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name: 'tcp-cluster-endpoint',
                        spec: { port: 15004, address: '127.0.0.1'}
                    }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/tcp-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve()
        });
        it('has-endpoint-name', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/tcp-cluster/endpoints',
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res[0], 'name', 'tcp-cluster-endpoint');
            return Promise.resolve();
        });
        it('has-endpoint-spec', ()=>{ assert.nestedProperty(res[0], 'spec')});
        it('has-endpoint-spec-address', ()=>{ assert.nestedProperty(res[0], 'spec.address', '127.0.0.1')});
        it('has-endpoint-spec-port', ()=>{ assert.nestedProperty(res[0], 'spec.port', 15004)});
        it('delete-endpoint-default', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/tcp-cluster/endpoints/${res[0].name}`,
                method: 'DELETE'
            };

            res = await httpRequest(options)
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
    });

    context('UDS endpoint',()=>{
        let res;
        it('add', async ()=>{
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name: 'uds-cluster-endpoint',
                        spec: { address: '/tmp/unixSocket.sock'}
                    }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/uds-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve()
        });
        it('has-endpoint-name', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/uds-cluster/endpoints',
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res[0], 'name', 'uds-cluster-endpoint');
            return Promise.resolve();
        });
        it('has-endpoint-spec', ()=>{ assert.nestedProperty(res[0], 'spec')});
        it('has-endpoint-spec-address', ()=>{ assert.nestedProperty(res[0], 'spec.address', '/tmp/unixSocket.sock')});
        it('delete-endpoint-default', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/uds-cluster/endpoints/${res[0].name}`,
                method: 'DELETE'
            };

            res = await httpRequest(options)
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
    });

    context('JSONSocket endpoint',()=>{
        let res;
        it('add', async ()=>{
            const postData = JSON.stringify({
                'endpoint':
                    {
                        name: 'jsonsocket-cluster-endpoint',
                        spec: { port: 15005, address: '127.0.0.1'}
                    }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/jsonsocket-cluster/endpoints', method: 'POST',
                headers: {'Content-Type': 'application/json'}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve()
        });
        it('has-endpoint-name', async() =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/jsonsocket-cluster/endpoints',
                method: 'GET'
            };
            res = await httpRequest(options);
            assert.nestedPropertyVal(res[0], 'name', 'jsonsocket-cluster-endpoint');
            return Promise.resolve();
        });
        it('has-endpoint-spec', ()=>{ assert.nestedProperty(res[0], 'spec')});
        it('has-endpoint-spec-address', ()=>{ assert.nestedProperty(res[0], 'spec.address', '127.0.0.1')});
        it('has-endpoint-spec-port', ()=>{ assert.nestedProperty(res[0], 'spec.port', 15005)});
        it('delete-endpoint-default', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/clusters/jsonsocket-cluster/endpoints/${res[0].name}`,
                method: 'DELETE'
            };

            res = await httpRequest(options)
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
    });
});