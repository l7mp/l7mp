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
            validate: l7mp.admin.strict,
            withContext: true,
            ajvOpts: { unknownFormats: true },
            customizeAjv: () => new Ajv(),
            handlers: {},
        });

        this.api.init();

        this.api.registerHandler('getConf', (ctx, req, res) => {
            log.verbose("L7mp.api.getConf");
            res.status = 200;
            res.content = l7mp;
        });

        this.api.registerHandler('setConf', (ctx, req, res) => {
            log.verbose("L7mp.api.setConf");
            try {
                l7mp.static_config = req.body;
                let result = l7mp.run();
                res.status = 200;
                res.content = { message : 'OK' };
            } catch(e) {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: e.message,
                };
            }
        });

        this.api.registerHandler('getAdmin', (ctx, req, res) => {
            log.verbose("L7mp.api.getAdmin");
            res.status = 200;
            res.content = l7mp.getAdmin();
        });

        this.api.registerHandler('getListeners', (ctx, req, res) => {
            log.verbose("L7mp.api.getListeners");
            res.status = 200;
            res.content = l7mp.listeners;
        });

        this.api.registerHandler('getListener', (ctx, req, res) => {
            log.verbose("L7mp.api.getListener");
            let result = l7mp.getListener(ctx.request.params.name);
            if(result){
                res.status = 200;
                res.content = result;
            } else {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: 'No such listener',
                };
            }
        });

        this.api.registerHandler('addListener', async (ctx, req, res) => {
            log.verbose("L7mp.api.addListener");
            try {
                let result = await l7mp.addListener(req.body.listener);
                res.status = 200;
                res.content = { message: 'OK' };
            } catch(e) {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: e.message,
                };
            }
        });

        this.api.registerHandler('deleteListener', (ctx, req, res) => {
            log.verbose("L7mp.api.deleteListener");
            try {
                let result =
                    l7mp.deleteListener(ctx.request.params.name);
                res.status = 200;
                res.content = { message: 'OK' };
            } catch(e) {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: e.message,
                };
            }
        });

        this.api.registerHandler('getClusters', (ctx, req, res) => {
            log.verbose("L7mp.api.getClusters");
            res.status = 200;
            res.content = l7mp.clusters;
        });

        this.api.registerHandler('getCluster', (ctx, req, res) => {
            log.verbose("L7mp.api.getCluster");
            let result = l7mp.getCluster(ctx.request.params.name);
            if(result){
                res.status = 200;
                res.content = result;
            } else {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: 'No such cluster',
                };
            }
        });

        this.api.registerHandler('addCluster', (ctx, req, res) => {
            log.verbose("L7mp.api.addCluster");
            try {
                let result = l7mp.addCluster(req.body.cluster);
                res.status = 200;
                res.content = { message: 'OK' };
            } catch(e) {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: e.message,
                };
            }
        });

        this.api.registerHandler('deleteCluster', (ctx, req, res) => {
            log.verbose("L7mp.api.deleteCluster");
            try {
                let result =
                    l7mp.deleteCluster(ctx.request.params.name);
                res.status = 200;
                res.content = { message: 'OK' };
            } catch(e) {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: e.message,
                };
            }
        });

        this.api.registerHandler('getSessions', (ctx, req, res) => {
            log.verbose("L7mp.api.getSessions");
            res.status = 200;
            res.content = l7mp.sessions;
        });

        this.api.registerHandler('getSession', (ctx, req, res) => {
            log.verbose("L7mp.api.getSession");
            let result = l7mp.getSession(ctx.request.params.name);
            if(result){
                res.status = 200;
                res.content = result;
            } else {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: 'No such session',
                };
            }
        });

        this.api.registerHandler('deleteSession', (ctx, req, res) => {
            log.verbose("L7mp.api.deleteSession");
            try {
                l7mp.deleteSession(ctx.request.params.name);
                res.status = 200;
                res.content = { message: 'OK' };
            } catch(e) {
                res.status = 400;
                res.content = {
                    message: 'Bad request',
                    error: e.message,
                };
            }
        });

        this.api.register('validationFail', (ctx, req, res) => {
            log.verbose("L7mp.api.validationFail");
            res.status = 400;
            res.content = {
                message: 'Bad request: Input validation failed',
                error: ctx.validation.errors,
            };
        });

        this.api.register('notFound', (ctx, req, res) => {
            log.verbose("L7mp.api.notFound");
            res.status = 404;
            res.content = { message: 'Not found',
                            error: 'Unknown API operation' };
        });

        this.api.register('notImplemented', (ctx, req, res) => {
            log.verbose("L7mp.api.notImplemented");
            res.status = 501;
            res.content = { message: 'No handler registered for operation' };
        });

        this.api.register('postResponseHandler', (ctx, req, res) => {
            log.silly('l7mp.openapi: postResponseHandler');
            // dump(res,3);
            // do not validate 'NotFound' (404) errors: ctx.operation
            // is unknown and this makes validator to croak
            if(l7mp.admin.strict && res.status && res.status !== 404) {
                log.silly('l7mp.openapi:',
                          'postResponseHandler: Validating response');
                let valid = ctx.api.validateResponse(res.content,
                                                     ctx.operation, res.status);
                if (valid.errors) {
                    log.silly('l7mp.openapi: postResponseHandler failed:',
                             `Response: ${dumper(res.content,2)}`);
                    res.status = 500;
                    res.content = {
                        message: 'Internal server error: Response validation failed',
                        error: valid.errors,
                    };
                }
            }
        });
    }

    async handleRequest(s, body, stream){
        log.silly('l7mp.openapi: handleRequest');

        // prepare
        if(!(s.metadata.HTTP && s.metadata.HTTP.method &&
             s.metadata.HTTP.url.path)){
            log.error('L7mpOpenAPI.handleRequest:',
                      'Error: Request HTTP metadata missing');
            return;
        }

        let req = s.metadata.HTTP;
        let res = {};
        var e;

        try {
            switch(req.headers['content-type']){
            case 'application/json':
            case 'application/x-json':
            case 'text/json':
            case 'text/x-json':
                log.silly('l7mp.openapi: handleRequest',
                          'Received JSON request');

                // special casing for API clients that set
                // content-type to JSON on GET/DELETE calls and send
                // an empty body
                if((req.method === 'GET' || req.method === 'DELETE' ) && body === '')
                    req.body = '';
                else
                    try {
                        req.body = JSON.parse(body);
                    } catch(e){
                        log.warn('l7mp.openapi: handleRequest:',
                                 'Invalid JSON request: ', e);
                        res.status = 400;
                        res.content = { message: 'Bad request'};
                        if (e instanceof SyntaxError){
                            res.content.error =
                                'Invalid JSON format in request: ' + e.message;
                        } else {
                            res.content.error =
                                'Invalid JSON format in request: ' + e;
                        }
                        throw res;
                    }
                req.content_type = 'JSON';
                break;
            case 'text/yaml':
            case 'text/x-yaml':
            case 'application/yaml':
            case 'application/x-yaml':
                log.silly('l7mp.openapi: handleRequest',
                          'Received YAML request');
                try {
                    req.body = YAML.parse(body);
                } catch(e) {
                    log.warn('l7mp.openapi: handleRequest: Invalid YAML request: ', e);
                    res.status = 400;
                    res.content = { message: 'Bad request',
                                    error: 'Invalid YAML format in request: ' + e};
                    throw res;
                }
                req.content_type = 'YAML';
                break;
            default:
                if(req.method === 'POST' || req.method === 'PUT'){
                    // we request a known payload
                    log.warn('l7mp.openapi: handleRequest: Unknown content type');
                    res.status = 415;
                    res.content = { message: 'Unsupported Media Type',
                                    error: 'Unknown content type: ' +
                                    (req.headers['content-type'] || 'N/A') };
                    throw res;
                }
            }

            let ctx = {
                method:  req.method,
                path:    req.url.path,
                query:   req.url.query,
                headers: req.headers,
                body:    req.body,
            };

            await this.api.handleRequest(ctx, req, res);

            s.end(res);

            // if(res.status && res.status === 200){
            //     s.emit('end', res);
            // } else {
            //     s.emit('error', res);
            // }
            // make sure we never retry this, even if policy requires
            // setImmediate(() => s.emit('end'));
        } catch(res) {
            // should receive a status/msg pair
            if(!res) res = { status: 500, content: { message: 'Internal server error' }};
            s.end(res);
        }
    }
};

module.exports.L7mpOpenAPI = L7mpOpenAPI;
