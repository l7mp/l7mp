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

        this.api.registerHandler('getConf', (ctx, req) => {
            log.info("L7mp.api.getConf");
            req.status = 200;
            req.message = l7mp;
        });

        this.api.registerHandler('setConf', (ctx, req) => {
            log.info("L7mp.api.setConf");
            try {
                l7mp.static_config = req.body.config;
                let result = l7mp.run();
                req.status = 200;
                req.message = 'OK';
            } catch(e) {
                req.status = 400;
                req.message = e.msg;
            }
        });

        this.api.registerHandler('getAdmin', (ctx, req) => {
            log.info("L7mp.api.getAdmin");
            req.status = 200;
            req.message = l7mp.getAdmin();
        });

        this.api.registerHandler('getListeners', (ctx, req) => {
            log.info("L7mp.api.getListeners");
            req.status = 200;
            req.message = l7mp.listeners;
        });

        this.api.registerHandler('getListener', (ctx, req) => {
            log.info("L7mp.api.getListener");
            let result = l7mp.getListener(ctx.request.params.name);
            if(result){
                req.status = 200;
                req.message = result;
            } else {
                req.status = 400;
                req.message = 'No such listener';
            }
        });

        this.api.registerHandler('addListener', (ctx, req) => {
            log.info("L7mp.api.addListener");
            try {
                let result = l7mp.addListener(req.body.listener);
                req.status = 200;
                req.message = 'OK';
            } catch(e) {
                req.status = 400;
                req.message = e.msg;
            }
        });

        this.api.registerHandler('deleteListener', (ctx, req) => {
            log.info("L7mp.api.deleteListener");
            try {
                let result =
                    l7mp.deleteListener(ctx.request.params.name);
                req.status = 200;
                req.message = 'OK';
            } catch(e) {
                req.status = 400;
                req.message = e.msg;
            }
        });

        this.api.registerHandler('getClusters', (ctx, req) => {
            log.info("L7mp.api.getClusters");
            req.status = 200;
            req.message = l7mp.clusters;
        });

        this.api.registerHandler('getCluster', (ctx, req) => {
            log.info("L7mp.api.getCluster");
            let result = l7mp.getCluster(ctx.request.params.name);
            if(result){
                req.status = 200;
                req.message = result;
            } else {
                req.status = 400;
                req.message = 'No such cluster';
            }
        });

        this.api.registerHandler('addCluster', (ctx, req) => {
            log.info("L7mp.api.addCluster");
            try {
                let result = l7mp.addCluster(req.body.cluster);
                req.status = 200;
                req.message = 'OK';
            } catch(e) {
                req.status = 400;
                req.message = e.msg;
            }
        });

        this.api.registerHandler('deleteCluster', (ctx, req) => {
            log.info("L7mp.api.deleteCluster");
            try {
                let result =
                    l7mp.deleteCluster(ctx.request.params.name);
                req.status = 200;
                req.message = 'OK';
            } catch(e) {
                req.status = 400;
                req.message = e.msg;
            }
        });

        this.api.registerHandler('getSessions', (ctx, req) => {
            log.info("L7mp.api.getSessions");
            req.status = 200;
            req.message = l7mp.sessions;
        });

        this.api.registerHandler('getSession', (ctx, req) => {
            log.info("L7mp.api.getSession");
            let result = l7mp.getSession(ctx.request.params.name);
            if(result){
                req.status = 200;
                req.message = result;
            } else {
                req.status = 400;
                req.message = 'No such session';
            }
        });

        this.api.registerHandler('deleteSession', (ctx, req) => {
            log.info("L7mp.api.deleteSession");
            try {
                l7mp.deleteSession(ctx.request.params.name);
                req.status = 200;
                req.message = 'OK';
            } catch(e) {
                req.status = 400;
                req.message = e.msg;
            }
        });

        this.api.register('validationFail', (ctx, req) => {
            log.info("L7mp.api.validationFail");
            req.status = 400;
            req.message = ctx.validation.errors;
        });

        this.api.register('notFound', (ctx, req) => {
            log.info("L7mp.api.notFound");
            req.status = 404;
            req.message = 'Not found';
        });

        this.api.register('notImplemented', (ctx, req) => {
            log.info("L7mp.api.notImplemented");
            req.status = 501;
            req.message = 'No handler registered for operation';
        });

        this.api.register('postResponseHandler', (ctx, req) => {
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
            // {
            // ctx.session.emit('end');
            // }
        });
    }

    async handleRequest(s){
        // prepare
        if(!(s.metadata.HTTP && s.metadata.HTTP.method &&
             s.metadata.HTTP.url.path)){
            log.error('L7mpOpenAPI.handleRequest:',
                      'Error: Request HTTP metadata missing');
            return;
        }

        let req = s.metadata.HTTP;
        let url = req.url;
        let ctx = {
            method:  req.method,
            path:    url.path,
            body:    req.body,
            query:   url.query,
            headers: req.headers,
        };

        // dump(ctx.body, 20);

        try {
            switch(req.headers['content-type']){
            case 'application/json':
            case 'application/x-json':
            case 'text/json':
            case 'text/x-json':
                log.silly('l7mp.openapi: handleRequest',
                          'Received JSON reuqest');
                req.body = JSON.parse(req.body);
                break;
            case 'text/yaml':
            case 'text/x-yaml':
            case 'application/yaml':
            case 'application/x-yaml':
                log.silly('l7mp.openapi: handleRequest',
                          'Received YAML reuqest');
                req.body = YAML.parse(req.body);
                break;
            default:
                if(req.method === 'POST' || req.method === 'PUT'){
                    // we request a known payload
                    let e = 'Unknown content type: ' +
                        (req.headers['content-type'] || 'N/A');
                    log.silly('l7mp.openapi: handleRequest', e);
                    // Unsupported Media Type: 415
                    s.emit('error', e);
                }
            }
            await this.api.handleRequest(ctx, req, null);
        } catch(e) {
            // should receive a status/msg pair
            s.emit('error', e);
        }

        s.emit('end');
    }
};

module.exports.L7mpOpenAPI = L7mpOpenAPI;
