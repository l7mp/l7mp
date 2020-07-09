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

const Stream   = require('stream');
const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const EndPoint = require('../cluster.js').EndPoint;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;
const Cluster      = require('../cluster.js').Cluster;
const Rule         = require('../rule.js').Rule;
const RuleList     = require('../rule.js').RuleList;
const Route        = require('../route.js').Route;
const net      = require('net');
const http      = require('http');
const querystring = require('querystring');


describe('Cluster-API', ()  => {
    let cl, cc, rc, ru, rl, stream;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error', strict: true });
        l7mp.run(); // should return
        cl = Listener.create( {name: 'controller-listener', spec: { protocol: 'HTTP', port: 1234 }});
        cl.run();
        l7mp.listeners.push(cl);
        cc = Cluster.create({name: 'L7mpControllerCluster', spec: {protocol: 'L7mpController'}});
        l7mp.clusters.push(cc);
        rc = Route.create({
            name: 'Test-rc',
            destination: 'L7mpControllerCluster',
        });
        ru = Rule.create({name: 'Test-ru', action: {route: 'Test-rc'}});
        l7mp.rules.push(ru);
        rl = RuleList.create({name: 'Test-rs', rules: ['Test-ru']});
        cl.rules='Test-rs';
        cl.emitter = l7mp.addSession.bind(l7mp);
        l7mp.routes.push(rc);
        l7mp.rulelists.push(rl);
    });

    after(() =>{
        cl.close();
    })

    context('create-controller', () => {
        it('controller-listener', (done) =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/listeners',
                method: 'GET'
            };
            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    let res = JSON.parse(str);
                    assert.nestedPropertyVal(res[0], 'name', 'controller-listener');
                    done();
                });

            }
            let req = http.request(options, callback).end();
        });
        it('controller-cluster', (done) =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters',
                method: 'GET'
            };
            let callback = function (response) {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    let res = JSON.parse(str);
                    assert.nestedPropertyVal(res[0], 'name', 'L7mpControllerCluster');
                    done();
                });

            }
            let req = http.request(options, callback).end();
        });
    });

    context('add-check-delete-cluster-via-api', () =>{
        let str = '',res;
        it('add-cluster', (done) =>{
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
            })
            req.write(postData);
            req.end();
        });
        context('check-properties',()=>{
            it('cluster-name', (done) =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                let callback = function (response) {
                    response.on('data', function (chunk) {
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
            //endpoint tests are in a separate test file named 20-api-endpoint-test
        });
        context('delete',()=>{
            it('delete-cluster', (done)=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/test-cluster',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                }
                http.request(options).end();
                let callback = function (response) {
                    let str = '';
                    response.on('data', function (chunk) {
                        str += chunk;
                    });
                    response.once('end', function () {
                        let res = JSON.parse(str);
                        assert.isNotOk(res[1]);
                        done();
                    });

                }
                http.request(options_get, callback).end();
            });
        });

        context('add-check-delete multiple clusters', ()=>{
            let res;
            it('add-5-clusters',(done)=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters', method: 'POST'
                    , headers: {'Content-Type' : 'text/x-json'}
                }
                for(let i = 1; i < 6; i++){
                    let postData = JSON.stringify({
                        'cluster':{
                            name: `test-cluster-${i}`,
                            spec: {protocol: 'UDP', port: 16000, bind: {port: 16000 + i, address: '127.0.0.1'}},
                            endpoints: [{spec: {address: '127.0.0.1'}}]
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
                    path: '/api/v1/clusters',
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

            it('check-cluster-1', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-cluster-1');});
            it('check-cluster-2', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-cluster-2');});
            it('check-cluster-3', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-cluster-3');});
            it('check-cluster-4', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-cluster-4');});
            it('check-cluster-5', ()=>{ assert.nestedPropertyVal(res[5], 'name', 'test-cluster-5');});
            it('delete-multiple-clusters', (done)=>{
                let req;
                for(let i = 1; i < 6; i++){
                    let options = {
                        host: 'localhost', port: 1234,
                        path: `/api/v1/clusters/test-cluster-${i}`,
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
                        assert.lengthOf(res,1);
                        done();
                    });

                }
                let options_get = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                http.request(options_get, callback).end();
            });
        });

        context('error',()=>{
            it('add-existing-cluster', ()=>{
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
            it('delete-non-existing-cluster',()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/clusters/non-existing-cluster`,
                    method: 'DELETE'
                };
                let callback = function (response) {
                    let str = '';
                    response.on('data', function (chunk) {
                        str += chunk;
                    });
                    response.once('end', function () {
                        res = JSON.parse(str);
                        assert.include(res.content,'Cannot delete')
                    });

                }
                let req = http.request(options, callback);
                req.once('error', (err)=>{
                    console.log(err);
                })
                req.end();
            });
        });
    });
});
