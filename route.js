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
    retry_on: 'never',
    num_retries: 1,
    timeout: 2000,
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
        this.retry_on_disconnect_num = 0;
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

    async pipeline(){
        let s = this.session;
        log.silly("Route.pipeline:", `Session: ${s.name}:`,
                  `${this.source.origin.name} ->`,
                  `${this.destination.origin.name}`);

        //eventDebug(this.source.stream);

        // prepare wait_list
        let wait_list = this.pipeline_init();

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

                log.info("Route.pipeline:", `Session: ${s.name}: Error on`,
                         `cluster "${ref.origin.name}"/index:${index}:`,
                         (e.errno) ? `${e.errno}: ${e.address}:${e.port}` :
                         dumper(e, 1));
                if(log.level === 'silly')
                    console.trace();

                let p = this.pipeline_reconnect(ref, index)
                if(!p)
                    throw new Error(`Pipeline initialization failed for `+
                                    `session: ${s.name}: `+
                                    `could not connect "${ref.origin.name}: ` +
                                    `retry={retry_on: ${this.retry.retry_on}, `+
                                    `num_retries: ${this.retry.num_retries}, `+
                                    `timeout: ${this.retry.timeout}}: `+
                                    `retry_num: ${ref.retry_num}: last error: `+
                                    e.errno);
                wait_list[index] = p;
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

        log.info("Route.pipeline:",
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

    pipeline_init(){
        let s = this.session;

        // init retry counts
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => { e.retry_num = 0 });
        }
        this.destination.retry_num = 0;

        var wait_list = [];
        let i = 0;
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                wait_list.push(this.connect_cluster(e, i++));
            });
        }
        wait_list.push(this.connect_cluster(this.destination, i++));

        return wait_list;
    }

    connect_cluster(ref, i){
        let s = this.session;
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

    pipeline_reconnect(ref, index){
        let cluster = ref.origin;
        let retry = this.retry;
        let s = this.session;

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
            return new Promise(
                resolve => setTimeout(resolve,
                                      retry.timeout)).
                then( () => this.connect_cluster(ref, index));
        }
        return 0;
    }

    pipeline_finish(source, dest, chain, dir){
        var from = source;
        chain.forEach( (to) => {
            log.silly("Route.pipeline:", `${dir} pipe:`,
                      `${from.origin.name} ->`,
                      `${to.origin.name}`);
            this.pipe(from, to);
            from = to;
        });
        log.silly("Route.pipeline:", `${dir} pipe:`,
                  `${from.origin.name} ->`,
                  `${dest.origin.name}`);
        this.pipe(from, dest);
    }

    pipeline_event_handlers(){
        this.set_event_handlers(this.source);
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                this.set_event_handlers(e);
            });
        }
        this.set_event_handlers(this.destination);
    }

    set_event_handlers(ref){
        // Writable has 'close', readable has 'end', duplex has
        // who-knows...
        // need this for being able to remove listeners
        var onDisc = this.onDisc = this.disconnect.bind(this);
        var eh = (event, e) => {
            e.stream.on(event, (err) => {
                log.silly(`Route.event:`, `"${event}" event received:`,
                          `${e.origin.name}`,
                          (err) ? ` Error: ${err}` : '');
                onDisc(e, err);
            });
        };

        eh('end', ref);
        eh('close', ref);
        eh('error', ref);
    }

    // local override to allow experimenting with mississippi.pipe or
    // other pipe implementations
    pipe(from, to){
        if(!from) console.trace('from');
        if(!to)   console.trace('to');

        // default: source remains alive is destination closes/errs
        return from.stream.pipe(to.stream);
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

    // ref.stream contains the new stream
    repipe(ref){
        let s      = this.session;
        let origin = ref.origin;
        let source = this.source;
        let dest   = this.destination;

        log.silly('Route.repipe:', `session ${s.name}:`,
                  `origin: ${origin.name}`);

        // was error on source?
        if(ref === source)
            log.error('Route.disconnect: Internal error:',
                      'onDisconnect called on listener');

        // was error on destination?
        if(ref === this.destination){
            let from = this.chain.ingress.length > 0 ?
                this.chain.ingress[this.chain.ingress.length - 1] :
                source;
            this.pipe(from, ref);
            let to = this.chain.egress.length > 0 ?
                this.chain.egress[0] : source;
            this.pipe(ref, to);

            log.silly('Route.repipe:', `session ${s.name}:`,
                      `destination cluster "${origin.name}" repiped`);

            return;
        }

        // was error on ingress?
        let i = this.chain.ingress.findIndex(r => r === ref);
        if(i >= 0){
            let from = i === 0 ? source : this.chain.ingress[i-1];
            this.pipe(from, ref);
            let to = i === this.chain.ingress.length - 1 ?
                dest : this.chain.ingress[i+1];
            this.pipe(ref, to);

            log.silly('Route.repipe:', `session ${s.name}:`,
                      `ingress chain repiped on cluster "${origin.name}"`);

            return;
        }

        i = this.chain.egress.findIndex(r => r === ref);
        if(i<0)
            log.error('Route.repipe: Internal error:',
                      'Could not find disconnected cluster',
                      `${ref.origin}`);

        let from = i === 0 ? dest : this.chain.egress[i-1];
        this.pipe(from, ref);
        let to = i === this.chain.egress - 1 ?
            source : this.chain.egress[i+1];
        this.pipe(ref, to);

        log.silly('Route.repipe:', `session ${s.name}:`,
                  `egress chain repiped on cluster "${origin.name}"`);

        return;
    }

    // called when one of the streams fail
    async disconnect(ref, error){
        let origin = ref.origin;
        let stream = ref.stream;
        let s = this.session;

        log.silly('Route.disconnect:', `session ${s.name}:`,
                  `origin: ${origin.name}:`,
                  error ? `Error: ${error.message}` :
                  'Reason: unknown');
        this.active_streams--;

        if(s.metadata.status === 'CONNECTED')
            s.emit('disconnect', origin, error);
        if(this.active_streams === 0)
            s.emit('destroy');

        let retry = this.retry;
        switch(retry.retry_on){
        case 'always':
        case 'on-disconnect':
            // handle retry
            ref.retry_num = 0;
            while(1){
                if(this.retry_on_disconnect_num++ ==
                   retry.num_retries){
                    let msg = `session ${s.name}: ` +
                        `could not be re-connected after ` +
                        `${this.retry_on_disconnect_num-1} attempts: ` +
                        `retry={retry_on: ${this.retry.retry_on}, `+
                        `num_retries: ${this.retry.num_retries}, `+
                        `timeout: ${this.retry.timeout}}`;

                    log.info('Route.disconnect:', msg);
                    s.emit('error', new Error(`Reconnect failed: ${msg}`));
                    break;
                }

                try {
                    let e = await this.connect_cluster(ref, 0);
                    // store new stream
                    ref.stream = e.stream;
                    this.active_streams++;
                    this.session.emit('connect');

                    log.info('Route.disconnect:',
                             `session ${s.name}:`,
                             `origin "${origin.name}"`,
                             `successfully reconnected after`,
                             `${this.retry_on_disconnect_num} attempts`);

                    this.repipe(ref);
                    this.set_event_handlers(ref);

                    break;
                } catch(e){
                    log.info('Route.disconnect:',
                             `session ${s.name}:`,
                             `origin "${origin.name}"`,
                             `could not be reconnected: error:`,
                             e.message || dumper(e,1),
                             `retry_on_disconnect_num:`,
                             this.retry_on_disconnect_num,
                             `timeout: ${retry.timeout}:`);

                    // wait
                    await new Promise(r =>
                                      setTimeout(r, retry.timeout));
                }
            }
            break;
        case 'connect-failure': // does not involve re-connect
        case 'never': // never retry, fail immediately
        case undefined:
        default:
            // do not delete the route, deleteSession will do this
            // suppress event for sessions that are already being
            // destroyed
            if(s.metadata.status !== 'FINALIZING'){
                if(error)
                    s.emit('error', error);
                else
                    s.emit('end');
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
