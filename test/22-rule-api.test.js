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

describe('Rule API', ()  => {
    
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

    context('add-check-delete-rule-via-api', () =>{
      let res;
      it('add-rule', async () =>{
          const postData = JSON.stringify({
              "rule": {
                  name: "test-rule",
                  match: {op: 'contains', path: '/a/b/c', value: 'test'}, 
                  action: {
                    rewrite: [{
                      path: 'a/b/c',
                      value: 'test'
                    }], 
                    route: 'Test-rc',
                    apply: 'Test-rc'
                  }
                }
          });
          let options = {
              host: 'localhost', port: 1234,
              path: '/api/v1/rule', method: 'POST'
              , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
          }
          await httpRequest(options, postData);
      });
      
      context('check-properties',()=>{
          it('rule-name', async () =>{
              let options = {
                  host: 'localhost', port: 1234,
                  path: '/api/v1/rule',
                  method: 'GET'
              };
              res = await httpRequest(options)
          });
          it('name',              () => { assert.propertyVal(res[1], 'name', 'test-rule'); });
          it('has-match',         () => { assert.property(res[1], 'match'); });
          it('match-op',          () => { assert.nestedPropertyVal(res[1], 'match.op', 'contains'); });
          it('match-path',        () => { assert.nestedPropertyVal(res[1], 'match.path', '/a/b/c'); });
          it('match-value',       () => { assert.nestedPropertyVal(res[1], 'match.value', 'test'); });
          it('has-action',        () => { assert.property(res[1], 'action'); });
          it('rewrite-isa-array', () => { assert.instanceOf(res[1].action.rewrite, Array); });
          it('rewrite-path',      () => { assert.propertyVal(res[1].action.rewrite[0], 'path', 'a/b/c'); });
          it('rewrite-value',     () => { assert.propertyVal(res[1].action.rewrite[0], 'value', 'test'); });
          it('action-route',      () => { assert.nestedPropertyVal(res[1], 'action.route', 'Test-rc'); });
          it('action-apply',      () => { assert.nestedPropertyVal(res[1], 'action.apply', 'Test-rc'); });
    });
      
      context('delete', ()=>{
          let res;
          it('delete-rule', async ()=>{
              let options = {
                  host: 'localhost', port: 1234,
                  path: '/api/v1/rules/test-rule',
                  method: 'DELETE'
              };
              let options_get= {
                  host: 'localhost', port: 1234,
                  path: '/api/v1/rule',
                  method: 'GET'
              }
              await httpRequest(options);
              res = await httpRequest(options_get);
          });
          it('length-of-rules', () => { assert.lengthOf(res, 1); });
      });
    });

    context('add-check-delete-rule-objects-via-api', () =>{
        let res;
        it('add-rule', async () =>{
            const postData = JSON.stringify({
                "rule": {
                    name: "test-rule",
                    match: {op: 'contains', path: '/a/b/c', value: 'test'}, 
                    action: {
                      rewrite: [{
                        path: 'a/b/c',
                        value: 'test'
                      }], 
                      route: {name: 'test-route', destination: 'Test-rc'},
                      apply: 'Test-rc'
                    }
                  }
            });
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rule', method: 'POST', 
                headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            await httpRequest(options, postData);
        });
        
        context('check-properties',()=>{
            it('rule-name', async () =>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/rule',
                    method: 'GET'
                };
                res = await httpRequest(options)
                console.log(res);
            });
            it('name',              () => { assert.propertyVal(res[1], 'name', 'test-rule'); });
            it('has-match',         () => { assert.property(res[1], 'match'); });
            it('match-op',          () => { assert.nestedPropertyVal(res[1], 'match.op', 'contains'); });
            it('match-path',        () => { assert.nestedPropertyVal(res[1], 'match.path', '/a/b/c'); });
            it('match-value',       () => { assert.nestedPropertyVal(res[1], 'match.value', 'test'); });
            it('has-action',        () => { assert.property(res[1], 'action'); });
            it('rewrite-isa-array', () => { assert.instanceOf(res[1].action.rewrite, Array); });
            it('rewrite-path',      () => { assert.propertyVal(res[1].action.rewrite[0], 'path', 'a/b/c'); });
            it('rewrite-value',     () => { assert.propertyVal(res[1].action.rewrite[0], 'value', 'test'); });
            it('action-route',      () => { assert.nestedPropertyVal(res[1], 'action.route', 'test-route'); });
            it('action-apply',      () => { assert.nestedPropertyVal(res[1], 'action.apply', 'Test-rc'); });
      });
        
        context('delete', ()=>{
            let res;
            it('delete-rule', async ()=>{
                let options = {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/rules/test-rule',
                    method: 'DELETE'
                };
                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/rule',
                    method: 'GET'
                }
                await httpRequest(options);
                res = await httpRequest(options_get);
            });
            it('length-of-rules', () => { assert.lengthOf(res, 1); });
        });
    });

    context('add-check-delete-multiple-rules', () => {
        let res, reqs = [];
        it('add-5-rule', async () =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rule', method: 'POST',
                headers: {'Content-Type' : 'text/x-json'}
            };
            for(let i = 1; i <= 5; i++){
                let postData = JSON.stringify({
                    "rule": {
                        name: `test-rule-${i}`,
                        match: {op: 'contains', path: '/a/b/c', value: 'test'}, 
                        action: {
                            rewrite: [{
                                path: 'a/b/c',
                                value: 'test'
                            }], 
                            route: 'test-route',
                            apply: 'Test-rc'
                        }
                      }
                    }
                );
                reqs.push(httpRequest(options, postData));
            }
            await Promise.all(reqs);

            let options_get = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rule',
                method: 'GET'
            };

            res = await httpRequest(options_get);
            return Promise.resolve();
        });
        
        context('check-properties',()=>{
            it('check-rule-1', () => { assert.propertyVal(res[1], 'name', 'test-rule-1'); });
            it('check-rule-2', () => { assert.propertyVal(res[2], 'name', 'test-rule-2'); });
            it('check-rule-3', () => { assert.propertyVal(res[3], 'name', 'test-rule-3'); });
            it('check-rule-4', () => { assert.propertyVal(res[4], 'name', 'test-rule-4'); });
            it('check-rule-5', () => { assert.propertyVal(res[5], 'name', 'test-rule-5'); });
      });
        
        context('delete', ()=>{
            let res, reqs = [];
            it('delete-rule', async () => {
                for(let i = 1; i <= 5; i++){
                    let options = {
                        host: 'localhost', port: 1234,
                        path: `/api/v1/rules/test-rule-${i}`,
                        method: 'DELETE'
                    };
                    reqs.push(httpRequest(options));
                }

                await Promise.all(reqs);

                let options_get= {
                    host: 'localhost', port: 1234,
                    path: '/api/v1/rule',
                    method: 'GET'
                }

                res = await httpRequest(options_get);
                assert.lengthOf(res, 1);
                return Promise.resolve();
            });
        });
    });

    context('invalid-requests', () => {
        it('invalid-add-rule', async () =>{
            const postData = JSON.stringify({
                "rule": {
                    name: "test-rule",
                    match: {op: 'contains', path: '/a/b/c', value: 'test'}
                  }
            });

            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rule', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });

        it('existing-add-rule', async () =>{
            const postData = JSON.stringify({
                "rule": {
                    name: `${l7mp.rules[0]}`,
                    match: {op: 'contains', path: '/a/b/c', value: 'test'}, 
                    action: {
                      rewrite: [{
                        path: 'a/b/c',
                        value: 'test'
                      }], 
                      route: 'Test-rc',
                      apply: 'Test-rc'
                    }
                  }
            });

            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rule', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });

        it('invalid-route-add-rule', async () =>{
            const postData = JSON.stringify({
                "rule": {
                    name: `${l7mp.rules[0]}`,
                    match: {op: 'contains', path: '/a/b/c', value: 'test'}, 
                    action: {
                      rewrite: [{
                        path: 'a/b/c',
                        value: 'test'
                      }], 
                      route: '',
                      apply: 'Test-rc'
                    }
                  }
            });

            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rule', method: 'POST'
                , headers: {'Content-Type' : 'text/x-json', 'Content-length': postData.length}
            }
            return httpRequest(options, postData)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });

        it('get-non-existing-rule', async () =>{
            let options = {
                host: 'localhost', port: 1234,
                path: '/api/v1/rule/notExists',
                method: 'GET'
            };
            return httpRequest(options)
                .then(
                    () =>{ return Promise.reject(new Error('Expected method to reject.'))},
                    err => { assert.instanceOf(err, Error); return Promise.resolve()}
                );
        });
    });
});
