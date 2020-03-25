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

const log           = require('npmlog');
const fs            = require('fs');
const http          = require('http');
const WebSocket     = require('ws');
const udp           = require('dgram');
const url           = require('url');
const util          = require('util');
const EventEmitter  = require('events');
const pTimeout      = require('p-timeout');
const pEvent        = require('p-event');

const stream        = require('stream');
const streamops     = require("stream-operators");
const miss          = require('mississippi');
const jsonPredicate = require("json-predicate")
const eventDebug    = require('event-debug');

const StreamCounter = require('./stream-counter.js').StreamCounter;
const L7mpOpenAPI   = require('./l7mp-openapi.js').L7mpOpenAPI;
const utils         = require('./stream.js');


//------------------------------------
//
// LoadBalancer
//
// events: -
//
//------------------------------------
class LoadBalancer {
    constructor(l){}

    apply(es){ log.error('LoadBalancer.apply', 'Base class called');
               console.trace(); }
};

class EmptyLoadBalancer extends LoadBalancer {
    constructor(l){ super(l) }
};

// always chooses the first endpoint
class TrivialLoadBalancer extends LoadBalancer {
    constructor(){ super(); }

    toJSON(){
        log.silly('TrivialLoadBalancer.toJSON');
        return { name: 'TrivialLoadBalancer' };
    }

    apply(es, s) {
        if(es.length === 0){
            log.error('TrivialLoadBalancer.apply: No endpoint in cluster');
            process.exit();
        }
        return es[0];
    }
};

LoadBalancer.create = (policy) => {
    log.silly('LoadBalancer.create:', `policy: ${policy}`);
    switch(policy){
    case 'none':     return new EmptyLoadBalancer;
    case 'trivial':  return new TrivialLoadBalancer();
    default:
        log.error('LoadBalancer.create',
                  `TODO: Policy "${policy}" unimplemented`);
    }
};

//------------------------------------
//
// EndPoint
//
// events: open, close, error, unexpected-response
//
//------------------------------------
class EndPoint {
    constructor(c, e){
        this.name      = e.name || `EndPoint_${EndPoint.index++}`;
        this.cluster   = c;
        this.full_name = `Cluster:${c.name}-${this.name}`;
        this.spec      = e.spec;
        this.weight    = e.weight || 1;
        this.stats     = {
            active_sessions: 0,
            total_sessions:  0,
            counter: new StreamCounter()
        };
    }

    toJSON(){
        log.silly('EndPoint.toJSON:', `"${this.name}"`);
        return {
            name:   this.name,
            spec:   this.spec,
            weight: this.weight,
        };
    }

    // for session-type connections
    connect(s) {
        Promise.reject(log.error('EndPoint.connect', 'Base class called'));
    }
};
EndPoint.index = 0;

// Inherit from EventEmitter: roughly equivalent to:
// EndPoint.prototype = Object.create(EventEmitter.prototype)
util.inherits(EndPoint, EventEmitter);

class WebSocketEndPoint extends EndPoint {
    constructor(c, e) {
        super(c, e);
        this.remote_address = e.spec.address;
        this.remote_port    = c.spec.port;
        this.bind           = c.spec.bind;
        this.local_address  = c.spec.bind ? c.spec.bind.address : '';
        this.local_port     = c.spec.bind ? c.spec.bind.port : 0;
    }

    toJSON(){
        log.silly('WebSocketEndPoint.toJSON:', `"${this.name}"`);
        return {
            name: this.name,
            spec: {
                protocol: this.protocol,
                address:  this.remote_address,
                port:     this.remote_port,
            },
            weight:   this.weight,
        };
    }

    connect(s){
        let url = {};
        if(s.metadata.HTTP && s.metadata.HTTP.url){
            // source listener is HTTP compatible and/or the user has
            // created a nice URL using rewrite rules
            url = {... s.metadata.HTTP.url};
        }

        // set defaults
        url.protocol = url.protocol || 'ws';
        url.host     = url.host     || this.remote_address;
        url.port     = url.port     || this.remote_port;
        url.path     = url.path     || '/';


        var options = this.bind ? {localAddress: this.local_address} : {};
        if(s.metadata.HTTP && s.metadata.HTTP.headers){
            options.headers = {...s.metadata.HTTP.headers};
            // use host from header if specified
            if(s.metadata.HTTP.headers.host)
                url.host = s.metadata.HTTP.headers.host;
        }

        // manually override hostname to remove port
        options.hostname = options.host = url.host;

        url = new URL(`${url.protocol}://${url.host}:${url.port}/${url.path}`);
        log.silly(`WebSocketEndPoint.connect:`,
                  `${this.full_name}: URL: ${url.toString()}`);

        var ws = new WebSocket(url, options);

        // re-emit 'open', otherwise we lose the socket in pEvent
        ws.once('open', () => ws.emit('open', ws));
        ws.once('error', (e) => { log.info('WebSocketEndPoint:connect:error', dumper(e, 1));
                                  log.silly('WebSocketEndPoint:connect:error', e); });
        ws.once('end', () => { log.info('WebSocketEndPoint:end'); });

        return ws;
    }

};

class UDPEndPoint extends EndPoint {
    constructor(c, e) {
        super(c, e);
        this.remote_address = e.spec.address;
        this.remote_port    = c.spec.port;
        this.bind           = c.spec.bind;
        this.local_address  = c.spec.bind ? c.spec.bind.address : '';
        this.local_port     = c.spec.bind ? c.spec.bind.port : 0;

        if(!(this.remote_address && this.remote_port))
            log.error('UDPEndPoint', 'No remote addr:port pair defined');
        if(this.socket)
            log.error('UDPEndPoint', 'Cluster already connected');
    }

    toJSON(){
        log.silly('UDPSocketEndPoint.toJSON:', `"${this.name}"`);
        return {
            name: this.name,
            spec: {
                protocol: this.protocol,
                address:  this.remote_address,
                port:     this.remote_port,
            },
            weight:   this.weight,
        };
    }

    connect(s){
        log.silly(`UDPEndPoint.connect:`,
                  (this.bind ?
                   `${this.local_address}:${this.local_port} ->` : ''),
                  `${this.remote_address}:${this.remote_port}`);

        // note: ws events will be caught by the cluster (pEvent)
        var socket = udp.createSocket({type: 'udp4', reuseAddr: true});
        this.socket = socket;

        // for old node.js
        // // connect: added in 12.0, need to mimic this with send in
        // // older node-js socket.connect(this.port, this.address);
        // // will emit 'error' if unsuccessfull
        // log.info('UDPCluster:',
        //          `"${this.name}" Cannot "connect" socket,`,
        //          `using direct sendto!`);

        socket.bind({
            port: this.local_port,
            address: this.local_address,
            exclusive: false
        }, () => {
            log.silly('UDPCluster:',
                      `"${this.name}" bound to ${this.local_address}:` +
                      `${this.local_port}`)

            socket.connect(this.remote_port, this.remote_addesss,
                           () => {
                               log.info('UDPEndPoint:',
                                        `"${this.name}" connected`,
                                        `for ${this.remote_address}:`+
                                        `${this.remote_port} on`,
                                        `${this.local_address}:`+
                                        `${this.local_port}`);

                               // re-emit as 'open', otherwise we lose
                               // the socket in pEvent
                               socket.emit('open', socket);
                           });
        });

        return socket;
    }
};

EndPoint.create = (c, e) => {
    log.silly('EndPoint.create:', `Protocol: ${c.protocol}` );
    switch(c.protocol){
    case 'WS':
    case 'WebSocket': return new WebSocketEndPoint(c, e);
    case 'UDP':       return new UDPEndPoint(c, e);
    default:
        log.error('EndPoint.create',
                  `TODO: Protocol "${c.protocol}" unimplemented`);
    }
}

//------------------------------------
//
// Cluster
//
// no events: hides endpoint events behind a promise
//
//------------------------------------
class Cluster {
    constructor(c){
        this.name         = c.name;
        this.spec         = c.spec;
        this.protocol     = c.spec.protocol;
        this.loadbalancer = LoadBalancer.create(
            c.loadbalancer || 'trivial' );
        this.type         = c.type || '';
        this.stats        = {
            active_sessions: 0,
            total_sessions:  0,
            counter: new StreamCounter()
        };

        this.endpoints = [];
        if(c.endpoints)
            c.endpoints.forEach( (e) => this.addEndPoint(e) );
    }

    toJSON(){
        log.silly('Cluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
            // type:         this.type,
            endpoints:    this.endpoints,
            loadbalancer: this.loadbalancer || 'none',
        };
    }

    addEndPoint(e){
        log.silly('Cluster.addEndPoint:', dumper(e));
        this.endpoints.push(EndPoint.create(this, e));
    }

    getEndPoint(n){
        return this.endpoints.find( ({name}) => name === n );
    }

    deleteEndPoint(e){
        log.silly('Cluster.deleteEndPoint:', dumper(e));

        var i = this.endpoints.findIndex( ({name}) => name === e.name );
        if(i < 0){
            log.warn('Cluster.deleteEndPoint', 'EndPoint "${e.name}" undefined');
            return;
        }

        this.endpoints.splice(i, 1);
    }

};
Cluster.index = 0;

// Inherit from EventEmitter: roughly equivalent to:
// Cluster.prototype = Object.create(EventEmitter.prototype)
util.inherits(Cluster, EventEmitter);

// class HTTPCluster extends Cluster {};

class WebSocketCluster extends Cluster {
    constructor(c) {
        super(c);
        this.objectMode = true;
        this.type = 'datagram';
    }

    async connect(s){
        log.silly('WebSocketCluster.connect:', `Session: ${s.name}`);
        var e = this.loadbalancer.apply(this.endpoints, s);
        // Promisifies endpoints events
        // cancels the event listeners on reject!
        return pEvent(e.connect(s), 'open', {
            rejectionEvents: ['close', 'error', 'unexpected-response'],
            multiArgs: true, timeout: s.route.retry.timeout
        });
    }

    async stream(s){
        log.silly('WebSocketCluster.stream', `Session: ${s.name}`);
        return this.connect(s).then(
            (args) => {
                // multiArg!
                let ws = args[0];
                return WebSocket.createWebSocketStream(ws,
                                  {readableObjectMode: true})
            });
    }
};

class UDPCluster extends Cluster {
    constructor(c) {
        super(c);
        this.objectMode = true;
        this.type = 'datagram';
    }

    async connect(s){
        log.silly('UDPCluster.connect:', `Session: ${s.name}`);
        var e = this.loadbalancer.apply(this.endpoints, s);
        log.silly('UDPCluster.connect:', `Connecting to ${e.name}:`,
                  `${e.remote_address}:${e.remote_port}`);

        return pEvent(e.connect(s), 'open', {
            rejectionEvents: ['close', 'error'],
            multiArgs: true, timeout:  s.route.retry.timeout
        });
    }

    async stream(s){
        log.silly('UDPCluster.stream', `Session: ${s.name}`);
        return this.connect(s).then( (args) => {
            // multiArg!
            var socket = args[0];
            // var remote_address = args[1];
            // var remote_port    = args[2];

            this.stream = new utils.DatagramStream(socket);

            log.silly('UDPCluster.stream:', `Created`);

            return this.stream;
        });
    }
};

class L7mpControllerCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'L7mpControllerCluster',
            spec:         { protocol: 'L7mpController' },
            loadbalancer: 'none',
            type:         'session'
        });
        this.openapi = new L7mpOpenAPI();
    }

    connect(s){
        log.silly('L7mpControllerCluster.connect', `Session: "${s.name}"`);
        return Promise.resolve();
    }

    stream(s){
        log.silly('L7mpControllerCluster.stream', `Session: "${s.name}"`);

        // the writable part is in objectMode: result is status/message
        let passthrough =
            new utils.DuplexPassthrough({}, {writableObjectMode: true});
        let strm = passthrough.right;
        // eventDebug(strm);
        var body = '';
        strm.on('data', (chunk) => { body += chunk; });
        strm.on('end', () => { this.openapi.handleRequest(s, body, strm) } );

        return Promise.resolve(passthrough.left);
    }
};

class StdioCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'StdioCluster',
            spec:         {protocol: 'Stdio' },
            loadbalancer: 'none',
            type:         'stream'
        });
    }

    connect(s){
        return Promise.reject('StdioCluster:connect: Not supported');
    }

    stream(s){
        log.silly('StdioCluster.stream', `Session: "${s.name}"`);
        return Promise.resolve(miss.duplex(process.stdout, process.stdin));
    }
};

class EchoCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'EchoCluster',
            spec:         {protocol: 'Echo' },
            loadbalancer: 'none',
            type:         'datagram'
        });
    }

    connect(s){
        return Promise.reject('EchoCluster.connect: Not implemented');
    }

    stream(s){
        log.silly('EchoCluster.stream', `Session: "${s.name}"`);
        return Promise.resolve(new stream.PassThrough());
    }
};

class LoggerCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'LoggerCluster',
            spec:         { protocol: 'Logger',
                            log_file: c.spec.log_file || '-',
                            log_prefix: c.spec.log_prefix || '',
                          },
            loadbalancer: 'none',
            type:         'datagram'
        } );
    }

    connect(s){
        return Promise.reject('LoggerCluster.connect: Not implemented');
    }

    stream(s){
        log.silly('LoggerCluster.stream',
                  `Session: ${s.name}, File: ${this.spec.log_file}`);

        let log_stream = process.stdout;
        if(this.spec.log_file !== '-'){
            log_stream = fs.createWriteStream(this.spec.log_file,
                                              { flags: 'w' });
        }

        return Promise.resolve( streamops.map( (arg) => {
            let log_msg = (this.spec.log_prefix) ?
                `${this.spec.log_prefix}: ${arg}` : arg;
            log_stream.write(log_msg); return arg;
        }));
    }
};

// allows two or more sessions to synchronize
// definition contains a label as a JSON query to the metadata
// all streams with the same label will be connected into a single
// broadcast stream
class SyncCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'SyncCluster',
            spec:         {protocol: 'Sync' },
            endpoints:    [],
            loadbalancer: 'none',
            type:         'datagram',
        });
        this.query    = c.spec.query; // JSON query to get key from medatata
        this.streams  = {};           // keyed by 'label'
    }

    toJSON(){
        log.silly('SyncCluster.toJSON:', `"${this.name}"`);
        return {
            name:       this.name,
            protocol:   this.protocol,
            type:       'datagram',
            query:      this.query,
            streams:    this.streams.length,
        };
    }

    connect(s){
        return Promise.reject('SyncCluster.connect: Not implemented');
    }

    stream(s){
        log.silly('SyncCluster.stream', `Session: "${s.name}"`);

        let label = jsonPredicate.dataAtPath(s.metadata, this.query);
        if (typeof label !== 'undefined'){
            if(!(label in this.streams)){
                // unknown label: create stream
                this.streams[label] = new utils.BroadcastStream();
            }

            let port = this.streams[label].add(s);
            return Promise.resolve(port);
        } else {
            return Promise.reject('SyncCluster.stream: reject: ' +
                                  `Session: "${s.name}", ` +
                                  `query "${this.query}" empty label`);
        }
    }
};

Cluster.create = (c) => {
    log.silly('Cluster.create', dumper(c));
    switch(c.spec.protocol){
    case 'HTTP':           return new HTTPCluster(c);
    case 'WebSocket':      return new WebSocketCluster(c);
    case 'UDP':            return new UDPCluster(c);
    case 'Stdio':          return new StdioCluster(c);
    case 'Echo':           return new EchoCluster(c);
    case 'Logger':         return new LoggerCluster(c);
    case 'Sync':           return new SyncCluster(c);
    case 'L7mpController': return new L7mpControllerCluster(c);
    default:
        log.error('Cluster.create',
                  `TODO: Protocol "${c.spec.protocol}" unimplemented`);
    }
}

module.exports.Cluster = Cluster;
