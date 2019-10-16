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
const EventEmitter = require('events').EventEmitter;
const util         = require('util');
const _            = require('underscore');

//------------------------------------
//
// Route
//
//------------------------------------

// - Event: 'connect': Promisified in order to let l7mp.route wait for
//   all clusters in the route to connect.

// - Event: 'close': Emitted if one of the streams in the pipeline is
//   closed.

// - Event: 'error' (<Error>): Emitted when an error occurs in the
//   pipeline. The 'close' event will be called directly following
//   this event.

class Route {
    constructor(r){
        this.name        = r.name || `Route_${Route.index++}`;  // id
        this.source      = r.listener;    // listener: {origin/stream}
        this.destination = r.cluster;     // cluster:  {origin/stream}
        this.chain       = { ingress: [], egress: [] };
        this.type        = this.source.origin.type;  // init
    }

    toJSON(){
        log.silly('Route.toJSON:', `"${this.name}"`);
        return {
            name:     this.name,
            type:     this.type,
            listener: this.source.origin.name,
            cluster:  this.destination.origin.name,
            ingress:  this.chain.ingress.map( (e) => e.origin.name ),
            egress:   this.chain.egress.map( (e) => e.origin.name )
        };
    }

    async pipeline(s){
        log.silly("Route.pipeline:", `Session: ${s.name}:`,
                  `${this.source.origin.name} ->`,
                  `${this.destination.origin.name}`);

        // prepare wait_list
        let wait_list = this.pipeline_init(s);

        // resolve
        var resolved_list = await Promise.all(wait_list).catch(
            (e) => {
                log.warn("Route.pipeline:", `Session: ${s.name}:`,
                         `Error: ${e.message}, ${e}`);
                // if(log.level === 'silly')
                //     console.trace();
                throw e;
            });

        for(let i = 0; i < resolved_list.length; i++)
            if(typeof resolved_list[i] === 'undefined'){
                log.warn("Route.pipeline:", `Internal error:`,
                         `Empty stream for cluster`,
                         `${resolved_list[i].ref.origin.name}`);
                return new Error('Empty stream');
            }

        log.silly("Route.pipeline:",
                  `${resolved_list.length} stream(s) initiated`);

        // set up error handlers ('open' and 'unexpected' should have
        // been handled by the cluster/route)
        resolved_list.forEach( (r) => {
            r.stream.on('close', () => {
                this.emit('close', r.ref, r.stream)
            });

            r.stream.on('error', (e) => {
                this.emit('error', e, r.ref, r.stream)
            });
        });

        // set streams for each route elem
        let d = resolved_list.pop();
        this.destination.stream = d.stream;
        resolved_list.forEach( (r) => { r.ref.stream = r.stream });

        // pipe: ingress dir
        this.pipeline_finish(this.source, this.destination,
                             this.chain.ingress, 'ingress');

        // pipe: egress dir
        this.pipeline_finish(this.destination, this.source,
                             this.chain.egress, 'egress');

        return this;
    }

    pipeline_init(s){
        var wait_list = [];
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                wait_list.push( e.origin.stream(s).then(
                    (stream) => { return {ref: e, stream: stream}; }
                ));
            });
        }

        wait_list.push(
            this.destination.origin.stream(s).then(
                (stream) => { return {ref: this.destination,
                                      stream: stream}; }
            ));

        return wait_list;
    }

    pipeline_finish(source, dest, chain, dir){
        var from = source;
        chain.forEach( (to) => {
            from.stream.pipe(to.stream);
            log.silly("Route.pipeline:", `${dir} pipe:`,
                      `${from.origin.name} ->`,
                      `${to.origin.name}`);
            from = to;
        });
        from.stream.pipe(dest.stream);
        log.silly("Route.pipeline:", `${dir} pipe:`,
                  `${from.origin.name} ->`,
                  `${dest.origin.name}`);
    }
};
util.inherits(Route, EventEmitter);
Route.index = 0;

Route.create = (r) => {
    log.silly("Route.create:",
              `${r.listener.origin.name} -> ${r.cluster.origin.name}`);
    return new Route(r);
}

module.exports.Route = Route;
