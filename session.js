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
const pTimeout     = require('p-timeout');
const _            = require('lodash');

const StreamCounter = require('./stream-counter.js').StreamCounter;
const Rule          = require('./rule.js').Rule;
const {L7mpError, Ok, InternalError, BadRequestError, NotFoundError, GeneralError} = require('./error.js');


//------------------------------------
//
// Stage: elements in a chain, can be listener or cluster
//
//------------------------------------
class Stage {
    constructor(st){
        this.id       = Stage.index++;
        this.session  = st.session;
        this.origin   = st.origin;  // name of cluster/listener
        this.stream   = st.stream;  // stream
        this.endpoint = undefined;  // if cluster, name of endpoint
        this.status   = 'INIT';
        this.source   = typeof st.source !== 'undefined' ? st.source : false; // special-case source
        this.last_conn = null;
        this.retriable = !this.source;
    }

    toJSON(){
        log.silly('Stage.toJSON:', `"${this.session.name}::${this.origin}`);
        if(this.source){
            let l = l7mp.getListener(this.origin);
            return {
                origin:   this.origin,
                listener: l ? l.spec : '<INVALID>', // listener might have gone away
                status:   this.status,
            };
        } else {
            return {
                origin:   this.origin,
                endpoint: { name: this.endpoint.name, spec: this.endpoint.spec } || '<INVALID>',
                status:   this.status,
            };
        }
    }

    // STAGE: stage = cluster + stream + status
    // STATUS: CONNECTED -> READY -> DISCONNECTED -> RETRYING -> END
    // returns a promise!
    connect(num_retries, timeout){
        const fail = (err, a) => {
            err.stage = this;
            // log.silly(dumper(err, 6));
            log.silly(`Stage.connect.fail: Session "${this.session.name}":`,
                      `stage "${this.origin}" at attempt ${a}: ${err.content}`);
            throw new pRetry.AbortError(err);
        };

        let run = (attempt) => {
            log.silly("Session.connect:", `Session: ${this.session.name}:`,
                      `stage "${this.origin}" at attempt ${attempt}, timeout: ${timeout}`);

            // do not retry a session that has been deleted from the API
            let s = l7mp.getSession(this.session.name);
            if(typeof s === 'undefined')
                fail(new InternalError('Internal error: Session removed while retrying'),
                                       attempt);

            switch(this.status){
            case 'CONNECTED':
                fail(new InternalError('Retrying a CONNECTED stage'), attempt);
                break;
            case 'FINALIZING':
                fail(new Ok('Session status FINALIZING, giving up on retry'), attempt);
                break;
            case 'END':
                fail(new Ok('Session status END, not retrying'), attempt);
                break;
            default: { /* ingoring */ };
            };

            let cluster = l7mp.getCluster(this.origin);
            if(!cluster)
                throw new NotFoundError(`Cannot find cluster "${this.origin}"`);
                // fail(new NotFoundError(`Cannot find cluster "${this.origin}"`), attempt);
            this.retriable = cluster.retriable;

            return cluster.stream(this.session).
                then((ret) => {
                    log.verbose("Stage.connect:", `Session: ${this.session.name}:`,
                                `stage "${this.origin}" connected to endoint`,
                                ret.endpoint.name);
                    this.stream = ret.stream;
                    this.endpoint = ret.endpoint;
                    this.last_conn = Date.now();
                    this.status = 'CONNECTED';
                    return this;
                });
        };

        return pRetry(run, {
            onFailedAttempt: error => {
                log.silly("Stage.connect:", `Session: ${this.session.name}:`,
                          `stage "${this.origin}"/${this.status}`,
                          `Attempt ${error.attemptNumber} failed`,
                          `(${error.retriesLeft} retries left, timeout: ${timeout}):`,
                          error.message,
                          (error.content ? `: ${error.content}` : ''));

                // dump(error,10);

                this.status = error.retriesLeft == 0 ?
                    'END' : 'RETRYING';

                // will return the problematic endpoint eventually
                error.stage = this;
            },
            retries: num_retries,
            factor: 1,
            minTimeout: timeout,
            // maxTimeout: timeout,
            // maxRetryTime: timeout,
            randomize: false
        });
    }

    set_event_handlers(){
        // Writable has 'close', readable has 'end', duplex has
        // who-knows...
        // need this for being able to remove listeners
        // var onDisc = this.disconnect.bind(this);
        log.silly("Stage.set_event_handlers: Setting up event handlers for",
                  `stage "${this.origin}"/${this.status}`);
        this.on_disc = {};
        var eh = (event) => {
            this.on_disc[event] = (err) => {
                log.silly(`Stage.event:`, `"${event}" event received:`,
                          `${this.origin}`,
                          (err) ? ` Error: ${err}` : '');
                this.session.disconnect(this, err);
            };
            this.stream.on(event, this.on_disc[event]);
        };

        // eh('end', stage);
        eh('close', this);
        eh('error', this);
    }

    dump(role){
        log.silly(`Stage.dump: ${this.origin}: ${role}: Status: ${this.status}`);
        let s = this.stream;
        if(s){
            log.silly(`Stage.dump:`,
                      s.writable ? 'writable,' : 'not-writable,',
                      `destroyed:`, s.writableDestroyed ? 'true,':'false,',
                      `writableEnded:`, s.writableEnded ? 'true,':'false,',
                      `writableFinished:`, s.writableFinished ? 'true,':'false,',
                      `writableLength: ${s.writableLength},`,
                      `writableObjectMode:`, s.writableObjectMode ? 'true':'false');
            log.silly(`Stage.dump:`,
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
    pipe(to){
        let from = this;
        if(!from) log.warn('Stage.pipe: "from stage" mssing');
        if(!to)   log.warn('Stage.pipe: "from to" mssing');

        // default: source remains alive is destination closes/errs
        return from.stream.pipe(to.stream);
        // this will kill the source if the destination fails
        // miss.pipe(from, to, (error) => {
        //     error = error || '';
        //     log.silly("Session.pipe.Error event: ", `${error}`);
        //     this.emit('error', error, from, to);
        // });
    }

    async reconnect(retry){
        log.silly('Stage.reconnect:', `Session ${this.session.name}:`,
                  `reconnecting on stage "${this.origin}"`);

        // // dampen retries: never attempt to reconnect a cluster within
        // // timeout msecs of the last successfull connection (handle
        // // clusters that reconnect but then immediately drop
        // // connection like 'websocat -E...')
        // let time_wait = Math.max(retry.timeout -
        //                          (Date.now() - this.last_conn), 0);

        // // dump(time_wait,3);
        // // dump(retry_policy,3);

        // await delay(time_wait);

        let num_retries = retry.retry_on === 'disconnect' ||
            retry.retry_on === 'always' ? retry.num_retries : 0;

        if(this.source){
            // if stage is listener and it supports reconnect (UDP/singleton), try that
            // theretically, this should always succeed
            let source = l7mp.getListener(this.origin);
            if(!source)
                return Promise.reject(
                    new NotFoundError(`Cannot find listener ${this.origin}`));
            if(!source.reconnect)
                return Promise.reject(
                    new GeneralError(`Source/listener "${this.origin}/ID:${this.id}" ` +
                                     `does not support reconnecting, giving up retries`));

            this.stream = await source.reconnect();
            this.set_event_handlers();            
        } else {
            // cluster: connect as usual
            let new_stage = await this.connect(num_retries > 0 ? num_retries-1 : 0, retry.timeout);

            // store new stream
            this.stream = new_stage.stream;
            this.endpoint = new_stage.endpoint;
            this.set_event_handlers();
        }
        
        this.status = 'READY';
        return;
    }
}
// unique ID
Stage.index = 0;

//------------------------------------
//
// Session
//
//------------------------------------

// - Event: 'init': Emitted when the listener emits a new stream.
//   status: INIT
//   args:

// - Event: 'connect': Emitted after an 'init' session's stream pipeline was successfully
//   established or when it is re-connected after 'disconnect' event.
//   status: INIT/DISCONNECTED -> CONNECTED
//   args: -

// - Event: 'disconnect': Emitted if one of the streams in the session's pipeline is prematurely
//   closed. This state is temporal: the session may still re-connect later as per the retry
//   policy.
//   status: CONNECTED -> DISCONNECTED
//   args: origin, error

// - Event: 'error': Emitted if one or more of the streams that underlie a session fail and we
//   cannot reconnect, under the retry policy.
//   status: CONNECTED/DISCONNECTED -> FINALIZING
//   args: error

// - Event: 'end': Emitted if the session is deleted from the API or ends normally.
//   status: CONNECTED/DISCONNECTED -> FINALIZING
//   args: -

// - Event: 'destroy': Emitted when all streams of the session have closed down successfully
//   status: FINALIZING -> DESTROYED
//   args: -

class Session {
    constructor(s){
        this.metadata                = s.metadata;
        this.name                    = s.metadata.name;  // id
        this.source                  = s.source;
        this.destination             = undefined;
        this.route                   = undefined;
        this.stats                   = { counter: new StreamCounter() };
        this.priv                    = s.priv;

        this.chain                   = { ingress: [], egress: [] };
        this.type                    = this.source.origin.type;  // init
        this.retry_on_disconnect_num = 0;
        this.active_streams          = 0;   // except listener
        this.track                   = 0;
        this.events                  = [];  // an event log for tracked sessions

        this.init();
    }

    toJSON(){
        log.silly('Session.toJSON:', `"${this.name}"`);
        // remove name from metadata to not dump it twice
        const {name, ...m} = this.metadata;
        return {
            name:        this.name,
            metadata:    m,
            source:      this.source.toJSON(),
            destination: this.detination && this.destination.status ?
                this.destination.toJSON() : { status: 'PENDING'},
            ingress:     this.chain.ingress.map(x => { x && x.status ? x.toJSON() : { status: 'PENDING'}}),
            egress:      this.chain.egress.map(x =>  { x && x.status ? x.toJSON() : { status: 'PENDING'}}),
            status:      this.status,
            events:      this.events,
        };
    }

    init(){
        log.silly(`Session.init: "${this.name}"`);
        this.status = 'INIT';
        this.emit('init');
        this.events.push({ event: 'INIT',
                           timestamp: new Date().toISOString(),
                           message: `Session ${this.name} initialized`,
                           content: ''
                         });
    }

    // warning: session does not hold hard references to listeners,
    // rules/rulelists, routes and clusters, because these may be
    // deleted from the API any time
    create(){
        log.silly('Session.create:', `${this.name}`,
                  `source: ${this.source.origin}:`);

        this.source = new Stage({session: this,
                                 origin: this.source.origin,
                                 stream: this.source.stream,
                                 source: true
                                });
        this.source.status = 'READY';
        this.source.last_conn = Date.now();

        // this may fail: no promise
        // late-bind listener
        let source = l7mp.getListener(this.source.origin);
        this.assert(source, new NotFoundError(`Cannot find listener ${this.source.origin}`));
        this.track = source.options.track;
        this.source.retriable = typeof source.reconnect !== 'undefined';

        let action = this.lookup(source.rules);
        this.assert(action, new NotFoundError(`No route for session "${this.name}"`));

        // apply metadata rewrite rules
        if(action.rewrite){
            action.rewrite.forEach( (r) => {
                log.silly('Session.create', `Applying metadata rewrite rule:`,
                          dumper(r, 3));
                this.metadata = Rule.setAtPath(this.metadata, r.path, r.value);
            });
        }

        this.assert(action.route, new NotFoundError(`Invalid route for session "${this.name}"`));

        let route = l7mp.getRoute(action.route);
        this.assert(route, new NotFoundError(`Cannot find Route "${action.route}" `+
                                             `for session "${this.name}"`));
        // we keep this route inline even if Route is deleted from API
        this.route = _.cloneDeep(route);
        this.checkRoute();
    }

    async router(){
        try {
            this.create();
            var status = await this.pipeline();
        } catch(err){
            log.silly(`Session.router: Error:`, dumper(err, 6));
            let msg = `Could not route session "${this.name}": ` + (err.content || "");
            log.info(`Session.router:`, msg);
            this.error(err);
            this.events.push({ event: 'ERROR',
                               timestamp: new Date().toISOString(),
                               message: msg,
                               content: err,
                             });
            return err;
        }

        return status;
    }

    assert(condition, err){
        if(!condition){
            log.silly('Session.assert: failed: error:', err.message);
            throw err;
        }
    }

    // helpers
    lookup(rulelist){
        log.silly('Session.lookup:', `Session: ${this.name}`,
                  `on RuleList "${rulelist}"`);

        // late-bind rulelist
        let rl = l7mp.getRuleList(rulelist);
        this.assert(rl, new NotFoundError(`Cannot find RuleList "${rulelist}"`));
        rulelist = rl;

        // late-bind rules
        let action;
        for(let i = 0; i < rulelist.rules.length; i++){
            // this is a rule name, substitute ref to Rule
            let rule = rulelist.rules[i];
            let ru = l7mp.getRule(rule);
            this.assert(ru, new NotFoundError(`Cannot find named rule "${rule}" ` +
                                              `in RuleList "${rulelist.name}"`));

            action = ru.apply(this)
            if(action){
                if(action.apply && typeof action.apply === 'string'){
                    log.silly('Session.lookup:', `Session: ${this.name}:`,
                              `Deferring lookup to RuleList "${action.apply}"`);
                    return this.lookup(action.apply);
                }
                this.events.push({ event: 'LOOKUP SUCCESS',
                                   timestamp: new Date().toISOString(),
                                   message: `Successfull lookup on rulelist:${rulelist.name}/`+
                                   `rule:${ru.name}`,
                                   content: '',
                             });
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
        return true;
    }

    async pipeline(){
        log.silly("Session.pipeline:", `Session: ${this.name}`);

        //eventDebug(this.source.stream);

        // prepare wait_list: cannot fail
        let wait_list = this.pipeline_init();

        // resolve
        try {
            var resolved_list = await Promise.all(wait_list);
        } catch(error){
            log.silly(error);
            let err = `Pipeline setup failed for session "${this.name}": ${error.message}: ` +
                (error.content || "");
            // log.verbose(err);

            this.events.push({ event: 'ERROR',
                               timestamp: new Date().toISOString(),
                               message: err,
                               content: error,
                             });

            return Promise.reject(new NotFoundError(err));
        }

        for(let i = 0; i < resolved_list.length; i++)
            if(typeof resolved_list[i] === 'undefined'){
                log.error("Session.pipeline:", `Internal error:`,
                          `Empty stream for cluster`);
            }

        this.num_streams = this.active_streams = resolved_list.length;
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

        this.connected();
        // this.pipeline_dump();

        return this;
    }

    pipeline_init(){
        log.silly("Session.pipeline_init:", `${this.name}:`,
                  `${this.source.origin} -> ${this.route.destination}`);

        let retry = this.route.retry;
        let num_retries = retry.retry_on === 'connect-failure' ||
            retry.retry_on === 'always' ? retry.num_retries : 0;

        var wait_list = [];
        this.chain.ingress = [];
        this.chain.egress = [];

        for(let dir of ['ingress', 'egress']){
            if(!(this.route[dir] instanceof Array)) continue;
            for(let cluster of this.route[dir]){
                let stage = new Stage({origin: cluster, session: this});
                this.chain[dir].push(stage);
                wait_list.push(stage.connect(num_retries, retry.timeout));
            }
        }

        this.destination = new Stage({origin: this.route.destination, session: this });
        wait_list.push(this.destination.connect(num_retries, retry.timeout));

        return wait_list;
    }

    pipeline_finish(source, dest, chain, dir){
        var from = source;
        from.status = 'READY';
        chain.forEach( (to) => {
            log.silly("Session.pipeline:", `${dir} pipe:`,
                      `${from.origin} -> ${to.origin}`);
            from.pipe(to);
            from.status = 'READY';
            from = to;
        });
        log.silly("Session.pipeline:", `${dir} pipe:`,
                  `${from.origin} ->`, `${dest.origin}`);
        from.pipe(dest);
        from.status = 'READY';
    }

    pipeline_event_handlers(){
        this.source.set_event_handlers();
        for(let dir of ['ingress', 'egress']){
            this.chain[dir].forEach( (stage) => {
                stage.set_event_handlers();
            });
        }
        this.destination.set_event_handlers();
    }

    pipeline_dump(){
        this.get_stages()
        this.source.dump('source/listener');
        for(let dir of ['ingress', 'egress']){
            let i = 0;
            this.chain[dir].forEach( (stage) => {
                stage.dump(`${dir}/stage:${i++}`);
            });
        }
        this.destination.dump('destination/cluster');
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

    // called when one of the streams fail
    async disconnect(stage, error){
        let stream = stage.stream;

        log.verbose('Session.disconnect:', `Session ${this.name}:`,
                    `stage: ${stage.origin}:`,
                    (error ? `Error: ${error.message}` : 'Reason: unknown'));

        this.events.push({ event: 'DISCONNECT',
                           timestamp: new Date().toISOString(),
                           message: `Session.disconnect: Stage: ${stage.origin}: `+
                           (error ? `Error: ${error.message}` : 'Reason: unknown'),
                           content: error,
                         });

        if(stage.status !== 'READY'){
            // we have received mutliple events for the same stage (e.g., error followed by a
            // close), ignore all but the first
            log.silly('Session.disconnect:', `Session ${this.name}:`,
                      `stage: ${stage.origin}:`,
                      `Stage status: ${stage.status}: Ignoring`);
            return;
        }

        stage.status = 'DISCONNECTED';
        this.active_streams--;

        if(this.status === 'CONNECTED')
            this.emit('disconnect', stage.origin, error);

        // since we may reconnect the stream, make sure that the old stream is properly closed,
        // otherwise the stream may remain alive, e.g., after a 'connection refused' for a
        // connected UDP stream
        if(stream){
            stream.removeListener("close", stage.on_disc["close"]);
            stream.removeListener("error", stage.on_disc["error"]);
            stream.destroy();
        }

        let retry = this.route.retry;
        switch(retry.retry_on){
        case 'always':
        case 'disconnect':
            try {
                this.assert(stage.retriable,
                            new GeneralError(`Session ${this.name}: `+
                                             `Stage "${stage.origin}/ID:${stage.id}" `+
                                             `is not retriable`));

                await stage.reconnect(this.route.retry);

                log.info('Session.disconnect:', `Session ${this.name}:`,
                         `stage "${stage.origin}" successfully reconnected`);

                // this.pipeline_dump();

                this.active_streams++;
                this.repipe(stage);
                if(this.active_streams === this.num_streams)
                    this.connected();
            } catch(err){
                log.info('Session.disconnect:', `Could not reconnect session "${this.name}":`,
                         `${err.message}` + (err.content ? `: ${err.content}`: ""));
                this.error(err);
            }

            break;
        case 'connect-failure': // does not involve re-connect
        case 'never': // never retry, fail immediately
            log.info('Session.disconnect:', `Session ${this.name}:`,
                     `stage "${stage.origin}": Retry policy is "${retry.retry_on}",`,
                     `not retrying`);
            this.end();
            break;
        default:
            let msg = `Unknown retry policy for session "${this.name}"`;
            log.warn(`Session.disconnect: ${msg}`);
            this.error(new GeneralError(msg));
        }
    }

    // stage.stream contains the new stream
    repipe(stage){
        log.silly('Session.repipe:', `Session ${this.name}:`,
                  `origin: ${stage.origin}`);

        // was error on source?
        if(stage.id === this.source.id){
            let to = this.chain.ingress.length > 0 ?
                this.chain.ingress[0] : this.destination;
            stage.pipe(to);
            let from = this.chain.egress.length > 0 ?
                this.chain.egress[this.chain.egress.length - 1] :
                this.destination;
            from.pipe(stage);
            stage.status = 'READY';

            log.silly('Session.repipe:', `Session ${this.name}:`,
                      `source stage "${stage.origin}" repiped`);
            return true;
        }

        // was error on destination?
        if(stage.id === this.destination.id){
            let from = this.chain.ingress.length > 0 ?
                this.chain.ingress[this.chain.ingress.length - 1] :
                this.source;
            from.pipe(stage);
            let to = this.chain.egress.length > 0 ?
                this.chain.egress[0] : this.source;
            stage.pipe(to);
            stage.status = 'READY';

            log.silly('Session.repipe:', `Session ${this.name}:`,
                      `destination stage "${stage.origin}" repiped`);
            return true;
        }

        // was error on ingress?
        let i = this.chain.ingress.findIndex(r => r.id === stage.id);
        if(i >= 0){
            let from = i === 0 ? this.source : this.chain.ingress[i-1];
            from.pipe(stage);
            let to = i === this.chain.ingress.length - 1 ?
                this.destination : this.chain.ingress[i+1];
            stage.pipe(to);
            stage.status = 'READY';

            log.silly('Stage.repipe:', `Session ${this.name}:`,
                      `ingress chain repiped on cluster "${stage.origin}"`);
            return true;
        }

        i = this.chain.egress.findIndex(r => r.id === stage.id);
        if(i<0)
            log.error('Session.repipe: Internal error:',
                      'Could not find disconnected stage',
                      `${stage.origin}`);

        let from = i === 0 ? this.destination : this.chain.egress[i-1];
        from.pipe(stage);
        let to = i === this.chain.egress - 1 ?
            this.source : this.chain.egress[i+1];
        stage.pipe(to);
        stage.status = 'READY';

        log.silly('Session.repipe:', `Session ${this.name}:`,
                  `egress chain repiped on cluster "${stage.origin}"`);

        return true;
    }

    // state transitions
    connected(){
        log.silly('Session.connected', `Session ${this.name}:`);
        this.status = 'CONNECTED';
        this.emit('connect');

        this.events.push({ event: 'CONNECT',
                           timestamp: new Date().toISOString(),
                           message: 'Session successfully connected',
                           content: ''});
    }

    // immediately closes the stream, possibly sends response headers
    error(err){
        log.silly('Session.error', `Session ${this.name}:`, err.message);
        this.events.push({ event: 'ERROR',
                           timestamp: new Date().toISOString(),
                           message: err.message,
                           content: err});

        this.status = 'FINALIZING';
        if(this.priv && this.priv.error){
            this.priv.error(this.priv, err);
        }
        this.emit('error', err);
        this.destroy();
    }

    end(err){
        log.silly('Session.end', `Session ${this.name}`,
                  (err && err.message) ? err.message : '');
        this.events.push({ event: 'END',
                           timestamp: new Date().toISOString(),
                           message: err ? err.message : 'Normal end'
                         });

        this.status = 'FINALIZING';
        this.emit('end', err);
        this.destroy();
    }

    // return 1 of route/session can be deleted (i.e., no retry is
    // ongoing), otherwise keep route/session around until all retries
    // have been aborted
    destroy(){
        log.silly('Session.destroy:', `Session ${this.name}`);
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
                if(stage.status !== 'END' && stream){
                    stream.end();
                    // stream.destroy();
                    deleted++;
                }
            } catch(err){
                log.info(`Session.destroy: ${this.name}: Could not terminate stage:`,
                         `"${stage.origin}"/${stage.status}:`, dumper(err, 3));
            }

            stage.status = 'END';
        }

        log.verbose('Session.destroy:', `${this.name}:`,
                    `deleted ${deleted} streams`);
        this.status = 'DESTROYED';

        this.events.push({ event: 'DESTROY',
                           timestamp: new Date().toISOString(),
                           message: "Session destroyed",
                           content: ''});

        if(this.track){
            log.silly('Session.destroy:', `${this.name}:`,
                      `Tracking session for ${this.track} seconds`);
            setTimeout(() => this.emit('destroy'), this.track * 1000);
        } else {
            this.emit('destroy');
        }

        // return OK if no stage is retrying
        return ret;
    }

};
util.inherits(Session, EventEmitter);

module.exports.Session = Session;

// export Stage just for testing purposes
module.exports.Stage   = Stage;
