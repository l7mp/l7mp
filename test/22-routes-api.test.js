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
const { promises } = require('fs');


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

describe('Routes API', ()  => {
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

    context('get-routes', () => {
        let res;
        it('controller-routes', async () =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes',
                method: 'GET'
            };
            res = await httpRequest(options);
        });
        it('length-of-routes', () => { assert.lengthOf(res, 1); });
        it('has-name',            () => { assert.property(res[0], 'name'); });
        it('has-destination',     () => { assert.property(res[0], 'destination'); });
        it('destination-value',   () => { assert.propertyVal(res[0], 'destination', 'L7mpControllerCluster'); });
        it('has-retry',           () => { assert.property(res[0], 'retry'); })
        it('retry-retry_on',      () => { assert.nestedPropertyVal(res[0], 'retry.retry_on', 'never'); });
        it('retry-num_retries',   () => { assert.nestedPropertyVal(res[0], 'retry.num_retries', 1); });
        it('retry-timeout',       () => { assert.nestedPropertyVal(res[0], 'retry.timeout', 2000); });
    });

    context('add-check-delete-routes-via-api', () =>{
        let res;
        it('add-routes', async () =>{
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
            await httpRequest(options, postData);
        });
        context('check-properties',()=>{
            it('route-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
                    method: 'GET'
                };
                res = await httpRequest(options);
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
            let res;
            it('delete-route', async () => {
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
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-routes-websocket-cluster-via-api', () =>{
        let res;
        it('add-routes', async () =>{
            const postData = JSON.stringify({
                "route": {
                    name: "test-route",
                    destination: {
                        name: 'WebSocketCluster',
                        spec: {
                            protocol: 'WebSocket',
                            port: 16000,
                            bind: {port: 16001, address: '127.0.0.1'}
                        }, 
                        endpoints: [{spec: {address: '127.0.0.1'}}]
                    }
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });
        context('check-properties',()=>{
            it('route-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
                    method: 'GET'
                };
                res = await httpRequest(options);
            });
            it('length-of-routes',  () => { assert.lengthOf(res, 2); });
            it('has-name',          () => { assert.property(res[1], 'name'); });
            it('name-value',        () => { assert.propertyVal(res[1], 'name', 'test-route'); });
            it('has-destination',   () => { assert.property(res[1], 'destination'); });
            it('destination-value', () => { assert.propertyVal(res[1], 'destination', 'WebSocketCluster'); });
            it('has-retry',         () => { assert.property(res[1], 'retry'); })
            it('retry-retry_on',    () => { assert.nestedPropertyVal(res[1], 'retry.retry_on', 'never'); });
            it('retry-num_retries', () => { assert.nestedPropertyVal(res[1], 'retry.num_retries', 1); });
            it('retry-timeout',     () => { assert.nestedPropertyVal(res[1], 'retry.timeout', 2000); });
        });
        context('delete',()=>{
            let res;
            it('delete-route', async () => {
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes/test-route',
                    method: 'DELETE'
                };
                let options_cluster = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters/WebSocketCluster',
                    method: 'DELETE'
                }
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
                    method: 'GET'
                }
                await httpRequest(options);
                await httpRequest(options_cluster);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-routes-via-api-complex', () =>{
        let res;
        it('add-routes', async () =>{
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
            await httpRequest(options, postData);
        });
        context('check-properties',()=>{
            it('route-name', async () => {
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/routes',
                    method: 'GET'
                };
                res = await httpRequest(options);
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
            it('cluster-name', async () => {
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/clusters',
                    method: 'GET'
                };
                res = await httpRequest(options);
            });
            it('has-protocol',         () =>{assert.nestedProperty(res[1],'spec.protocol')});
            it('protocol',             () =>{assert.nestedPropertyVal(res[1],'spec.protocol','UDP')});
            it('has-port',             () =>{assert.nestedProperty(res[1],'spec.port')});
            it('port',                 () =>{assert.nestedPropertyVal(res[1],'spec.port',16000)});
            it('has-bind-port',        () =>{assert.nestedProperty(res[1],'spec.bind.port')});
            it('bind-port',            () =>{assert.nestedPropertyVal(res[1],'spec.bind.port',16001)});
            it('has-bind-address',     () =>{assert.nestedProperty(res[1],'spec.bind.address')});
            it('bind-address',         () =>{assert.nestedPropertyVal(res[1],'spec.bind.address','127.0.0.1')});
            it('has-endpoints',        () =>{assert.nestedProperty(res[1],'endpoints')});
            it('ingress-cluster-name', () =>{assert.nestedProperty(res[2], 'name', 'test-ingress'); });
            it('egress-cluster-name',  () =>{assert.nestedProperty(res[3], 'name', 'test-egress'); });
        });

        context('delete',()=>{
            let res;
            it('delete-route', async () => {
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
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-listeners', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-multiple-routes', ()=>{
        let res, reqs = [];
        it('add-5-routes', async () => {
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
                reqs.push(httpRequest(options, postData));
            }

            await Promise.all(reqs);

            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes',
                method: 'GET'
            };
            res = await httpRequest(options_get);
            
            assert.lengthOf(res, 6);
            return Promise.resolve();
        });

        it('check-route-1', ()=>{ assert.nestedPropertyVal(res[1], 'name', 'test-route-1');});
        it('check-route-2', ()=>{ assert.nestedPropertyVal(res[2], 'name', 'test-route-2');});
        it('check-route-3', ()=>{ assert.nestedPropertyVal(res[3], 'name', 'test-route-3');});
        it('check-route-4', ()=>{ assert.nestedPropertyVal(res[4], 'name', 'test-route-4');});
        it('check-route-5', ()=>{ assert.nestedPropertyVal(res[5], 'name', 'test-route-5');});

        it('delete-multiple-route', async ()=>{
            let res, reqs = [];
            for(let i = 1; i < 6; i++){
                let options = {
                    host: 'localhost', port: 1234,
                    path: `/api/v1/routes/test-route-${i}`,
                    method: 'DELETE'
                };
                reqs.push(httpRequest(options));
            }

            await Promise.all(reqs);

            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes',
                method: 'GET'
            };
            res = await httpRequest(options_get);
            assert.lengthOf(res,1);
            return Promise.resolve();
        });
    });

    context('invalid-requests',() => {
        it('missing-required-property-name', () => {
            const postData = JSON.stringify({
                "route": {
                    destination: 'l7mp-controller'
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST',
                headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });
        it('missing-required-property-destination', () => {
            const postData = JSON.stringify({
                "route": {
                    name: 'test',
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/routes', method: 'POST',
                headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });
        it('add-existing-route', () => {
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
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });
    });
});
