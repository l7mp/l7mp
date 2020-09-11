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

const assert            = require('chai').assert;
const http              = require('http');

const L7mp              = require('../l7mp.js').L7mp;
const Rule              = require('../rule.js').Rule;
const RuleList          = require('../rule.js').RuleList;
const Session           = require('../session.js').Session;
const Cluster           = require('../cluster.js').Cluster;
const DuplexPassthrough = require('../stream.js').DuplexPassthrough;

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
            name: "test-listener",
            spec: {
                protocol: "Test",
            },
            rules: [
                {
                    action: {
                        route: {
                            destination: {
                                name: "test-cluster",
                                spec: {
                                    protocol: "Test",
                                },
                                endpoints: [{ name: 'Test-e', spec: {}}]
                            },
                            retry: {
                                retry_on: 'always',
                                num_retries: 1,
                                timeout: 100,
                            }
                        }
                    }
                }
            ]
        },
        {
            name: "test-listener-test",
            spec: {
                protocol: "Test",
            },
            rules: [
                {
                    action: {
                        route: {
                            destination: {
                                name: "test-cluster-test",
                                spec: {
                                    protocol: "Test",
                                },
                                endpoints: [{ name: 'test-e-test', mode: ['ok'], timeout:3001, spec: {}}]
                            },
                        }
                    }
                }
            ]
        },
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

describe('Session API', ()  => {
    let s, c, e1, e2;
    const du = new DuplexPassthrough;
    before( async function () {
        this.timeout(8000);
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        // do not validate config: Test listener/cluster is not exposed in OpenAPI
        l7mp.admin.strict = false;
        await l7mp.run(); // should return
        let x = { metadata: {name: 'test-session'},
            source: { origin: 'test-listener', stream: du.right }};
        // s = new Session(x);
        // l7mp.sessions.push(s);
        // s.create();
        // await s.router();
        await l7mp.addSession(x);
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('sessions', ()=>{
        it('get-sessions', async ()=>{
            let res;
            let options = {
                host: 'localhost', port: '1234',
                path: '/api/v1/sessions',
                method : 'GET',
            }
            res = await httpRequest(options);
            assert.lengthOf(res, 2);
            return Promise.resolve();
        });
    });
    context('get-check-sessions-by-name',()=>{
        let res;
        it('get-session-by-name', async()=>{
            let options = {
                host: 'localhost', port: '1234',
                path: '/api/v1/sessions/test-session',
                method : 'GET'
            }
            res = await httpRequest(options);
            assert.isOk(res);
            return Promise.resolve();
        });
        it('has-metadata', ()=>{ assert.property(res,'metadata')});
        it('has-name', ()=>{ assert.nestedProperty(res,'name')});
        it('name-value', ()=>{ assert.nestedPropertyVal(res,'name','test-session')});
        it('has-source', ()=>{ assert.property(res,'source')});
        it('has-source-origin', ()=>{ assert.nestedProperty(res,'source.origin')});
        it('source-origin-value', ()=>{ assert.nestedPropertyVal(res,'source.origin','test-listener')});
        it('has-source-listener', ()=>{ assert.nestedProperty(res,'source.listener')});
        it('has-source-status', ()=>{ assert.nestedProperty(res,'source.status')});
        it('source-status-value', ()=>{ assert.nestedPropertyVal(res,'source.status','READY')});
        it('has-destination', ()=>{ assert.property(res,'destination')});
        it('I/O-1', (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                assert.equal(data, 'test');
                du.left.removeAllListeners();
                done();
            });
            du.left.write('test');
        });
    });
 
    context('delete-endpoint-recursive-disconnects-session', () => {
        it('add-endpoint', async () =>{
            const postData = JSON.stringify({
                endpoint: {
                    name: 'Test-e-2', spec: { address: 'dummy'}
                }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/clusters/test-cluster/endpoints', method: 'POST',
                headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            res = await httpRequest(options, postData);
            assert.nestedPropertyVal(res, 'status', 200);
            return Promise.resolve();
        });
        
        it('get-session-cluster-and-endpoints', () => {
            s = l7mp.getSession('test-session');
            c = l7mp.getCluster('test-cluster');
            e1 = c.endpoints[0];
            e2 = c.endpoints[1];
            // console.log(s.toJSON());
            // dump(l7mp, 2);
            assert.isOk(s && c && e1 && e2);
        });
        // trivial load-balancer should use the first endpoint
        it('endpoint-1-ok', () => {
            assert.nestedPropertyVal(s, 'destination.endpoint.name', 'Test-e');
        });

        // delete first endPoint recursively, session should disconnect
        it('delete-endpoint-1', async () => {
            s.once('disconnect', () => {return Promise.resolve()});
            let options = {
                host : 'localhost', port : 1234,
                path : '/api/v1/endpoints/Test-e?recursive=true',
                method : 'DELETE'
            };
            res = await httpRequest(options);
            assert.propertyVal(res, 'status', 200);
        });
        // session should reconnect on endpoint-2 immediately
        it('reconnect', (done) => {
            setTimeout(() => {
                assert.equal(s.status, 'CONNECTED');
                done();
            }, 500);
        });
        it('endpoint-2-ok', () => {
            assert.equal(s.destination.endpoint.name, 'Test-e-2');
        });
        it('I/O-2',  (done) => {
            du.left.on('readable', () => {
                let data = ''; let chunk;
                while (null !== (chunk = du.left.read())) {
                    data += chunk;
                }
                du.left.removeAllListeners();
                assert.equal(data, 'test');
                done();
            });
            du.left.write('test');
        });
    });
    
    context('get-check-sessions-by-name',()=>{
        it('delete-session-by-name', async ()=>{
           let options = {
               host : 'localhost', port : 1234,
               path : '/api/v1/sessions/test-session',
               method : 'DELETE'
           };
           res = await httpRequest(options);
           assert.propertyVal(res, 'status', 200);
           return Promise.resolve();
        });
        it('get-sessions', async()=>{
            let options = {
                host: 'localhost', port: '1234',
                path: '/api/v1/sessions',
                method : 'GET'
            }
            res = await httpRequest(options);
            assert.isOk(res);
            return Promise.resolve();
        });
    });

    context('invalid-requests', ()=>{
        let res, x;
        it('delete-nonexistent-session', async ()=>{
            let options = {
                host : 'localhost', port : 1234,
                path : '/api/v1/sessions/non-existent-session',
                method : 'DELETE'
            };
            return httpRequest(options)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });
        before(async function() {
            this.timeout(8000);
            const du = new DuplexPassthrough;
            x = { metadata: {name: 'test-session-test'},
                source: { origin: 'test-listener-test', stream: du.right },
                destination: { origin: 'test-cluster-test'}};
        });
        //TODO Fix it, doesnt work right now, if timeout is set high enough, then the response for
        // the GET request will be 'Bad request: non such session'
        it('get-session-with-test-destination', async function(){
            let e = l7mp.getEndPoint('test-e-test');
            // console.log(e)
            e.mode=['ok'];
            e.timeout = 1000;
            // no await: just start the session and let the getSession arrive while the session
            // endpoint stream request is pending
            l7mp.addSession(x);
            // let the session init itself
            this.timeout(100);
            // now, issue the getSession: should fail with half-connected session
            let options = {
                host: 'localhost', port: '1234',
                path: '/api/v1/sessions/test-session-test',
                method : 'GET'
            }
            res = await httpRequest(options);
            // console.log(res);
            assert.isOk(res);
            return Promise.resolve();
        });
    });

});
