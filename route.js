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
const miss         = require('mississippi')
const _            = require('underscore');
const eventDebug   = require('event-debug')

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

        eventDebug(this.source.stream);

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

        // set up error handlers ('open' and 'unexpected' should have
        // been handled by the cluster/route)
        this.pipeline_event_handlers();

        return this;
    }

    pipeline_init(s){
        var wait_list = [];
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                wait_list.push( e.origin.stream(s).then(
                    (stream) => { eventDebug(stream);
                                  return {ref: e,
                                          stream: stream};
                                }));
            });
        }

        wait_list.push(
            this.destination.origin.stream(s).then(
                (stream) => { return {ref: this.destination,
                                      stream: stream};
                            }));

        return wait_list;
    }

    pipeline_finish(source, dest, chain, dir){
        var from = source;
        chain.forEach( (to) => {
            log.silly("Route.pipeline:", `${dir} pipe:`,
                      `${from.origin.name} ->`,
                      `${to.origin.name}`);
            this.pipe(from.stream, to.stream);
            from = to;
        });
        log.silly("Route.pipeline:", `${dir} pipe:`,
                  `${from.origin.name} ->`,
                  `${dest.origin.name}`);
        this.pipe(from.stream, dest.stream);
    }

    pipeline_event_handlers(){
        // Writable has 'close', readable has 'end', duplex has who-knows...
        this.set_event_handler(this.source, 'end');
        this.set_event_handler(this.source, 'close');
        this.set_event_handler(this.source, 'error');

        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                this.set_event_handler(e, 'end');
                this.set_event_handler(e, 'close');
                this.set_event_handler(e, 'error');
            });
        }

        this.set_event_handler(this.destination, 'end');
        this.set_event_handler(this.destination, 'close');
        this.set_event_handler(this.destination, 'error');
    }

    set_event_handler(e, event){
        log.silly("Route.pipeline:", `setting "${event}" event handlers`,
                  `for stream: origin: "${e.origin.name}"`);

        // miss.pipe: handles evrything at one place -> see "end-of-stream"
        // miss.finished(e.stream,  (err) => {

        e.stream.once(event, (err) => {
            log.silly(`Route.event:`, `"${event}" event received:`,
                      `${e.origin.name}`,
                      (err) ? `Error: ${err}` : '');
            // if err is defined, then it's an error
            this.emit('end', e.origin, e.stream, err);
        });
    }

    // local override to allow experimenting with mississippi.pipe or
    // other pipe implementations
    pipe(from, to){
        // default: source remains alive is destination closes/errs
        return from.pipe(to);
        // this will kill the source if the destination fails
        // miss.pipe(from, to, (error) => {
        //     error = error || '';
        //     log.silly("Route.pipe.Error event: ", `${error}`);
        //     this.emit('error', error, from, to);
        // });
    }

    getIngressStreams(){
        let streams = [];
        if(this.source.stream)
            streams.push(this.source.stream);
        if(this.chain && this.chain['ingress'])
            this.chain['ingress'].forEach( (e) => {
                if(e.stream)
                    streams.push(e.stream);
            });

        return streams;
    }

    getEgressStreams(){
        let streams = [];
        if(this.chain && this.chain['egress'])
            this.chain['egress'].forEach( (e) => {
                if(e.stream)
                    streams.push(e.stream);
            });
        if(this.destination && this.destination.stream)
            streams.push(this.destination.stream);

        return streams;
    }

    getStreams(){
        let streams = this.getIngressStreams().concat(this.getEgressStreams());

        // remove duplicates as per https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates
        streams = [...new Set(streams)]
        return streams;
    }

    end(){
        if(this.type === 'session')
            return;
        let queue = this.getStreams();
        log.silly('Route.end:', `${this.name}:`,
                  `deleting ${queue.length} streams`);
        queue.forEach( (s) => {
            if(!s.destroyed){
                log.silly('Route.end:', '(stream.destroyed != true)',
                          'calling end()');
                s.end();
            }
        });
    }
};
util.inherits(Route, EventEmitter);
Route.index = 0;

Route.create = (r) => {
    log.info("Route.create:",
             `${r.listener.origin.name} -> ${r.cluster.origin.name}`);
    return new Route(r);
}

module.exports.Route = Route;
