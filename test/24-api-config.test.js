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

describe('Admin API', ()  => {
    let s;
    before( async function () {
        this.timeout(8000);
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        await l7mp.run(); // should return
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('get-config-admin', ()=>{
        it('get-config', async ()=>{
            let res;
            let options = {
                host: 'localhost', port: '1234',
                path: '/api/v1/config',
                method : 'GET',
            };
            res = await httpRequest(options);
            // we get some config, content does not matter for now
            assert.containsAllKeys(res, ['admin','listeners','clusters',
                                          'rulelists', 'rules', 'routes', 'sessions']);
            return Promise.resolve();
        });
        it('get-admin', async ()=>{
            let res;
            let options = {
                host: 'localhost', port: '1234',
                path: '/api/v1/admin',
                method : 'GET',
            };
            res = await httpRequest(options);
            // we get some config, content does not matter for now
            assert.containsAllKeys(res, ['version','strict']);
            return Promise.resolve();
        });
    });
});
