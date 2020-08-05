// L7mp: A programmable L7 meta-proxy
//
// Copyright 2019 by its authors.
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

const log         = require('npmlog');
const Stream      = require('stream');
const assert      = require('chai').assert;
const L7mp        = require('../l7mp.js').L7mp;
const EndPoint    = require('../cluster.js').EndPoint;
const Listener    = require('../listener.js').Listener;
const Session     = require('../session.js').Session;
const Cluster     = require('../cluster.js').Cluster;
const Rule        = require('../rule.js').Rule;
const RuleList    = require('../rule.js').RuleList;
const Route       = require('../route.js').Route;
const net         = require('net');
const http        = require('http');
const querystring = require('querystring');

Object.defineProperty(log, 'heading',
                      { get: () => { return new Date().toISOString() } });

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
                                name: "L7mpControllerCluster",
                                spec: {
                                    protocol: "L7mpController"
                                },
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

describe('Cluster-API', ()  => {
    let cl, cc, rc, ru, rl, stream;
    before( async function () {
        this.timeout(8000);
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        // validate the static config
        l7mp.admin.strict = true;
        await l7mp.run(); // should return
    });

    after(() =>{
        l7mp.listeners.map(x => x.close());
    })

    context('create-controller', () => {
        it('controller-listener', async () =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };

            let res = await httpRequest(options);
            assert.nestedPropertyVal(res[0], 'name', 'controller-listener');
            return Promise.resolve();
        });
        it('controller-cluster', async () =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters',
                method: 'GET'
            };

            let res = await httpRequest(options);
            assert.nestedPropertyVal(res[0], 'name', 'L7mpControllerCluster');
        });
    });

    context('add-check-delete-cluster-via-api', () =>{
        let str = '',res;
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'test-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','UDP')});
            it('has-port', () =>{assert.nestedProperty(res[1],'spec.port')});
            it('port', () =>{assert.nestedPropertyVal(res[1],'spec.port',16000)});
            it('has-bind-port', () =>{assert.nestedProperty(res[1],'spec.bind.port')});
            it('bind-port', () =>{assert.nestedPropertyVal(res[1],'spec.bind.port',16001)});
            it('has-bind-address', () =>{assert.nestedProperty(res[1],'spec.bind.address')});
            it('bind-address', () =>{assert.nestedPropertyVal(res[1],'spec.bind.address','127.0.0.1')});
            it('has-endpoints', () =>{assert.nestedProperty(res[1],'endpoints')});
            //endpoint tests are in a separate test file named 20-api-endpoint-test
        });
        context('delete',()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/test-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });

        context('add-check-delete multiple clusters', ()=>{
            let res;
            it('add-5-clusters', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters', method: 'POST',
                    headers: {'Content-Type' : 'text/x-json'}
                }
                let reqs = [];
                for(let i = 1; i < 6; i++){
                    let postData = JSON.stringify({
                        'cluster':{
                            name: `test-cluster-${i}`,
                            spec: {protocol: 'UDP', port: 16000, bind: {port: 16000 + i, address: '127.0.0.1'}},
                            endpoints: [{spec: {address: '127.0.0.1'}}]
                        }
                    });
                    reqs.push(httpRequest(options, postData));
                }

                await Promise.all(reqs);

                let options_get = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };

                res = await httpRequest(options_get);

                assert.lengthOf(res, 6);
                return Promise.resolve();
            });

            it('check-cluster-1', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-cluster-1');});
            it('check-cluster-2', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-cluster-2');});
            it('check-cluster-3', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-cluster-3');});
            it('check-cluster-4', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-cluster-4');});
            it('check-cluster-5', ()=>{ assert.nestedPropertyVal(res[5], 'name', 'test-cluster-5');});
            it('delete-multiple-clusters', async ()=>{
                let reqs = [];
                for(let i = 1; i < 6; i++){
                    let options = {
                        host: 'localhost', port: 1234,
                        path: `/api/v1/clusters/test-cluster-${i}`,
                        method: 'DELETE'
                    };
                    reqs.push(httpRequest(options));
                }

                await Promise.all(reqs);

                let options_get = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };

                res = await httpRequest(options_get);

                assert.lengthOf(res,1);
                return Promise.resolve();
            });
        });
    });
    context('recursive-get-delete', ()=>{
        let res;
        it('recursive-get', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters?recursive=true',
                method: 'GET',
            };
            res = await httpRequest(options);
            assert.nestedProperty(res[0].endpoints[0],'name');
            return Promise.resolve();
        });

        it('recursive-get-by-name', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/L7mpControllerCluster?recursive=true',
                method: 'GET',
            };
            res = await httpRequest(options);
            assert.nestedProperty(res.endpoints[0],'name');
            return Promise.resolve();
        });

        it('non-recursive-get', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters?recursive=false',
                method: 'GET',
            };
            res = await httpRequest(options);
            assert.notNestedProperty(res[0].endpoints, 'name');
            return Promise.resolve();
        });

        it('recursive-delete', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'recursive-delete-cluster',
                    spec: {protocol: 'UDP', port: 16000, bind: {port: 16001, address: '127.0.0.1'}},
                    endpoints: [{name: 'rec-endpoint-0', spec: {address: '127.0.0.1'}},{name: 'rec-endpoint-1', spec: {address: '127.0.0.2'}}]
                }
            });
            let options_post = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options_post,postData)

            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/recursive-delete-cluster',
                method: 'DELETE',
            };
            res = await httpRequest(options);
            assert.isNotOk(l7mp.getEndPoint('rec-endpoint-0'));
            assert.isNotOk(l7mp.getEndPoint('rec-endpoint-1'));
            return Promise.resolve();
        });
    });

    context('invalid-request',()=>{
            it('add-existing-cluster', async ()=>{
                const postData = JSON.stringify({
                    'cluster':{
                        name: 'L7mpControllerCluster',
                        spec: {protocol: 'UDP', port: 16000, bind: {port: 16001, address: '127.0.0.1'}},
                        endpoints: [{spec: {address: '127.0.0.1'}}]
                    }
                });
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters', method: 'POST'
                    , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
                }
                return httpRequest(options, postData)
                    .then(
                        () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                        err => { assert.instanceOf(err, Error); return Promise.resolve()}
                    );

            });
            it('delete-non-existing-cluster', async()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/clusters/non-existing-cluster`,
                    method: 'DELETE'
                };
                return httpRequest(options)
                    .then(
                        () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                        err => { assert.instanceOf(err, Error); return Promise.resolve(); }
                    );
            });
        });


    // TODO: http cluster is not implemented yet
    // context('HTTP-cluster', ()=>{
    //     it('add-http-cluster-via-api', async ()=>{
    //     })
    //     it('delete-http-cluster-via-api', async () =>{
    //     })
    // })

    context('add-check-delete-WebSocket-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'websocket-cluster',
                    spec: {protocol: 'WebSocket', port: 16000}
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200)
            return Promise.resolve()
        });
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v' +
                        '1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'websocket-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','WebSocket')});
            it('has-port', () =>{assert.nestedProperty(res[1],'spec.port')});
            it('port', () =>{assert.nestedPropertyVal(res[1],'spec.port',16000)});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/websocket-cluster',
                    method: 'DELETE'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-TCP-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'tcp-cluster',
                    spec: {protocol: 'TCP', port: 16000}
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
        })
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'tcp-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','TCP')});
            it('has-port', () =>{assert.nestedProperty(res[1],'spec.port')});
            it('port', () =>{assert.nestedPropertyVal(res[1],'spec.port',16000)});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/tcp-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-UnixDomainSocket-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=> {
            const postData = JSON.stringify({
                'cluster': {
                    name: 'uds-cluster',
                    spec: {protocol: 'UnixDomainSocket'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'uds-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','UnixDomainSocket')});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/uds-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-Stdio-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'stdio-cluster',
                    spec: {protocol: 'Stdio'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'stdio-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','Stdio')});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/stdio-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-Echo-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'echo-cluster',
                    spec: {protocol: 'Echo'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'echo-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','Echo')});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/echo-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-Discard-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'discard-cluster',
                    spec: {protocol: 'Discard'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'discard-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','Discard')});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/discard-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-Logger-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'logger-cluster',
                    spec: {protocol: 'Logger'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'logger-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','Logger')});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/logger-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-JSONEncap-cluster-via-API', ()=>{
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'jsonencap-cluster',
                    spec: {protocol: 'JSONEncap'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'jsonencap-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','JSONEncap')});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/jsonencap-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-JSONDecap-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'jsondecap-cluster',
                    spec: {protocol: 'JSONDecap'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
                assert.nestedPropertyVal(res[1], 'name', 'jsondecap-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','JSONDecap')});
        });
        context('delete',()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/jsondecap-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
    context('add-check-delete-Sync-cluster-via-API', ()=>{
        let res;
        it('add-cluster', async ()=>{
            const postData = JSON.stringify({
                'cluster':{
                    name: 'sync-cluster',
                    spec: {protocol: 'Sync', query: 'test/test/test'}
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
        context('check-properties',()=>{
            it('cluster-name', async() =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);

                assert.nestedPropertyVal(res[1], 'name', 'sync-cluster');
                return Promise.resolve();

            });
            it('has-protocol', () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol', () =>{assert.nestedPropertyVal(res[1],'spec.protocol','Sync')});
            it('has-query', ()=>{assert.nestedProperty(res[1],'spec.query')});
            it('query', ()=>{assert.nestedPropertyVal(res[1],'spec.query','test/test/test')});
        });
        context('delete', ()=>{
            it('delete-cluster', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/sync-cluster',
                    method: 'DELETE'
                };
                let res = await httpRequest(options);
                assert.nestedPropertyVal(res, 'status', 200)
                return Promise.resolve();
            });
        });
    });
});
