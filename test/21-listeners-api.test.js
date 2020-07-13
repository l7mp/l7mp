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

describe('Listeners API', ()  => {
    
    before( () => {
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); 
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('get-listeners', () => {
        let res, str = ''; 
        it('controller-listener', (done) =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };
            let callback = function (response) {
                str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    res = JSON.parse(str);
                    assert.nestedPropertyVal(res[0], 'name', 'controller-listener');
                    done();
                });
            }
            let req = http.request(options, callback).end();
        });
        it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        it('protocol',            () => { assert.nestedPropertyVal(res[0], 'spec.protocol', 'HTTP'); });
        it('port',                () => { assert.nestedPropertyVal(res[0], 'spec.port', 1234); });
        it('has-rules',           () => { assert.nestedProperty(res[0], 'rules'); });
    });

    context('add-check-delete-listeners-via-api', () =>{
        let res, str = '';
        it('add-listener', (done) =>{
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
            let req = http.request(options, (res)=>{
                res.setEncoding('utf8');
                let str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });
                res.on('end', () =>{
                    done();
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
                assert.fail();
            });
            req.write(postData);
            req.end();
        });
        context('check-properties',()=>{
            it('listener-name', (done) =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/listeners',
                    method: 'GET'
                };
                let callback = function (response) {
                    //another chunk of data has been received, so append it to `str`
                    response.on('data', function (chunk) {
                        str += chunk;
                    });
                    //the whole response has been received, so we just print it out here
                    response.on('end', function () {
                        res = JSON.parse(str);
                        assert.nestedPropertyVal(res[1], 'name', 'test-listener');
                        done();
                    });
                }
                let req = http.request(options, callback).end();
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 2); });
            it('protocol',            () => { assert.nestedPropertyVal(res[1], 'spec.protocol', 'UDP'); });
            it('port',                () => { assert.nestedPropertyVal(res[1], 'spec.port', 15000); });
            it('has-rules',           () => { assert.nestedProperty(res[1], 'rules'); });
        });
        context('delete',()=>{
            let res, str = ''; 
            it('delete-listener', (done)=>{
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
                http.request(options).end();
                let callback = function (response) {
                    str = '';
                    response.on('data', function (chunk) {
                        str += chunk;
                    });
                    response.once('end', function () {
                        res = JSON.parse(str);
                        assert.isNotOk(res[1]);
                        done();
                    });
                };
                http.request(options_get, callback).end();
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete multiple listeners', ()=>{
        let res;
        it('add-5-listeners',(done)=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json'}
            }
            for(let i = 1; i < 6; i++){
                const postData = JSON.stringify({
                    "listener": {
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
                let req = http.request(options);
                req.once('error', (e) =>{
                    log.error(`Error: ${e.message}`);
                })
                req.write(postData);
                req.end();
            }
            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };
            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.once('end', function () {
                    res = JSON.parse(str);
                    assert.lengthOf(res, 6);
                    done();
                });

            }
            http.request(options_get, callback).end();
        });

        it('check-listener-1', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-listener-1');});
        it('check-listener-2', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-listener-2');});
        it('check-listener-3', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-listener-3');});
        it('check-listener-4', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-listener-4');});
        it('check-listener-5', ()=>{ assert.nestedPropertyVal(res[5], 'name', 'test-listener-5');});

        it('delete-multiple-listener', (done)=>{
            let res;
            for(let i = 1; i < 6; i++){
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/listeners/test-listener-${i}`,
                    method: 'DELETE'
                };
                req = http.request(options).end();
            }
            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.once('end', function () {
                    res = JSON.parse(str);
                    assert.lengthOf(res, 1);
                    done();
                });

            }
            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };
            http.request(options_get, callback).end();
        });
    });

    context('error',() => {
        it('add-existing-listener', () => {
            let res;
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
            let req = http.request(options, (response)=>{
                response.setEncoding('utf8');
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', () =>{
                    res = JSON.parse(str);
                    assert.equal(res.status, 400);
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });

        it('add-empty-listener', () => {
            let res;
            const postData = JSON.stringify({ });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            let req = http.request(options, (response)=>{
                response.setEncoding('utf8');
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', () =>{
                    res = JSON.parse(str);
                    assert.equal(res.status, 400);
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });

        it('without-rules', () => {
            let res;
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
            let req = http.request(options, (response)=>{
                response.setEncoding('utf8');
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', () =>{
                    res = JSON.parse(str);
                    assert.equal(res.status, 400);
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });

        it('delete-non-existing-listener',()=>{
            let res;
            let options = {
                host: 'localhost', port: 1234,
                path: `/api/v1/listeners/non-existing-listener`,
                method: 'DELETE'
            };
            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.once('end', function () {
                    res = JSON.parse(str);
                    assert.equal(res.status, 400);
                });
            }
            let req = http.request(options, callback);
            req.once('error', (err) => {
                console.log(err);
            })
            req.end();
        });
    });
});
