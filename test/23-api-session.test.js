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
const Session      = require('../session.js').Session;
const DuplexPassthrough = require('../stream.js').DuplexPassthrough;

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

describe('Session API', ()  => {
    let s;
    before( async function () {
        this.timeout(5000);
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        l7mp.applyAdmin({ log_level: 'warn' , strict: true});
        await l7mp.run(); // should return
        const du = new DuplexPassthrough;
        let x = { metadata: {name: 'test-session'},
            source: { origin: 'controller-listener', stream: du.right }};
        s = new Session(x);
        l7mp.sessions.push(s);
        s.create();
        await s.router();
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });
    //DONE: get session /api/v1/sessions
    //DONE: get session by name /api/v1/sessions/{name}
    //TODO: delete session by name    /api/v1/sessions/{name}
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
    context('get-check-delete-sessions-by-name',()=>{
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
        it('has-metadata-name', ()=>{ assert.nestedProperty(res,'metadata.name')});
        it('metadata-name-value', ()=>{ assert.nestedPropertyVal(res,'metadata.name','test-session')});
        it('has-source', ()=>{ assert.property(res,'source')});
        it('has-source-origin', ()=>{ assert.nestedProperty(res,'source.origin')});
        it('source-origin-value', ()=>{ assert.nestedPropertyVal(res,'source.origin','controller-listener')});
        it('has-source-listener', ()=>{ assert.nestedProperty(res,'source.listener')});
        it('has-source-status', ()=>{ assert.nestedProperty(res,'source.status')});
        it('source-status-value', ()=>{ assert.nestedPropertyVal(res,'source.status','READY')});
        it('has-destination', ()=>{ assert.property(res,'destination')});

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
        // it('get-session-by-name', async()=>{
        //     let options = {
        //         host: 'localhost', port: '1234',
        //         path: '/api/v1/sessions',
        //         method : 'GET'
        //     }
        //     res = await httpRequest(options);
        //     console.log(res);
        //     assert.isOk(res);
        //     return Promise.resolve();
        // });
    });

});