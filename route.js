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

const retry_default_policy = {
    // never, connect-failure, error, always (connect-failure & error)
    // retry_on: 'connect-failure',
    retry_on: 'never',
    num_retries: 1,   // meaningless when retry_on is 'never'
    timeout: 2000,    // msec!
};

class Route {
    constructor(r){
        this.name        = r.name || `Route_${Route.index++}`;  // id
        this.session     = null;
        this.source      = r.listener;    // listener: {origin/stream}
        this.destination = r.cluster;     // cluster:  {origin/stream}
        this.chain       = { ingress: [], egress: [] };
        this.type        = this.source.origin.type;  // init
        this.retry       = r.retry || retry_default_policy;
        this.active_streams = 1;   // the listener stream is already active
    }

    toJSON(){
        log.silly('Route.toJSON:', `"${this.name}"`);
        return {
            // name:     this.name,
            // type:     this.type,
            // session:  this.session.name || 'NULL',
            listener: this.source.origin.name,
            cluster:  this.destination.origin.name,
            ingress:  this.chain.ingress.map( (e) => e.origin.name ),
            egress:   this.chain.egress.map( (e) => e.origin.name ),
            retry:    this.retry,
        };
    }

    async pipeline(s){
        log.silly("Route.pipeline:", `Session: ${s.name}:`,
                  `${this.source.origin.name} ->`,
                  `${this.destination.origin.name}`);

        //eventDebug(this.source.stream);

        // prepare wait_list
        let wait_list = this.pipeline_init(s);

        // resolve
        let success = 0;
        var resolved_list = [];
        while(1){
            try {
                resolved_list = await Promise.all(wait_list);
                break;
            } catch(e){
                // at this point we SHOULD get the reference to the
                // cluster that could not connect
                let ref = e.ref;
                let index = e.index;  // index on the wait_list
                if (typeof ref !== 'object' ||
                    typeof index === 'undefined' || index < 0){
                    log.error('Route.pipeline: Internal error:',
                              'unknown ref/index on connect error');
                }

                log.warn("Route.pipeline:", `Session: ${s.name}:`,
                         `Error on cluster "${ref.origin.name}"/index:${index}:`,
                         (e.errno) ? `${e.errno}: ${e.address}:${e.port}` :
                         dumper(e, 1));
                if(log.level === 'silly')
                    console.trace();

                // returns 1 if failing cluster is retried, 0 if it
                // cannot be retried any more
                if(!this.pipeline_reconnect(wait_list, ref, s, index))
                    throw new Error(`Pipeline initialization failed for `+
                                    `session: ${s.name}: `+
                                    `could not connect "${ref.origin.name}: ` +
                                    `retry={retry_on: ${this.retry.retry_on}, `+
                                    `num_retries: ${this.retry.num_retries}, `+
                                    `timeout: ${this.retry.timeout}}: `+
                                    `retry_num: ${ref.retry_num}: last error: `+
                                    e.errno);

            }
        }

        for(let i = 0; i < resolved_list.length; i++)
            if(typeof resolved_list[i] === 'undefined'){
                log.error("Route.pipeline:", `Internal error:`,
                          `Empty stream for cluster`,
                          `${resolved_list[i].ref.origin.name}`);
                // return new Error('Empty stream');
           }

        // set streams for each route elem
        let d = resolved_list.pop();
        this.destination.stream = d.stream;
        this.active_streams++;
        resolved_list.forEach( (r) => {
            r.ref.stream = r.stream;
            this.active_streams++;
        });

        log.verbose("Route.pipeline:",
                    `${this.active_streams} stream(s) initiated`);

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
        // init retry counts
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => { e.retry_num = 0 });
        }
        this.destination.retry_num = 0;

        var wait_list = [];
        let i = 0;
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                wait_list.push(this.connect_cluster(e, s, i++));
            });
        }
        wait_list.push(this.connect_cluster(this.destination, s, i++));

        return wait_list;
    }

    connect_cluster(ref, s, i){
        return ref.origin.stream(s).then(
            (stream) => {
                return {ref: ref,
                        stream: stream};
            },
            (error) => {
                // return the problematic endpoint
                error.ref = ref; error.index = i; throw error;
            });
    }

    pipeline_reconnect(wait_list, ref, s, index){
        let cluster = ref.origin;
        let retry = this.retry;
        log.silly('Route.pipeline_reconnect:',
                  `session ${s.name}:`,
                  `cluster "${cluster.name}"/index:${index}:`,
                  `retry_on: ${retry.retry_on},`,
                  `num_retries: ${retry.num_retries},`,
                  `timeout: ${retry.timeout}:`
                 );

        if((retry.retry_on === 'connect-failure' ||
            retry.retry_on === 'always') &&
           ref.retry_num++ < retry.num_retries){
            log.info('Route.pipeline_reconnect:',
                      `session ${s.name}:`,
                      `reconnecting cluster`,
                      `"${cluster.name}"/index:${index}:`,
                      `retry_num: ${ref.retry_num}`
                     );

            // rewrite failed stream promise on the wait_list to a
            // promise that waits for timeout msecs and try to
            // reconnect
            wait_list[index] = new Promise(
                resolve => setTimeout(resolve,
                                      retry.timeout)).
                then( () => this.connect_cluster(ref, s, index));

            return 1;
        }
        return 0;
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
        // Writable has 'close', readable has 'end', duplex has
        // who-knows...

        // need this for being able to remove listeners
        let onDisc = this.onDisc = this.disconnect.bind(this);
        let eh = function(event, e){
            e.stream.on(event, (err) => {
                log.silly(`Route.event:`, `"${event}" event received:`,
                          `${e.origin.name}`,
                          (err) ? ` Error: ${err}` : '');
                onDisc(e.origin, e.stream, err);
            });
        };

        eh('end', this.source);
        eh('close', this.source);
        eh('error', this.source);

        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                eh('end', e);
                eh('close', e);
                eh('error', e);
            });
        }

        eh('end', this.destination);
        eh('close', this.destination);
        eh('error', this.destination);
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

    // called when one of the streams fail
    disconnect(origin, stream, error){
        log.silly('Route.disconnect:', `origin: ${origin.name}`,
                  (error) ? `Error: ${dumper(error, 2)}` : '');
        this.active_streams--;

        if(this.session.status === 'CONNECTED')
            this.session.emit('disconnect', origin, error);
        if(this.active_streams === 0)
            // let streams so I/O
            this.session.emit('destroy');

        switch(this.retry.policy){
        case 'autoreconnect':
            // should implement autoreconnect policy (retry forever)
        case 'retry':
            // should implement retry policy (retry 'n' times)
        case 'never': // never retry, fail immediately
        case undefined:
        default:
            // do not delete the route, deleteSession will do this
            // suppress event for sessions that are already being
            // destroyed
            if(this.session.status !== 'FINALIZING'){
                if(error)
                    this.session.emit('error', error);
                else
                    this.session.emit('end');
            }
        }
    }

    // if error is defined, emit an error event
    end(error){
        let queue = this.getStreams();
        log.silly('Route.end:', `${this.name}:`, `error:`,
                  error || 'NONE', `deleting ${queue.length} streams`);
        queue.forEach( (s) => {
            // remove event handlers to prevent event storms and
            // recursively re-call us from each event handler
            s.removeListener("end", this.onDisc);
            s.removeListener("close", this.onDisc);
            s.removeListener("error", this.onDisc);

            if(!s.destroyed) s.end();
        });
    }

};
Route.index = 0;

Route.create = (r) => {
    log.info("Route.create:",
             `${r.listener.origin.name} -> ${r.cluster.origin.name}`);
    return new Route(r);
}

module.exports.Route = Route;
