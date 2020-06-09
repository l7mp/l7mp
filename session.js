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
const eventDebug   = require('event-debug')
const util         = require('util');
const miss         = require('mississippi');
const delay        = require('delay');
const pRetry       = require('p-retry');

const StreamCounter = require('./stream-counter.js').StreamCounter;

//------------------------------------
//
// Session
//
//------------------------------------

// - Event: 'init': Emitted when the listener emits a new stream.
//   status: INIT
//   args:

// - Event: 'connect': Emitted after an 'init' session's stream
//   pipeline was successfully established or when it is re-connected
//   after 'disconnect' event.
//   status: INIT/DISCONNECTED -> CONNECTED
//   args: -

// - Event: 'disconnect': Emitted if one of the streams in the
//   session's pipeline is prematurely closed. This state is temporal:
//   the session may still re-connect later as per the retry policy.
//   status: CONNECTED -> DISCONNECTED
//   args: origin, error

// - Event: 'error': Emitted if one or more of the streams that
//   underlie a session fail and we cannot reconnect, under the retry
//   policy.
//   status: CONNECTED/DISCONNECTED -> FINALIZING
//   args: error

// - Event: 'end': Emitted if the session is deleted from the API or
//   ends normally.
//   status: CONNECTED/DISCONNECTED -> FINALIZING
//   args: -

// - Event: 'destroy': Emitted when all streams of the session have
//   closed down successfully
//   status: FINALIZING -> DESTROYED
//   args: -

class Session {
    constructor(s){
        this.metadata                = s.metadata;
        this.name                    = s.metadata.name;  // id
        this.source                  = s.listener;
        this.destination             = undefined;
        this.route                   = undefined;
        this.stats                   = { counter: new StreamCounter() };
        this.priv                    = s.priv;

        this.chain                   = { ingress: [], egress: [] };
        this.type                    = this.source.origin.type;  // init
        this.retry_on_disconnect_num = 0;
        this.active_streams          = 0;

        this.init();
    }

    toJSON(){
        log.silly('Session.toJSON:', `"${this.name}"`);
        return {
            metadata: this.metadata,
            listener: this.listener,
            route:    this.route || {},
        };
    }

    init(){
        log.silly(`Session.init: "${this.name}"`);
        this.metadata.status = 'INIT';
        this.emit('init');
    }

    // warning: session does not hold hard references to listeners,
    // rules/rulelists, routes and clusters, because these may be
    // deleted from the API any time
    create(){
        log.silly('Session.create:', `${this.name}`,
                  `listener: ${this.source.origin}:`);

        this.source.status = 'READY';
        this.source.last_conn = Date.now();

        // this may fail: no promise
        // late-bind listener
        let source = l7mp.getListener(this.source.origin);
        this.assert(source, `Cannot find listener ${this.source.origin}`);

        let action = this.lookup(source.rules);
        this.assert(action, `No route for session "${this.name}"`);

        // apply metadata rewrite rules
        if(action.rewrite){
            action.rewrite.forEach( (r) => {
                log.silly('Session.create', `Applying metadata rewrite rule:`,
                          dumper(r, 3));
                Rule.setAtPath(this.metadata, r.path, r.value)
            });
        }

        this.assert(action.route, `Invalid route for session "${this.name}"`)
        this.route = action.route;
        this.checkRoute();

        this.pipeline();
    }

    assert(condition, error){
        if(!condition){
            log.silly('Session.assert: failed');
            this.error(error)
        }
    }

    connect(e){
        this.metadata.status = 'CONNECTED';
        this.emit('connect');
    }

    error(e){
        let err = new Error(`Session.error: "${this.name}": ${e}`);
        log.silly(err.message);
        this.metadata.status = 'FINALIZING';
        this.emit('error', err);
        this.destroy();
        throw(err);
    }

    end(msg){
        log.silly(`Session.end: "${this.name}"`+
                  (msg ? `: msg: ${dumper(msg,3)}` : ''));
        this.metadata.status = 'FINALIZING';
        this.emit('end', msg);
        this.destroy();
    }

    lookup(rulelist){
        log.silly('Session.lookup:', `Session: ${this.name}`,
                  `on RuleList "${rulelist}"`);

        // late-bind rulelist
        let rl = l7mp.getRuleList(rulelist);
        this.assert(rl, `Cannot find RuleList "${rulelist}"`);
        rulelist = rl;

        // late-bind rules
        let action;
        for(let i = 0; i < rulelist.rules.length; i++){
            // this is a rule name, substitute ref to Rule
            let rule = rulelist.rules[i];
            let ru = l7mp.getRule(rule);
            this.assert(ru, `Cannot find named rule "${rule}" ` +
                        `in RuleList "${rulelist.name}"`);

            action = ru.apply(this)
            if(action){
                if(action.apply && typeof action.apply === 'string'){
                    log.silly('Session.lookup:', `Session: ${this.name}:`,
                              `Deferring lookup to RuleList "${action.apply}"`);
                    return this.lookup(action.apply);
                }

                return action;
            }
        }
    }

    checkRoute(r, to, s){
        // incompatible: datagram to session: warn
        // if(r.type === 'datagram-stream' && to.type !== 'datagram-stream'){
        //     log.warn('L7mp.addRoute:', `Session "${s.name}":`,
        //              `Stream down-conversion: datagram-stream`,
        //              `routed to a "${to.type}"-type stream "${to.name}":`,
        //              'Can no longer enforce datagam boundaries');
        //     r.type = 'byte-stream';
        // }
    }

    async pipeline(){
        log.silly("Session.pipeline:", `Session: ${this.name}: Route: ${this.route}`);

        //eventDebug(this.source.stream);

        // prepare wait_list
        // this may fail: no promise
        try {
            var wait_list = this.pipeline_init();
        } catch(e){
            if(log.level === 'silly')
                dump(e);
            log.silly('Session.pipeline: Could not init pipeline for Session',
                      this.name);
            return;
        }

        // resolve
        try {
            var resolved_list = await Promise.all(wait_list);
        } catch(error){
            if(error.stage){
                // normal error
                throw new Error(`Pipeline setup failed for `+
                                `session "${this.name}": `+
                                `could not connect "${error.stage.origin}": ` +
                                `retry=${dumper(this.retry, 1)}: last error: `+
                                (error.errno ?
                                 `${error.errno}: ${error.address}:${error.port}` :
                                 dumper(error, 1)));
            } else {
                if(log.level === 'silly')
                    dump(error);
                log.error("Session.pipeline:", `Internal error:`, error.message);
            }
        }

        for(let i = 0; i < resolved_list.length; i++)
            if(typeof resolved_list[i] === 'undefined'){
                log.error("Session.pipeline:", `Internal error:`,
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
        log.verbose("Session.pipeline:",
                    `${this.active_streams} stream(s) initiated`);

        // pipe: ingress dir
        this.pipeline_finish(this.source, this.destination,
                             this.chain.ingress, 'ingress');

        // pipe: egress dir
        this.pipeline_finish(this.destination, this.source,
                             this.chain.egress, 'egress');

        // set up error handlers
        this.pipeline_event_handlers();

        this.connect();
        // this.pipeline_dump();

        return this;
    }

    pipeline_init(){
        log.silly("Session.pipeline_init:", `${this.name}:`);

        let route = l7mp.getRoute(this.route);
        this.assert(route, `Cannot find Route "${route}"`);

        log.verbose("Session.pipeline:", `${this.name}:`,
                    `${this.source.origin} ->`,
                    `${route.destination}`);

        this.retry = {...route.retry};
        let num_retries = this.retry.retry_on === 'connect-failure' ||
            this.retry.retry_on === 'always' ? this.retry.num_retries : 0;

        var wait_list = [];
        this.chain.ingress = [];
        this.chain.egress = [];

        for(let dir of ['ingress', 'egress']){
            if(!(route[dir] instanceof Array)) continue;
            for(let cluster of route[dir]){
                let c = l7mp.getCluster(cluster);
                this.assert(c, `Cannot find transform cluster "${cluster} in`,
                            `Route "${this.route}"`);

                this.chain[dir].push({ origin: cluster, status: 'INIT' });
                wait_list.push(this.connect_stage(c, num_retries));
            }
        }

        this.destination = { origin: route.destination, status: 'INIT' };
        let d = l7mp.getCluster(route.destination);
        this.assert(d, `Cannot find destination cluster "${route.destination} in`,
                    `Route "${this.route}"`);
        wait_list.push(this.connect_stage(this.destination, num_retries));

        return wait_list;
    }

    pipeline_finish(source, dest, chain, dir){
        var from = source;
        from.status = 'READY';
        chain.forEach( (to) => {
            log.silly("Session.pipeline:", `${dir} pipe:`,
                      `${from.origin} -> ${to.origin.name}`);
            this.pipe(from, to);
            from.status = 'READY';
            from = to;
        });
        log.silly("Session.pipeline:", `${dir} pipe:`,
                  `${from.origin} ->`, `${dest.origin}`);
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

        return pRetry(async () => {
            // if(typeof s === 'undefined')
            //     throw new pRetry.AbortError(
            //         "Session.connect_stage:", `Session: ${this.name}:`,
            //         `stage "${stage.origin}": Internal error:`,
            //         `Session removed while retrying`);

            if(stage.status === 'FINALIZING')
                throw new pRetry.AbortError(
                    "Session.connect_stage:", `Session: ${this.name}:`,
                    `stage "${stage.origin}":`,
                    `Session in FINALIZE, giving up on retry`);

            switch(stage.status){
            case 'CONNECTED': throw new pRetry.AbortError(
                "Session.connect_stage:", `Sessiaon: ${this.name}:`,
                `stage "${stage.origin}":`,
                `Retrying a CONNECTED stage`);
                break;
            case 'END': throw new pRetry.AbortError(
                "Session.connect_stage:", `Session: ${this.name}:`,
                `stage "${stage.origin}":`,
                `Stage ended, not retrying`);
                break;
            default: { /* ingoring */ };
            };

            let cluster = l7mp.getCluster(stage.origin);
            if(!cluster)
                throw new pRetry.AbortError(
                    'Session.connect_stage: Cannot find cluster ' +
                        `"${stage.origin}"`);

            let stream = await cluster.stream(this);

            log.info("Session.connect_stage:", `Session: ${this.name}:`,
                     `stage "${stage.origin}": connected`);

            stage.last_conn = Date.now();
            stage.status = 'CONNECTED';
            return {stage: stage, stream: stream};
        }, {
            onFailedAttempt: error => {
                log.info("Session.connect_stage:", `Session: ${this.name}:`,
                         `stage "${stage.origin}"/${stage.status}`,
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
        log.silly("Session.set_stage_event_handlers:",
                  "Setting up event handlers for",
                  `stage "${stage.origin.name}"/${stage.status}`);
        stage.on_disc = {};
        var eh = (event) => {
            // to be able to remove the event handler in this.end()
            stage.on_disc[event] = (err) => {
                log.silly(`Session.event:`, `"${event}" event received:`,
                          `${stage.origin.name}`,
                          (err) ? ` Error: ${err}` : '');
                this.disconnect.bind(this)(stage, err);
            };
            stage.stream.on(event, stage.on_disc[event]);
        };

        // eh('end', stage);
        eh('close', stage);
        eh('error', stage);
    }

    stage_dump(stage, role){
        log.silly(`Session.stage_dump: ${stage.origin}: ${role}: Status: ${stage.status}`);
        let s = stage.stream;
        if(s){
            log.silly(`Session.stage_dump:`,
                      s.writable ? 'writable,' : 'not-writable,',
                      `destroyed:`, s.writableDestroyed ? 'true,':'false,',
                      `writableEnded:`, s.writableEnded ? 'true,':'false,',
                      `writableFinished:`, s.writableFinished ? 'true,':'false,',
                      `writableLength: ${s.writableLength},`,
                      `writableObjectMode:`, s.writableObjectMode ? 'true':'false');
            log.silly(`Session.stage_dump:`,
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
        //     log.silly("Session.pipe.Error event: ", `${error}`);
        //     this.emit('error', error, from, to);
        // });
    }

    // stage.stream contains the new stream
    repipe(stage){
        log.silly('Session.repipe:', `Session ${this.name}:`,
                  `stream: ${stage.origin}`);

        // was error on source?
        if(stage === source)
            log.error('Session.disconnect: Internal error:',
                      'onDisconnect called on listener');

        // was error on destination?
        if(stage === this.destination){
            let from = this.chain.ingress.length > 0 ?
                this.chain.ingress[this.chain.ingress.length - 1] :
                this.source;
            this.pipe(from, stage);
            let to = this.chain.egress.length > 0 ?
                this.chain.egress[0] : this.source;
            this.pipe(stage, to);
            stage.status = 'READY';

            log.silly('Session.repipe:', `Session ${this.name}:`,
                      `destination stage "${stage.origin}" repiped`);
            return;
        }

        // was error on ingress?
        let i = this.chain.ingress.findIndex(r => r === stage);
        if(i >= 0){
            let from = i === 0 ? this.source : this.chain.ingress[i-1];
            this.pipe(from, stage);
            let to = i === this.chain.ingress.length - 1 ?
                this.destination : this.chain.ingress[i+1];
            this.pipe(stage, to);
            stage.status = 'READY';

            log.silly('Session.repipe:', `Session ${this.name}:`,
                      `ingress chain repiped on cluster "${stage.origin}"`);
            return;
        }

        i = this.chain.egress.findIndex(r => r === stage);
        if(i<0)
            log.error('Session.repipe: Internal error:',
                      'Could not find disconnected stage',
                      `${stage.origin}`);

        let from = i === 0 ? this.destination : this.chain.egress[i-1];
        this.pipe(from, stage);
        let to = i === this.chain.egress - 1 ?
            this.source : this.chain.egress[i+1];
        this.pipe(stage, to);
        stage.status = 'READY';

        log.silly('Session.repipe:', `Session ${this.name}:`,
                  `egress chain repiped on cluster "${stage.origin}"`);

        return;
    }

    // called when one of the streams fail
    async disconnect(stage, error){
        let stream = stage.stream;

        log.silly('Session.disconnect:', `Session ${this.name}:`,
                  `stage: ${stage.origin}:`,
                  error ? `Error: ${error.message}` :
                  'Reason: unknown');

        // this.stage_dump(stage, stage === this.destination ?
        //                 'destination/cluster' : 'stage');

        if(stage.status !== 'READY'){
            // we have received mutliple events for the same stage
            // (e.g., error followed by a close), ignore all but the
            // first
            log.silly('Session.disconnect:', `Session ${this.name}:`,
                      `stage: ${stage.origin}:`,
                      `Stage status: ${stage.status}: Ignoring`);
            return;
        }

        stage.status = 'DISCONNECTED';
        this.active_streams--;

        if(this.metadata.status === 'CONNECTED')
            this.emit('disconnect', stage.origin, error);
        if(this.active_streams === 0)
            this.destroy();

        switch(this.retry.retry_on){
        case 'always':
        case 'disconnect':

            // this may fail: no promise
            try {
                if(stage.origin === this.source.origin){
                    let msg = `Session ${this.name}: Source "${stage.origin}" ` +
                        `is not retriable, terminating session`;
                    log.info('Session.disconnect:', msg);
                    this.error(`Reconnect failed: ${msg}`);
                }

                let cluster = l7mp.getCluster(stage.origin);
                this.assert(cluster, 'Session.disconnect: Cannot find cluster ' +
                            `"${stage.origin}"`);

                if(!cluster.retriable){
                    let msg = `Session ${this.name}: Stage "${stage.origin}" ` +
                        `is not retriable, terminating session`;
                    this.error(`Reconnect failed: ${msg}`);
                }
            } catch(e){
                log.silly('Session.disconnect: Could not initiate reconnect',
                          `for reconnect session "${this.name}"`, e.message);
                return;
            }

            // this may fail: promise
            try {
                let new_stage = await this.reconnect(stage);

                log.info('Session.disconnect:', `Session ${this.name}:`,
                         `stage "${stage.origin}"`,
                         `successfully reconnected`);

                // store new stream
                stage.stream = new_stage.stream;
                this.active_streams++;
                this.repipe(stage);
                this.set_stage_event_handlers(stage);
                stage.status = 'READY';

                // this.pipeline_dump();

                if(this.active_streams === this.num_streams)
                    this.connected();
            } catch(e){
                log.silly('Session.disconnect:',
                          `Could not reconnect session "${this.name}"`,
                          e.message);
                return;
            }

            break;
        case 'connect-failure': // does not involve re-connect
        case 'never': // never retry, fail immediately
        default:
            log.error('Session.disconnect: Internal error:',
                      `Unknown retry policy in Session "${this.name}"`);
        }
    }

    async reconnect(stage){
        // dampen retries: never attempt to reconnect a cluster within
        // timeout msecs of the last successfull connection (handle
        // clusters that reconnect but then immediately drop
        // connection like 'websocat -E...')
        let time_wait = Math.max(retry_policy.timeout -
                                 (Date.now() - stage.last_conn), 0);

        // dump(time_wait,3);
        // dump(retry_policy,3);

        await delay(time_wait);

        let num_retries = this.retry.retry_on === 'disconnect' ||
            this.retry.retry_on === 'always' ? this.retry.num_retries : 0;

        return this.connect_stage(stage, num_retries);
    }

    get_stages(){
        let stages = [this.source];
        if(this.chain.ingress)
            stages = stages.concat(this.chain.ingress);
        if(this.chain.egress)
            stages = stages.concat(this.chain.egress);
        if(this.destination)
            stages.push(this.destination);
        return stages;
    }

    // return 1 of route/session can be deleted (i.e., no retry is
    // ongoing), otherwise keep route/session around until all retries
    // have been aborted
    destroy(){
        log.silly('Session.destroy:', `${this.name}`);
        let deleted = 0;
        let ret = 1;

        for(let stage of this.get_stages()){

            // dump(stage, 1);

            if(stage.status === 'RETRYING'){
                log.silly('Session.end:', `${this.name}:`,
                          `stage: ${stage.origin}:`,
                          `Stage retrying, not removing`);
                ret = 0;
                continue;
            }

            // status is CONNECTED, DISCONNECTED, or END
            log.silly('Session.destroy:', `${this.name}:`,
                      `Stage: "${stage.origin}"/${stage.status}:`,
                      `Ending stage`);
            let stream = stage.stream;
            try{
                if(stage.on_disc){
                    // // log.info('end:', stream.listenerCount("end"));
                    // stream.removeListener("end", stage.on_disc["end"]);
                    // // log.info('end:', stream.listenerCount("end"));

                    // log.info('close:', stream.listenerCount("close"));
                    stream.removeListener("close", stage.on_disc["close"]);
                    // log.info('close:', stream.listenerCount("close"));

                    // log.info('error:', stream.listenerCount("error"));
                    stream.removeListener("error", stage.on_disc["error"]);
                    // log.info('error:', stream.listenerCount("error"));
                }
                if(stage.status !== 'END'){
                    stream.end();
                    stream.destroy();
                    deleted++;
                }
            } catch(e){
                log.info('Session.destroy:', `${this.name}:`,
                         `Could not terminate stage:`,
                         `"${stage.origin}"/${stage.status}:`,
                         dumper(e,3));
            }

            stage.status = 'END';
        }

        log.verbose('Session.destroy:', `${this.name}:`,
                    `deleted ${deleted} streams`);

        this.metadata.status = 'DESTROYED';
        this.emit('destroy');

        // return OK if no stage is retrying
        return ret;
    }

    };
util.inherits(Session, EventEmitter);

module.exports.Session = Session;
