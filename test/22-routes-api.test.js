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
const http   = require('http');
const Route  = require('../route.js').Route;

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

describe('Routes API', ()  => {
    var e, s;
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

    context('get-routes', () => {
        let res, str = '';
        it('controller-routes', (done) =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes',
                method: 'GET'
            };
            let callback = function (response) {
                str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    res = JSON.parse(str);
                    assert.instanceOf(res[0], Object);
                    done();
                });
            }
            let req = http.request(options, callback).end();
        });
        it('length-of-routes', () => { assert.lengthOf(res, 1); });
        it('has-name',            () => { assert.property(res[0], 'name'); });
        it('has-destination',     () => { assert.property(res[0], 'destination'); });
        it('destination-value',   () => { assert.propertyVal(res[0], 'destination', 'l7mp-controller'); });
        it('has-retry',           () => { assert.property(res[0], 'retry'); })
        it('retry-retry_on',      () => { assert.nestedPropertyVal(res[0], 'retry.retry_on', 'never'); });
        it('retry-num_retries',   () => { assert.nestedPropertyVal(res[0], 'retry.num_retries', 1); });
        it('retry-timeout',       () => { assert.nestedPropertyVal(res[0], 'retry.timeout', 2000); });
    });

    context('add-check-delete-routes-via-api', () =>{
        let res, str = '';
        it('add-routes', (done) =>{
            const postData = JSON.stringify({
                "route": {
                    name: "test-route",
                    destination: 'l7mp-controller'
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            let req = http.request(options, (res)=>{
                res.setEncoding('utf8');
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
            it('route-name', (done) =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
                    method: 'GET'
                };
                let callback = function (response) {
                    //another chunk of data has been received, so append it to `str`
                    response.on('data', function (chunk) {
                        str = '';
                        str += chunk;
                    });
                    //the whole response has been received, so we just print it out here
                    response.on('end', function () {
                        res = JSON.parse(str);
                        assert.nestedPropertyVal(res[1], 'name', 'test-route');
                        done();
                    });
                }
                let req = http.request(options, callback).end();
            });
            it('length-of-routes',  () => { assert.lengthOf(res, 2); });
            it('has-name',          () => { assert.property(res[1], 'name'); });
            it('name-value',        () => { assert.propertyVal(res[1], 'name', 'test-route'); });
            it('has-destination',   () => { assert.property(res[1], 'destination'); });
            it('destination-value', () => { assert.propertyVal(res[1], 'destination', 'l7mp-controller'); });
            it('has-retry',         () => { assert.property(res[1], 'retry'); })
            it('retry-retry_on',    () => { assert.nestedPropertyVal(res[1], 'retry.retry_on', 'never'); });
            it('retry-num_retries', () => { assert.nestedPropertyVal(res[1], 'retry.num_retries', 1); });
            it('retry-timeout',     () => { assert.nestedPropertyVal(res[1], 'retry.timeout', 2000); });
        });
        context('delete',()=>{
            let res, str = '';
            it('delete-route', (done)=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes/test-route',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
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

    context('add-check-delete-routes-via-api-complex', () =>{
        let res, str = '';
        it('add-routes', (done) =>{
            const postData = JSON.stringify({
                "route": {
                    name: "test-route",
                    destination: {
                        name: 'test-cluster',
                        spec: {protocol: 'UDP', port: 16000, bind: {port: 16001, address: '127.0.0.1'}},
                        endpoints: [{spec: {address: '127.0.0.1'}}]
                    },
                    ingress: [{
                        name: 'test-ingress',
                        spec: {protocol: 'UDP', port: 16000, bind: {port: 16001, address: '127.0.0.1'}},
                        endpoints: [{spec: {address: '127.0.0.1'}}]
                    }],
                    egress: [{
                        name: 'test-egress',
                        spec: {protocol: 'UDP', port: 16000, bind: {port: 16001, address: '127.0.0.1'}},
                        endpoints: [{spec: {address: '127.0.0.1'}}]
                    }],
                    retry: {
                        retry_on: 'always',
                        num_retries: 1,
                        timeout: 1000
                    }
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            let req = http.request(options, (res)=>{
                res.setEncoding('utf8');
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
            it('route-name', (done) =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
                    method: 'GET'
                };
                let callback = function (response) {
                    //another chunk of data has been received, so append it to `str`
                    response.on('data', function (chunk) {
                        str = '';
                        str += chunk;
                    });
                    //the whole response has been received, so we just print it out here
                    response.on('end', function () {
                        res = JSON.parse(str);
                        assert.nestedPropertyVal(res[1], 'name', 'test-route');
                        done();
                    });
                }
                let req = http.request(options, callback).end();
            });
            it('length-of-routes',  () => { assert.lengthOf(res, 2); });
            it('has-name',          () => { assert.property(res[1], 'name'); });
            it('name-value',        () => { assert.propertyVal(res[1], 'name', 'test-route'); });
            it('has-destination',   () => { assert.property(res[1], 'destination'); });
            it('destination-value', () => { assert.propertyVal(res[1], 'destination', 'test-cluster'); });
            it('ingress',           () => { assert.equal(res[1].ingress[0], 'test-ingress'); });
            it('egress',            () => { assert.equal(res[1].egress[0], 'test-egress'); });
            it('has-retry',         () => { assert.property(res[1], 'retry'); })
            it('retry-retry_on',    () => { assert.nestedPropertyVal(res[1], 'retry.retry_on', 'always'); });
            it('retry-num_retries', () => { assert.nestedPropertyVal(res[1], 'retry.num_retries', 1); });
            it('retry-timeout',     () => { assert.nestedPropertyVal(res[1], 'retry.timeout', 1000); });
        });

        context('check-cluster',()=>{
            it('cluster-name', (done) =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                let callback = function (response) {
                    response.on('data', function (chunk) {
                        str = '';
                        str += chunk;
                    });
                    response.on('end', function () {
                        res = JSON.parse(str);
                        assert.nestedPropertyVal(res[1], 'name', 'test-cluster');
                        done();
                    });

                }
                let req = http.request(options, callback).end();
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
            it('ingress-cluster-name', () =>{assert.nestedProperty(res[2], 'name', 'test-ingress'); });
            it('egress-cluster-name', () =>{assert.nestedProperty(res[3], 'name', 'test-egress'); });
        });

        context('delete',()=>{
            let res, str = '';
            it('delete-route', (done)=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes/test-route',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
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

    context('add-check-delete-multiple-routes', ()=>{
        let res;
        it('add-5-routes',(done)=>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json'}
            }
            for(let i = 1; i < 6; i++){
                const postData = JSON.stringify({
                    "route": {
                        name: `test-route-${i}`,
                        destination: 'l7mp-controller'
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
                path: '/api/v1/routes',
                method: 'GET'
            };
            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.once('end', function () {
                    res = JSON.parse(str);
                    assert.lengthOf(res,6);
                    done();
                });

            }
            http.request(options_get, callback).end();
        });

        it('check-route-1', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-route-1');});
        it('check-route-2', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-route-2');});
        it('check-route-3', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-route-3');});
        it('check-route-4', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-route-4');});
        it('check-route-5', ()=>{ assert.nestedPropertyVal(res[5], 'name', 'test-route-5');});

        it('delete-multiple-route', (done)=>{
            let res;
            for(let i = 1; i < 6; i++){
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/routes/test-route-${i}`,
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
                path: '/api/v1/routes',
                method: 'GET'
            };
            http.request(options_get, callback).end();
        });
    });

    context('error',() => {
        it('missing-required-property-name', () => {
            let res;
            const postData = JSON.stringify({
                "route": {
                    destination: 'l7mp-controller'
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST'
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
                    assert.include(res.content,'Cannot add')
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });
        it('missing-required-property-destination', () => {
            let res;
            const postData = JSON.stringify({
                "route": {
                    name: 'test',
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST'
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
                    assert.include(res.content,'Cannot add')
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });
        it('add-existing-route', (done) => {
            let res;
            const postData = JSON.stringify({
                "route": {
                    name: `${l7mp.routes[0].name}`,
                    destination: 'l7mp-controller'
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST',
                headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
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
                    done();
                });
            });
            req.once('error', (e) =>{
                log.error(`Error: ${e.message}`);
            })
            req.write(postData);
            req.end();
        });
    });
});
