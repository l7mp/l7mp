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

const log        = require('npmlog');
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

Object.defineProperty(log, 'heading',
                      { get: () => { return new Date().toISOString() } });


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
        this.timeout(5000);
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error', strict: true });
        // l7mp.applyAdmin({ log_level: 'silly', strict: true });
        await l7mp.run(); // should return
        cl = Listener.create( {name: 'controller-listener', spec: { protocol: 'HTTP', port: 1234 }});
        cl.run();
        l7mp.listeners.push(cl);
        cc = Cluster.create({name: 'L7mpControllerCluster', spec: {protocol: 'L7mpController'}});
        await cc.run();
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
        return Promise.resolve();
    });

    after(() =>{
        cl.close();
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
                return await httpRequest(options, postData)
                    .then(
                        () => Promise.reject(new Error('Expected method to reject.')),
                        err => assert.instanceOf(err, Error)
                    );

            });
            it('delete-non-existing-cluster', async()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/clusters/non-existing-cluster`,
                    method: 'DELETE'
                };
                return await httpRequest(options)
                    .then(
                        () => Promise.reject(new Error('Expected method to reject.')),
                        err => assert.instanceOf(err, Error)
                    );
            });
        });
    });
});
