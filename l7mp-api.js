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

'use strict';

const log        = require('npmlog');
const http       = require('http');
const parser     = require('url');
const bodyParser = require('body-parser');

// L7MP REST API def
class L7mpAPI {
    instantiate(){
        this.get('/api/v1/', (req, res) => {
            log.silly("L7mp.api.get(/api/v1/)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp));
            res.end();
        });

        this.get('/api/v1/admin', (req, res) => {
            log.silly("L7mp.api.get(/api/v1/admin)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.admin));
            res.end();
        });

        // listeners: create
        this.post('/api/v1/listeners', (req, res) => {
            log.silly("L7mp.api.post(/api/v1/listeners)");
            bodyParser.json(req, res, (err) => {
                if (err) {
                    res.statusCode = err.status || 500;
                    res.end(err[req.headers['x-error-property'] ||
                                'message']);
                } else {
                    try {
                        l7mp.addListener(req.body);
                        res.statusCode = 200;
                        res.end('OK');
                    } catch(e) {
                        res.statusCode = 400;
                        res.end('Error:' + e.msg);
                    }
                }
            });
        });

        // listeners: list
        this.get('/api/v1/listeners', (req, res) => {
            log.silly("L7mp.api.get(/api/v1/listeners)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.listeners));
            res.end();
        });

        // listeners: query
        this.get('/api/v1/listeners/:name', (req, res) => {
            log.silly("L7mp.api.get(/api/v1/listeners/:name)");
            if(req.params && req.params.name){
                let l = l7mp.getListener(req.params.name);
                if(l){
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.write(JSON.stringify(l));
                    res.end();
                }
            } else {
                res.statusCode = 400;
                res.end('Error:' + 'Unknown Listener');
            }
        });

        this.get('/api/v1/clusters', (req, res) => {
            log.silly("L7mp.api.get(/api/v1/clusters)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.clusters));
            res.end();
        });

        this.get('/api/v1/sessions', (req, res) => {
            log.silly("L7mp.api.get(/api/v1/sessions)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.sessions));
            res.end();
        });

        this.get('/api/v1/rules', (req, res) => {
            log.silly("L7mp.api.get(/api/v1/rules)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.rules));
            res.end();
        });

        // this.get('/api/v1/transforms', (req, res) => {
        //     log.silly("L7mp.api.get(/api/v1/transforms)");
        //     res.writeHead(200, {'Content-Type': 'application/json'});
        //     res.write(JSON.stringify(l7mp.transforms));
        //     res.end();
        // });
    }

    ///////////////////////

    constructor(){
        this.handlers = { get: {}, post: {}, put: {}, del: {} };
        this.instantiate();
    }

    register(method, url, callback) {
        this.handlers[method.toLowerCase()][url] = callback;
    }

    route(req) {
        let url = parser.parse(req.url, true);
        var handler = this.handlers[req.method.toLowerCase()][url.pathname];
        if (!handler) { handler = this.missing(req); }
        return handler;
    }

    get(url, callback){
        this.register('get', url, callback);
    }

    post(url, callback){
        this.register('post', url, callback);
    }

    put(url, callback){
        this.register('put', url, callback);
    }

    del(url, callback){
        this.register('delete', url, callback);
    }

    all(url, callback){
        for(const method of ['get', 'post', 'put', 'delete']){
            this.register(method, url, callback);
        }
    }

    missing(req, res){
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.write("L7mp.api: No route registered for " + url.pathname);
        res.close();
    }
};

module.exports.L7mpAPI = L7mpAPI;
