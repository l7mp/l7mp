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

const log          = require('npmlog');
const http         = require('http');
const parser       = require('url');
const jsonBody     = require("body/json");
const pathToRegexp = require("path-to-regexp");

const json_indent  = 4;
// for no indentation:
// const json_indent  = null;

// L7MP REST API def
class L7mpAPI {
    instantiate(){
        this.get('/api/v1/', (req, res) => {
            log.info("L7mp.api.get(/api/v1/)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp, null, json_indent));
            res.end();
        });

        this.get('/api/v1/admin', (req, res) => {
            log.info("L7mp.api.get(/api/v1/admin)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.admin, null, json_indent));
            res.end();
        });

        // listeners: list
        this.get('/api/v1/listeners', (req, res) => {
            log.info("L7mp.api.get(/api/v1/listeners)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.listeners, null, json_indent));
            res.end();
        });

        // listeners: create
        this.post('/api/v1/listeners', (req, res) => {
            log.info("L7mp.api.post(/api/v1/listeners)");
            jsonBody(req, res, (err, body) => {
                if (err) {
                    res.statusCode = err.status || 500;
                    res.end(err[req.headers['x-error-property'] ||
                                'message']);
                } else {
                    try {
                        // drop root node
                        body = body['listener'];
                        l7mp.addListener(body);
                        res.statusCode = 200;
                        res.end('OK');
                    } catch(e) {
                        res.statusCode = 400;
                        res.end('Error: ' + e.msg);
                    }
                }
            });
        });

        // listeners: query
        this.get('/api/v1/listeners/:name', (req, res) => {
            log.info("L7mp.api.get(/api/v1/listeners/:name)");
            let x;
            if(req.params && req.params.name &&
               (x = l7mp.getListener(req.params.name))){
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.write(JSON.stringify(x, null, json_indent));
                res.end();
            } else {
                res.statusCode = 400;
                res.end('Error: ' + 'Unknown Listener');
            }
        });

        // clusters: create
        this.post('/api/v1/clusters', (req, res) => {
            log.info("L7mp.api.post(/api/v1/clusters)");
            jsonBody(req, res, (err, body) => {
                if (err) {
                    res.statusCode = err.status || 500;
                    res.end(err[req.headers['x-error-property'] ||
                                'message']);
                } else {
                    try {
                        // drop root node
                        body = body['cluster'];
                        l7mp.addCluster(body);
                        res.statusCode = 200;
                        res.end('OK');
                    } catch(e) {
                        res.statusCode = 400;
                        res.end('Error: ' + e.msg);
                    }
                }
            });
        });

        // listeners: delete
        this.del('/api/v1/listeners/:name', (req, res) => {
            log.info("L7mp.api.delete(/api/v1/listeners/:name)");
            let x;
            if(req.params && req.params.name &&
               (x = l7mp.deleteListener(req.params.name))){
                res.statusCode = 200;
                res.end('OK');
            } else {
                res.statusCode = 400;
                res.end('Error: ' + `Unknown Listener`);
            }
        });

        // clusters: list
        this.get('/api/v1/clusters', (req, res) => {
            log.info("L7mp.api.get(/api/v1/clusters)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.clusters, null, json_indent));
            res.end();
        });

        // clusters: query
        this.get('/api/v1/clusters/:name', (req, res) => {
            log.info("L7mp.api.get(/api/v1/clusters/:name)");
            let x;
            if(req.params && req.params.name &&
               (x = l7mp.getCluster(req.params.name))){
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.write(JSON.stringify(x, null, json_indent));
                res.end();
            } else {
                res.statusCode = 400;
                res.end('Error: ' + 'Unknown Cluster');
            }
        });

        // clusters: delete
        this.del('/api/v1/clusters/:name', (req, res) => {
            log.info("L7mp.api.delete(/api/v1/clusters/:name)");
            let x;
            if(req.params && req.params.name &&
               (x = l7mp.deleteCluster(req.params.name))){
                res.statusCode = 200;
                res.end('OK');
            } else {
                res.statusCode = 400;
                res.end('Error: ' + `Unknown Cluster`);
            }
        });

        // sessions: list
        this.get('/api/v1/sessions', (req, res) => {
            log.info("L7mp.api.get(/api/v1/sessions)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.sessions, null, json_indent));
            res.end();
        });

        // sessions: delete
        this.del('/api/v1/sessions/:name', (req, res) => {
            log.info("L7mp.api.delete(/api/v1/sessions/:name)");
            let x;
            if(req.params && req.params.name &&
               (x = l7mp.deleteSession(req.params.name))){
                res.statusCode = 200;
                res.end('OK');
            } else {
                res.statusCode = 400;
                res.end('Error: ' + `Unknown Session`);
            }
        });

        // rules: list
        this.get('/api/v1/rules', (req, res) => {
            log.info("L7mp.api.get(/api/v1/rules)");
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(l7mp.rules, null, json_indent));
            res.end();
        });

        // this.get('/api/v1/transforms', (req, res) => {
        //     log.info("L7mp.api.get(/api/v1/transforms)");
        //     res.writeHead(200, {'Content-Type': 'application/json'});
        //     res.write(JSON.stringify(l7mp.transforms));
        //     res.end();
        // });
    }

    ///////////////////////

    constructor(){
        this.handlers = { get: [], post: [], put: [], 'delete': [] };
        this.instantiate();
    }

    register(method, template, _callback) {
        method = method.toLowerCase();
        var handlers = this.handlers[method];
        if(handlers.find( ({def}) => def === template)){
            log.error('L7api.register', 'Cannot register URI template',
                      `${method}:${template}: Template already exists`);
        }
        let _keys = [];
        let _regexp = pathToRegexp(template, _keys);
        handlers.push( { def: template,
                         keys: _keys,
                         regexp: _regexp,
                         callback: _callback } );
    }

    route(req, res) {
        log.silly('l7mp.api:route', `Received request for ${req.url}`);
        var handler;
        let method = req.method.toLowerCase();
        let url = parser.parse(req.url, true);
        let handlers = this.handlers[method];
        for(let i = 0; i < handlers.length; i++){
            let q = handlers[i].regexp.exec(url.pathname);
            if(q){
                if(!req.params) req.params = {};
                for(let j = 0; j < handlers[i].keys.length; j++)
                    req.params[handlers[i].keys[j].name] = q[j+1]; // curious
                handler = handlers[i].callback;
                break;
            }
        }
        if (!handler) { handler = this.missing; }
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
        res.write(`L7mp.api: No route for URI: ${req.method.toUpperCase()}:${req.url}\n`);
        res.end();
    }
};

module.exports.L7mpAPI = L7mpAPI;
