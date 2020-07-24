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

const assert      = require('chai').assert;
const L7mp        = require('../l7mp.js').L7mp;
const http        = require('http');

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

describe('Listeners API', ()  => {
    before( async function () {
        this.timeout(5000);
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        l7mp.applyAdmin({ log_level: 'error', strict: true  });
        // l7mp.applyAdmin({ log_level: 'silly', strict: true });
        await l7mp.run();
        return Promise.resolve();
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('get-listeners', () => {
        let res;
        it('controller-listener', async () =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };
            res = await httpRequest(options);
        });
        it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        it('protocol',            () => { assert.nestedPropertyVal(res[0], 'spec.protocol', 'HTTP'); });
        it('port',                () => { assert.nestedPropertyVal(res[0], 'spec.port', 1234); });
        it('has-rules',           () => { assert.nestedProperty(res[0], 'rules'); });
    });

    context('add-check-delete-listeners-via-api', () =>{
        let res;
        it('add-listener', async () =>{
            const postData = JSON.stringify({
                "listener": {
                    name: "test-listener",
                    spec: { protocol: "UDP", port: 15000 },
                    rules: [ {
                        action: {
                          route: {
                            destination: "user-1-2-c",
                            ingress: [
                              { name: "Echo", spec: { protocol: "Echo" } }
                            ],
                            retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                          }
                        }
                      }
                    ]
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });

        context('check-properties',()=>{
            it('listener-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                res = await httpRequest(options)
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'UDP'); });
            it('port',                () => { assert.nestedPropertyVal(res[1], 'spec.port', 15000); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });

        context('delete', ()=>{
            let res;
            it('delete-listener', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners/test-listener',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-HTTP-listeners-via-api', () =>{
        let res;
        it('add-listener', async () =>{
            const postData = JSON.stringify({
                "listener": {
                    name: "test-listener",
                    spec: { protocol: "HTTP", port: 12345 },
                    rules: [ {
                        action: {
                          route: {
                            destination: "user-1-2-c",
                            ingress: [
                              { name: "Echo-HTTP", spec: { protocol: "Echo" } }
                            ],
                            retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                          }
                        }
                      }
                    ]
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });

        context('check-properties',()=>{
            it('listener-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                res = await httpRequest(options)
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'HTTP'); });
            it('port',                () => { assert.nestedPropertyVal(res[1], 'spec.port', 12345); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });

        context('delete', ()=>{
            let res;
            it('delete-listener', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners/test-listener',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-WebSocket-listeners-via-api', () =>{
        let res;
        it('add-listener', async () =>{
            const postData = JSON.stringify({
                "listener": {
                    name: "test-listener",
                    spec: { protocol: "WebSocket", port: 12345 },
                    rules: [ {
                        action: {
                          route: {
                            destination: "user-1-2-c",
                            ingress: [
                              { name: "Echo-WebSocket", spec: { protocol: "Echo" } }
                            ],
                            retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                          }
                        }
                      }
                    ]
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });

        context('check-properties',()=>{
            it('listener-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                res = await httpRequest(options)
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'WebSocket'); });
            it('port',                () => { assert.nestedPropertyVal(res[1], 'spec.port', 12345); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });

        context('delete', ()=>{
            let res;
            it('delete-listener', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners/test-listener',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-TCP-listeners-via-api', () =>{
        let res;
        it('add-listener', async () =>{
            const postData = JSON.stringify({
                "listener": {
                    name: "test-listener",
                    spec: { protocol: "TCP", port: 12345 },
                    rules: [ {
                        action: {
                          route: {
                            destination: "user-1-2-c",
                            ingress: [
                              { name: "Echo-TCP", spec: { protocol: "Echo" } }
                            ],
                            retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                          }
                        }
                      }
                    ]
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });

        context('check-properties',()=>{
            it('listener-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                res = await httpRequest(options)
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'TCP'); });
            it('port',                () => { assert.nestedPropertyVal(res[1], 'spec.port', 12345); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });

        context('delete', ()=>{
            let res;
            it('delete-listener', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners/test-listener',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-UnixDomainSocket-listeners-via-api', () =>{
        let res;
        it('add-listener', async () =>{
            const postData = JSON.stringify({
                "listener": {
                    name: "test-listener",
                    spec: { protocol: "UnixDomainSocket", filename: 'test' },
                    rules: [ {
                        action: {
                          route: {
                            destination: "user-1-2-c",
                            ingress: [
                              { name: "Echo-UnixDomainSocket", spec: { protocol: "Echo" } }
                            ],
                            retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                          }
                        }
                      }
                    ]
                  }
                });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST',
                headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });

        context('check-properties',()=>{
            it('listener-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                res = await httpRequest(options)
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'UnixDomainSocket'); });
            it('filename',                () => { assert.nestedPropertyVal(res[1], 'spec.filename', 'test'); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });

        context('delete', ()=>{
            let res;
            it('delete-listener', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners/test-listener',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-JSONSocket-listeners-via-api', () =>{
        let res;
        it('add-listener', async () =>{
            const postData = JSON.stringify({
                "listener": {
                    name: 'test-listener',
                    spec: {
                        protocol: 'JSONSocket',
                        transport: { protocol: 'UDP', port: 54321 }
                    },
                    rules: [ {
                        action: {
                          route: {
                            destination: "user-1-2-c",
                            ingress: [
                              { name: "Echo-JSONSocket", spec: { protocol: "Echo" } }
                            ],
                            retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                          }
                        }
                      }
                    ]
                  }
                });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });

        context('check-properties',()=>{
            it('listener-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                res = await httpRequest(options)
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'JSONSocket'); });
            it('has-transport', () => { assert.instanceOf(res[1].spec.transport, Object); });
            it('transport-protocol', () => { assert.nestedPropertyVal(res[1], 'spec.transport.protocol', 'UDP'); });
            it('transport-port', () => { assert.nestedPropertyVal(res[1], 'spec.transport.port', 54321); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });

        context('delete', ()=>{
            let res;
            it('delete-listener', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners/test-listener',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-empty-rules-listeners-via-api', () =>{
        let res;
        it('add-listener', async () =>{
            const postData = JSON.stringify({
                "listener": {
                    name: "test-listener",
                    spec: { protocol: "TCP", port: 12345 },
                    rules: []
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });

        context('check-properties',()=>{
            it('listener-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                res = await httpRequest(options)
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'TCP'); });
            it('port',                () => { assert.nestedPropertyVal(res[1], 'spec.port', 12345); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });

        context('delete', ()=>{
            let res;
            it('delete-listener', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners/test-listener',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-multiple-listeners', ()=>{
        let res, reqs = [];
        it('add-5-listeners', async ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json'}
            }
            for(let i = 1; i < 6; i++){
                let postData = JSON.stringify({
                    'listener': {
                        name: `test-listener-${i}`,
                        spec: { protocol: "UDP", port: 15000 },
                        rules: [ {
                            action: {
                              route: {
                                destination: "user-1-2-c",
                                ingress: [
                                  { name: `Echo-${i}`, spec: { protocol: "Echo" } }
                                ],
                                retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                              }
                            }
                          }
                        ]
                      }
                });
                reqs.push(httpRequest(options, postData));
            }
            await Promise.all(reqs);

            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };

            res = await httpRequest(options_get);

            assert.lengthOf(res, 6);
            return Promise.resolve();
        });

        it('check-listener-1', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-listener-1' )); });
        it('check-listener-2', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-listener-2' )); });
        it('check-listener-3', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-listener-3' )); });
        it('check-listener-4', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-listener-4' )); });
        it('check-listener-5', ()=>{ assert.isOk( res.find( ({name}) => name ===  'test-listener-5' )); });

        it('delete-multiple-listener', async ()=>{
            let res, reqs = [];
            for(let i = 1; i < 6; i++){
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/listeners/test-listener-${i}`,
                    method: 'DELETE'
                };
                reqs.push(httpRequest(options));
            }

            await Promise.all(reqs);

            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };
            res = await httpRequest(options_get);
            assert.lengthOf(res,1);
            return Promise.resolve();
        });
    });

    context('invalid-request',() => {
        it('add-existing-listener', () => {
            const postData = JSON.stringify({
                "listener": {
                    name: "controller-listener",
                    spec: { protocol: "UDP", port: 15000 },
                    rules: [ {
                        action: {
                          route: {
                            destination: "user-1-2-c",
                            ingress: [
                              { name: "Echo", spec: { protocol: "Echo" } }
                            ],
                            retry: { retry_on: "always", num_retries: 10, timeout: 2000 }
                          }
                        }
                      }
                    ]
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }

            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });

        it('add-empty-listener', () => {
            const postData = JSON.stringify({ });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });

        it('without-rules', () => {
            const postData = JSON.stringify({
                "listener": {
                    name: "test",
                    spec: { protocol: "UDP", port: 15000 },
                    rules: [ {
                      }
                    ]
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });

        it('delete-non-existing-listener', ()=>{
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/listeners/non-existing-listener`,
                method: 'DELETE'
            };
            return httpRequest(options)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });
    });
});
