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
    var e, s;
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

    after(() => {
      cl.close();
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
          console.log(postData);
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

});
