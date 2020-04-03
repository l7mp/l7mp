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
const miss         = require('mississippi');
// const _            = require('underscore');
const eventDebug   = require('event-debug');
const delay        = require('delay');
const pRetry       = require('p-retry');

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
        this.source.status = 'CONNECTED';

        log.silly("Route.pipeline:", `Session: ${s.name}:`,
                  `${this.source.origin.name} ->`,
                  `${this.destination.origin.name}`);

        this.source.last_conn = Date.now();

        //eventDebug(this.source.stream);

        // prepare wait_list
        let wait_list = this.pipeline_init();

        // resolve
        try {
            var resolved_list = await Promise.all(wait_list);
        } catch(error){
            // dump(error, 2);
            throw new Error(`Pipeline initialization failed for `+
                            `session: ${s.name}: `+
                            `could not connect "${error.stage.origin.name}": ` +
                            `retry=${dumper(this.retry, 1)}: last error: `+
                            (error.errno ?
                             `${error.errno}: ${error.address}:${error.port}` :
                             dumper(error, 1)));
        }

        for(let i = 0; i < resolved_list.length; i++)
            if(typeof resolved_list[i] === 'undefined'){
                log.error("Route.pipeline:", `Internal error:`,
                          `Empty stream for cluster`);
            }

        // set streams for each route elem
        let d = resolved_list.pop();
        this.destination.stream = d.stream;
        this.active_streams++;

        resolved_list.forEach( (r) => {
            r.stage.stream = r.stream;
            this.active_streams++;
        });

        this.num_streams = this.active_streams;
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

        // this.pipeline_dump();

        return this;
    }

    pipeline_init(){
        let s = this.session;
        let retry_policy = this.retry;
        let num_retries = retry_policy.retry_on === 'connect-failure' ||
            retry_policy.retry_on === 'always' ? retry_policy.num_retries : 0;

        var wait_list = [];
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (e) => {
                wait_list.push(this.connect_stage(e, num_retries));
            });
        }
        wait_list.push(this.connect_stage(this.destination, num_retries));

        return wait_list;
    }

    pipeline_finish(source, dest, chain, dir){
        var from = source;
        from.status = 'READY';
        chain.forEach( (to) => {
            log.silly("Route.pipeline:", `${dir} pipe:`,
                      `${from.origin.name} ->`,
                      `${to.origin.name}`);
            this.pipe(from, to);
            // may re-apply status setting on source
            from.status = 'READY';
            from = to;
        });
        log.silly("Route.pipeline:", `${dir} pipe:`,
                  `${from.origin.name} ->`, `${dest.origin.name}`);
        this.pipe(from, dest);
        from.status = 'READY';
    }

    pipeline_event_handlers(){
        this.set_stage_event_handlers(this.source);
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (stage) => {
                this.set_stage_event_handlers(stage);
            });
        }
        this.set_stage_event_handlers(this.destination);
    }

    pipeline_dump(){
        this.get_stages()
        this.stage_dump(this.source, 'source/listener');
        for(let dir of ['ingress', 'egress']){
            let i = 0;
            this.chain[dir].forEach( (stage) => {
                this.stage_dump(stage, `${dir}/stage:${i++}`);
            });
        }
        this.stage_dump(this.destination, 'destination/cluster');
    }

    // STAGE: stage = cluster + stream + status
    // STATUS: CONNECTED -> READY -> DISCONNECTED -> RETRYING -> END
    connect_stage(stage, num_retries){
        let s = this.session;
        let cluster = stage.origin;

        return pRetry(async () => {
            if(typeof s === 'undefined'){
                pRetry.AbortError(
                    new Error("Route.connect_stage:", `Session: ${s.name}:`,
                              `cluster "${cluster.name}": Internal error:`,
                              `Session removed while retrying`));
            }

            if(stage.status === 'FINALIZING')
                pRetry.AbortError(
                    new Error("Route.connect_stage:", `Session: ${s.name}:`,
                              `cluster "${cluster.name}":`,
                              `Session in FINALIZE, giving up on retry`));

            switch(stage.status){
            case 'CONNECTED': pRetry.AbortError(
                new Error("Route.connect_stage:", `Session: ${s.name}:`,
                          `cluster "${cluster.name}":`,
                          `Retrying a CONNECTED stage`));
                break;
            case 'END': pRetry.AbortError(
                new Error("Route.connect_stage:", `Session: ${s.name}:`,
                          `cluster "${cluster.name}":`,
                          `Stage ended, not retrying`));
                break;
            default: { /* ingoring */ };
            };
            let stream = await stage.origin.stream(s);

            log.info("Route.connect_stage:", `Session: ${s.name}:`,
                     `cluster "${cluster.name}": connected`);

            stage.last_conn = Date.now();
            stage.status = 'CONNECTED';
            return {stage: stage, stream: stream};
        }, {
            onFailedAttempt: error => {
                log.info("Route.connect_stage:", `Session: ${s.name}:`,
                         `cluster "${cluster.name}"/${stage.status}`,
                         `Attempt ${error.attemptNumber} failed`,
                         `(${error.retriesLeft} retries left):`,
                         (error.errno) ?
                         `${error.errno}: ${error.address}:${error.port}` :
                         dumper(error, 1));

                // DISCONNECTED BUT UNDER RETRY
                stage.status = error.retriesLeft == 0 ?
                    'END' : 'RETRYING';

                // if(log.level === 'silly')
                //     console.trace();

                // will return the problematic endpoint eventually
                error.stage = stage;
            },
            retries: num_retries,
            factor: 1,
            minTimeout: this.retry.timeout,
            randomize: false
        });
    }

    set_stage_event_handlers(stage){
        // Writable has 'close', readable has 'end', duplex has
        // who-knows...
        // need this for being able to remove listeners
        // var onDisc = this.disconnect.bind(this);
        log.silly("Route.set_stage_event_handlers:",
                  "Setting up event handlers for",
                  `stage "${stage.origin.name}"/${stage.status}`);
        stage.on_disc = {};
        var eh = (event) => {
            // to be able to remove the event handler in this.end()
            stage.on_disc[event] = (err) => {
                log.silly(`Route.event:`, `"${event}" event received:`,
                          `${stage.origin.name}`,
                          (err) ? ` Error: ${err}` : '');
                this.disconnect.bind(this)(stage, err);
            };
            stage.stream.on(event, stage.on_disc[event]);
        };

        eh('end', stage);
        eh('close', stage);
        eh('error', stage);
    }

    stage_dump(stage, role){
        log.silly(`Route.stage_dump: ${stage.origin.name}: ${role}: Status: ${stage.status}`);
        let s = stage.stream;
        if(s){
            log.silly(`Route.stage_dump:`,
                      s.writable ? 'writable,' : 'not-writable,',
                      `destroyed:`, s.writableDestroyed ? 'true,':'false,',
                      `writableEnded:`, s.writableEnded ? 'true,':'false,',
                      `writableFinished:`, s.writableFinished ? 'true,':'false,',
                      `writableLength: ${s.writableLength},`,
                      `writableObjectMode:`, s.writableObjectMode ? 'true':'false');
            log.silly(`Route.stage_dump:`,
                      s.readable ? 'readable,' : 'not-readable,',
                      `destroyed:`, s.destroyed ? 'true,':'false,',
                      `readableEnded:`, s.readableEnded ? 'true,':'false,',
                      `isPaused:`, s.isPaused()  ? 'true,':'false,',
                      `readableObjectMode:`, s.readableObjectMode ? 'true':'false'
                     );
        }
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

    // stage.stream contains the new stream
    repipe(stage){
        let s      = this.session;
        let origin = stage.origin;
        let source = this.source;
        let dest   = this.destination;

        log.silly('Route.repipe:', `session ${s.name}:`,
                  `origin: ${origin.name}`);

        // was error on source?
        if(stage === source)
            log.error('Route.disconnect: Internal error:',
                      'onDisconnect called on listener');

        // was error on destination?
        if(stage === this.destination){
            let from = this.chain.ingress.length > 0 ?
                this.chain.ingress[this.chain.ingress.length - 1] :
                source;
            this.pipe(from, stage);
            let to = this.chain.egress.length > 0 ?
                this.chain.egress[0] : source;
            this.pipe(stage, to);
            stage.status = 'READY';

            log.silly('Route.repipe:', `session ${s.name}:`,
                      `destination cluster "${origin.name}" repiped`);
            return;
        }

        // was error on ingress?
        let i = this.chain.ingress.findIndex(r => r === stage);
        if(i >= 0){
            let from = i === 0 ? source : this.chain.ingress[i-1];
            this.pipe(from, stage);
            let to = i === this.chain.ingress.length - 1 ?
                dest : this.chain.ingress[i+1];
            this.pipe(stage, to);
            stage.status = 'READY';

            log.silly('Route.repipe:', `session ${s.name}:`,
                      `ingress chain repiped on cluster "${origin.name}"`);
            return;
        }

        i = this.chain.egress.findIndex(r => r === stage);
        if(i<0)
            log.error('Route.repipe: Internal error:',
                      'Could not find disconnected cluster',
                      `${stage.origin}`);

        let from = i === 0 ? dest : this.chain.egress[i-1];
        this.pipe(from, stage);
        let to = i === this.chain.egress - 1 ?
            source : this.chain.egress[i+1];
        this.pipe(stage, to);
        stage.status = 'READY';

        log.silly('Route.repipe:', `session ${s.name}:`,
                  `egress chain repiped on cluster "${origin.name}"`);

        return;
    }

    // called when one of the streams fail
    async disconnect(stage, error){
        let cluster = stage.origin;
        let stream = stage.stream;
        let s = this.session;

        log.silly('Route.disconnect:', `session ${s.name}:`,
                  `cluster: ${cluster.name}:`,
                  error ? `Error: ${error.message}` :
                  'Reason: unknown');

        // this.stage_dump(stage, stage === this.destination ?
        //                 'destination/cluster' : 'stage');

        if(stage.status !== 'READY'){
            // we received mutliple events for the same stage (e.g.,
            // error followed by a close), ignore all but the first
            log.silly('Route.disconnect:', `session ${s.name}:`,
                      `cluster: ${cluster.name}:`,
                      `Stage status: ${stage.status}: Ignoring`);
            return;
        }

        stage.status = 'DISCONNECTED';
        this.active_streams--;

        if(s.metadata.status === 'CONNECTED')
            s.emit('disconnect', cluster, error);
        if(this.active_streams === 0)
            s.emit('destroy');

        let retry_policy = this.retry;
        switch(retry_policy.retry_on){
        case 'always':
        case 'disconnect':
            if(stage.origin.name === this.source.origin.name){
                let msg = `session ${s.name}: Listener "${stage.origin.name}" ` +
                    `is not retriable, terminating session`;
                log.info('Route.disconnect:', msg);
                s.emit('error', new Error(`Reconnect failed: ${msg}`));
                return;
            }

            if(!stage.origin.retriable){
                let msg = `session ${s.name}: Stage "${stage.origin.name}" ` +
                    `is not retriable, terminating session`;
                log.info('Route.disconnect:', msg);
                s.emit('error', new Error(`Reconnect failed: ${msg}`));
                return;
            }

            // dampen retries: never attempt to reconnect a
            // cluster within timeout msecs of the last
            // successfull connection (handle clusters that
            // reconnect but then immediately drop connection like
            // 'websocat -E...')
            let time_wait = Math.max(retry_policy.timeout -
                                     (Date.now() - stage.last_conn), 0);

            // dump(time_wait,3);
            // dump(retry_policy,3);

            await delay(time_wait);

            try {
                var elem =
                    await this.connect_stage(stage, retry_policy.num_retries);
            } catch(error){
                let msg = `session ${s.name}: could not be re-connected ` +
                    `after ${error.attemptNumber} attempts`;
                log.info('Route.disconnect:', msg);
                stage.status = 'END';
                s.emit('error', new Error(`Reconnect failed: ${msg}`));
                return;
            }

            log.info('Route.disconnect:', `session ${s.name}:`,
                     `cluster "${cluster.name}"`,
                     `successfully reconnected`);

            // store new stream
            stage.stream = elem.stream;
            this.active_streams++;

            if(this.active_streams === this.num_streams)
                this.session.emit('connect');

            this.repipe(stage);
            this.set_stage_event_handlers(stage);
            stage.status = 'READY';
            // this.pipeline_dump();

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

    get_stages(){
        let stages = [this.source];
        stages = stages.concat(this.chain.ingress);
        stages = stages.concat(this.chain.egress);
        stages.push(this.destination);
        return stages;
    }

    // return 1 of route/session can be deleted (i.e., no retry is
    // ongoing), otherwise keep route/session around until all retries
    // have been aborted
    end(error){
        log.silly('Route.end:', `${this.name}`);
        let deleted = 0;
        let ret = 1;

        for(let stage of this.get_stages()){
            // let retry to first terminate
            if(stage.status === 'RETRYING'){
                log.silly('Route.end:', `${this.name}:`,
                          `Cluster: ${stage.origin.name}:`,
                          `Stage retrying, not removing`);
                ret = 0;
                continue;
            }

            // status is CONNECTED, DISCONNECTED, or END
            log.silly('Route.end:', `${this.name}:`,
                      `Stage: "${stage.origin.name}"/${stage.status}:`,
                      `Ending stage`);
            let stream = stage.stream;
            try{
                if(stage.on_disc){
                    // log.info('end:', stream.listenerCount("end"));
                    stream.removeListener("end", stage.on_disc["end"]);
                    // log.info('end:', stream.listenerCount("end"));

                    // log.info('close:', stream.listenerCount("close"));
                    stream.removeListener("close", stage.on_disc["close"]);
                    // log.info('close:', stream.listenerCount("close"));

                    // log.info('error:', stream.listenerCount("error"));
                    stream.removeListener("error", stage.on_disc["error"]);
                    // log.info('error:', stream.listenerCount("error"));
                }
                if(stage.status !== 'END')
                    stream.end();
                deleted++;
            } catch(e){
                log.info('Route.end:', `${this.name}:`,
                         `Could not terminate stage:`,
                         `"${stage.origin.name}"/${stage.status}:`,
                         dumper(e,3));
            }

            stage.status = 'END';
        }

        log.info('Route.end:', `${this.name}:`, `error:`,
                 error || 'NONE', `delete ${deleted} stages`);

        // return OK if no stage is retrying
        return ret;
    }
};
Route.index = 0;

Route.create = (r) => {
    log.info("Route.create:",
             `${r.listener.origin.name} -> ${r.cluster.origin.name}`);
    return new Route(r);
}

module.exports.Route = Route;
