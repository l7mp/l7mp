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

const log            = require('npmlog');
const http           = require('http');
const Url            = require('url');
const YAML           = require('yamljs');
const Ajv            = require('ajv');
const OpenAPIBackend = require('openapi-backend').default;

const json_indent  = 4;
// for no indentation:
// const json_indent  = null;

// L7MP REST API def
class L7mpOpenAPI {
    constructor(){
        this.api = new OpenAPIBackend({
            definition: './openapi/l7mp-openapi.yaml',
            strict: true,
            // validate: true,
            validate: false,
            withContext: true,
            ajvOpts: { unknownFormats: true },
            customizeAjv: () => new Ajv(),
            handlers: {},
        });

        this.api.init();

        this.api.registerHandler('getConf', (ctx, req, res) => {
            log.info("L7mp.api.getConf");
            res.status = 200;
            res.message = l7mp;
        });

        this.api.registerHandler('getAdmin', (ctx, req, res) => {
            log.info("L7mp.api.getAdmin");
            res.status = 200;
            res.message = l7mp.getAdmin();
        });

        this.api.registerHandler('getListeners', (ctx, req, res) => {
            log.info("L7mp.api.getListeners");
            res.status = 200;
            res.message = l7mp.listeners;
        });

        this.api.registerHandler('getListener', (ctx, req, res) => {
            log.info("L7mp.api.getListener");
            let result = l7mp.getListener(ctx.request.params.name);
            if(result){
                res.status = 200;
                res.message = result;
            } else {
                res.status = 400;
                res.message = { status: 400, err: 'No such listener' };
            }
        });

        this.api.registerHandler('addListener', (ctx, req, res) => {
            log.info("L7mp.api.addListener");
            try {
                let result = l7mp.addListener(req.body.listener);
                res.status = 200;
                res.message = { status: 200, err: 'OK' };
            } catch(e) {
                res.status = 400;
                res.message = { status: 400, err: e.msg };
            }
        });

        this.api.registerHandler('deleteListener', (ctx, req, res) => {
            log.info("L7mp.api.deleteListener");
            try {
                let result =
                    l7mp.deleteListener(ctx.request.params.name);
                res.status = 200;
                res.message = { status: 200, err: 'OK' };
            } catch(e) {
                res.status = 400;
                res.message = { status: 400, err: e.msg };
            }
        });

        this.api.registerHandler('getClusters', (ctx, req, res) => {
            log.info("L7mp.api.getClusters");
            res.status = 200;
            res.message = l7mp.clusters;
        });

        this.api.registerHandler('getCluster', (ctx, req, res) => {
            log.info("L7mp.api.getCluster");
            let result = l7mp.getCluster(ctx.request.params.name);
            if(result){
                res.status = 200;
                res.message = result;
            } else {
                res.status = 400;
                res.message = { status: 400, err: 'No such cluster' };
            }
        });

        this.api.registerHandler('addCluster', (ctx, req, res) => {
            log.info("L7mp.api.addCluster");
            try {
                let result = l7mp.addCluster(req.body.cluster);
                res.status = 200;
                res.message = { status: 200, err: 'OK' };
            } catch(e) {
                res.status = 400;
                res.message = { status: 400, err: e.msg };
            }
        });

        this.api.registerHandler('deleteCluster', (ctx, req, res) => {
            log.info("L7mp.api.deleteCluster");
            try {
                let result =
                    l7mp.deleteCluster(ctx.request.params.name);
                res.status = 200;
                res.message = { status: 200, err: 'OK' };
            } catch(e) {
                res.status = 400;
                res.message = { status: 400, err: e.msg };
            }
        });

        this.api.registerHandler('getSessions', (ctx, req, res) => {
            log.info("L7mp.api.getSessions");
            res.status = 200;
            res.message = l7mp.sessions;
        });

        this.api.registerHandler('getSession', (ctx, req, res) => {
            log.info("L7mp.api.getSession");
            let result = l7mp.getSession(ctx.request.params.name);
            if(result){
                res.status = 200;
                res.message = result;
            } else {
                res.status = 400;
                res.message = { status: 400, err: 'No such session' };
            }
        });

        this.api.registerHandler('deleteSession', (ctx, req, res) => {
            log.info("L7mp.api.deleteSession");
            try {
                l7mp.deleteSession(ctx.request.params.name);
                res.status = 200;
                res.message = { status: 200, err: 'OK' };
            } catch(e) {
                res.status = 400;
                res.message = { status: 400,
                                err: e.msg ? e.msg : e };
            }
        });

        this.api.register('validationFail', (ctx, req, res) => {
            log.info("L7mp.api.validationFail");
            res.status = 400;
            res.message = { status: 400, err: ctx.validation.errors };
        });

        this.api.register('notFound', (ctx, req, res) => {
            log.info("L7mp.api.notFound");
            res.status = 404;
            res.message = { status: 404, err: 'Not found' };
        });

        this.api.register('notImplemented', (ctx, req, res) => {
            log.info("L7mp.api.notImplemented");
            res.status = 501;
            res.message = {
                status: 501,
                err: 'No handler registered for operation'
            };
        });

        this.api.register('postResponseHandler', (ctx, req, res) => {
            // const valid = ctx.api.validateResponse(ctx.response,
            //                                        ctx.operation);
            // if (valid.errors) {
            //     res.writeHead(502,
            //                   {'Content-Type': 'application/json'});
            //     res.end(JSON.stringify( {
            //         status: 502,
            //         err: 'Response validation failed',
            //     }));
            // } else {
            {
                res.writeHead(res.status,
                              {'Content-Type': 'application/json'});
                res.end(JSON.stringify(res.message, null, 4));
            }
        });
    }

    handleRequest(req, res){
        // prepare
        let url = Url.parse(req.url, true);
        let ctx = {
            method: req.method,
            path: url.pathname,
            // body: body,
            query: url.query,
            headers: req.headers,
        };

        // read request body
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            try {
                switch(req.headers['content-type']){
                case 'application/json':
                case 'application/x-json':
                case 'text/json':
                case 'text/x-json':
                    log.silly('l7mp.openapi: handleRequest',
                              'Received JSON reuqest');
                    req.body = JSON.parse(body);
                    break;
                case 'text/yaml':
                case 'text/x-yaml':
                case 'application/yaml':
                case 'application/x-yaml':
                    log.silly('l7mp.openapi: handleRequest',
                              'Received YAML reuqest');
                    req.body = YAML.parse(body);
                    break;
                default:
                    req.body = body;
                    if(req.method === 'POST' || req.method === 'PUT'){
                        // we request a known payload
                        let e = 'Unknown content type: ' +
                            (req.headers['content-type'] || 'N/A');
                        log.silly('l7mp.openapi: handleRequest', e);
                        throw new Error(e);
                    }
                }

                await this.api.handleRequest(ctx, req, res);

            } catch(e) {
                res.writeHead(500,
                              {'Content-Type': 'application/json'});
                res.end(JSON.stringify( {
                    status: 500,
                    err: `Internal server error: ${e.message}`
                }, null, 4));
            }
        });
    }
};

module.exports.L7mpOpenAPI = L7mpOpenAPI;
