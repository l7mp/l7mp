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
const net           = require('net');
const WebSocket     = require('ws');
const udp           = require('dgram');
const url           = require('url');
const util          = require('util');
const EventEmitter  = require('events');
const pTimeout      = require('p-timeout');
const pEvent        = require('p-event');
const HashRing      = require('hashring');
const stream        = require('stream');
const miss          = require('mississippi');
const jsonPredicate = require("json-predicate")
const eventDebug    = require('event-debug');
const _             = require('lodash');

const StreamCounter = require('./stream-counter.js').StreamCounter;
const L7mpOpenAPI   = require('./l7mp-openapi.js').L7mpOpenAPI;
const utils         = require('./stream.js');

// for getAtPath()
const Rule          = require('./rule.js').Rule;

//------------------------------------
//
// LoadBalancer
//
// events: -
//
//------------------------------------
class LoadBalancer {
    constructor(l){ this.policy = l.policy || 'None';
                    this.es = [];}

    update(es){ this.es = es }
    apply(es){ log.error('LoadBalancer.apply', 'Base class called');
               console.trace(); }
};

// always chooses the first endpoint
class TrivialLoadBalancer extends LoadBalancer {
    constructor(l){ super(l); }

    toJSON(){
        log.silly('TrivialLoadBalancer.toJSON');
        return { policy: this.policy };
    }

    apply(s) {
        if(this.es.length === 0){
            let err = 'TrivialLoadBalancer.apply: No endpoint in cluster'
            log.warn(err);
            throw new Error(err);
        }
        return this.es[0];
    }
};

// always chooses the first endpoint
class HashRingLoadBalancer extends LoadBalancer {
    constructor(l){
        super(l);
        this.key = l.key || null;
        this.es = [];
    }


    toJSON(){
        log.silly('HashRingLoadBalancer.toJSON');
        return { policy: 'HashRing',
                 key:    this.key || '<RANDOM>'};
    }

    //TODO: this is static (recreate on update), make this dynamic
    // (add/remove difference)
    update(es){
        log.silly('HashRingLoadBalancer.update');
        this.keys = {};
        es.forEach( (e) => {
            // this.keys[e.name] = { weight: e.weight, endpoint: e };
            this.keys[e.address] = { weight: e.weight, endpoint: e };
        });
        // dump(this.keys, 2);

        this.hashring = new HashRing(this.keys, 'md5',
                                     { replicas: 1, 'max cache size': 100 });

    }

    apply(s) {
        log.silly('HashRingLoadBalancer.apply:', `Session: ${s.name}`);

        if(Object.keys(this.keys).length === 0){
            log.error('HashRingLoadBalancer.apply: No endpoint in cluster');
            process.exit();
        }

        let key;
        if(this.key){
            key = Rule.getAtPath(s.metadata, this.key);
            if (typeof key === 'undefined')
                log.warn('HashRingLoadBalancer.apply:',
                         `No key found for query "${this.key}",`,
                         `falling back to random load-balancing`);
        }
        if((typeof this.key === 'undefined') || (typeof key === 'undefined'))
            // TODO: this is NOT secure!
            key = Math.floor(Math.random() * 1000).toString();

        // log.silly('HashRingLoadBalancer.apply:', `Key: "${key}"`);
        let n = this.hashring.get(key.toString());
        let e = this.keys[n].endpoint;

        log.silly('HashRingLoadBalancer.apply:',
                  `Choosing endpoint "${e.name}" for key "${key}"`);

        return e;
    }
};

LoadBalancer.create = (l) => {
    log.silly('LoadBalancer.create:', dumper(l,3));
    switch(l.policy){
    case 'None':            return new LoadBalancer(l);
    case 'Trivial':         return new TrivialLoadBalancer(l);
    case 'HashRing':        return new HashRingLoadBalancer(l);
    case 'ConsistentHash':  return new HashRingLoadBalancer(l);
    default:
        if(l.policy)
            var err = 'LoadBalancer.create: '+`TODO: Policy "${l.policy}" unimplemented`;
        else
            var err = 'LoadBalancer.create: '+`TODO: Policy undefined`;
        log.warn(err);
        throw new Error(err);
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
        this.protocol  = c.protocol;
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
            name: this.name,
            spec: { address:  this.remote_address },
            weight:   this.weight,
        };
    }

    connect(s) {
        Promise.reject(log.error('EndPoint.connect', 'Base class called'));
    }
};
EndPoint.index = 0;

// Inherit from EventEmitter: roughly equivalent to:
// EndPoint.prototype = Object.create(EventEmitter.prototype)
util.inherits(EndPoint, EventEmitter);

// Test: produces a stream when requested
class TestEndPoint extends EndPoint {
    constructor(c, e) {
        super(c, e);
        this.timeout = 0;
        // programmable ok/fail sequence
        // ok: emit test-open after timeout
        // fail: emit test-error after timeout
        this.mode = ['ok'];
        this.round = 0;
    }
    connect(s){
        log.silly('TestEndPoint.connect');
        let strm = new stream.PassThrough();
        setTimeout( () => {
            if(this.mode[this.round] === 'ok')
                strm.emit('test-open', strm);
            else
                strm.emit('test-error', new Error('TestEndPoint.error'));
            this.round = (this.round + 1) % this.mode.length;
        }, this.timeout);
        return strm;
    }
};

class WebSocketEndPoint extends EndPoint {
    constructor(c, e) {
        super(c, e);
        this.remote_address = e.spec.address;
        this.remote_port    = c.spec.port;
        this.bind           = c.spec.bind;
        this.local_address  = c.spec.bind ? c.spec.bind.address : '';
        this.local_port     = c.spec.bind ? c.spec.bind.port : 0;
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

        // re-emit 'open', otherwise we lose the socket in pEvent:
        // ws.open does not return ws itself so we must re-emit here
        // with ws as an argument!
        ws.once('open', () => ws.emit('open', ws));
        ws.once('error',
                (e) => { log.warn('WebSocketEndPoint:connect: Error:',
                                  `${e.errno}: ${e.address}:${e.port}`);
                         ws.emit('error', e); });
        ws.once('end', () => { log.info('WebSocketEndPoint:end'); });

        return ws;
    }
};

class UDPEndPoint extends EndPoint {
    constructor(c, e) {
        super(c, e);
        this.remote_address = e.spec.address;
        this.remote_port    = c.spec.port;

        if(!(this.remote_address && this.remote_port))
            throw new Error('UDPEndPoint:', 'No remote addr:port pair defined');
        if(this.socket)
            throw new Error('UDPEndPoint:', 'Cluster already connected');
    }

    connect(s){
        let c = this.cluster;
        log.silly(`UDPEndPoint.connect:`,
                  (c.spec.bind ?
                   `${c.spec.bind.address || "0.0.0.0"}:`+
                   `${c.spec.bind.port || "0"} ->` : ''),
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
            port: c.spec.bind ? c.spec.bind.port : 0,
            address: c.spec.bind ? c.spec.bind.address : '0.0.0.0',
            exclusive: false
        }, () => {
            const address = socket.address();
            let local_address = address.address;
            let local_port    = address.port;

            log.silly('UDPCluster:',
                      `"${this.name}" bound to ${local_address}:` +
                      `${local_port}`)

            socket.on('connect', () => {
                const remote = socket.remoteAddress();
                log.info('UDPEndPoint:', `"${this.name}" connected`,
                         `to ${remote.address}:${remote.port} on`,
                         `${local_address}:${local_port}`);

                // re-emit as 'open', otherwise we lose
                // the socket in pEvent
                socket.emit('open', socket);
            });

            // we do not set a callback, so in case of failure an
            // 'error' event will be emitted
            socket.connect(this.remote_port, this.remote_address);
        });

        return socket;
    }
};

class NetSocketEndPoint extends EndPoint {
    constructor(c, e) {
        super(c, e);
        this.options = this.protocol === 'TCP' ?
            { port: c.spec.port, host: e.spec.address } :
        {path: e.spec.address}; // endpoint address is filename for UDS

        if(this.protocol === 'TCP' && c.spec.bind){
            this.options.localAddress = c.spec.bind.address;
            this.options.localPort = c.spec.bind.port;
        }
    }

    connect(s){
        let options = this.options;
        var sock = net.createConnection(this.options);

        // re-emit 'connect', otherwise we lose the socket in
        // pEvent: socket.connect does not return socket so we
        // must re-emit here with it as an argument!
        sock.once('connect', () => sock.emit('open', sock));
        sock.setNoDelay();  // disable Nagle's
        sock.once('error',
                  (e) => { log.warn('NetSocketEndPoint:connect: Error:',
                                    `${e.errno}: ${e.address}:${e.port}`);
                         sock.emit('error', e); });
        // sock.on('end', () => { log.info('NetSocketEndPoint:end'); });

        return sock;
    }
};

class JSONSocketEndPoint extends EndPoint {
    constructor(c, e) {
        super(c, e);
        e.name = e.name + ':transport-endpoint';
        this.cluster.transport.addEndPoint(e);
    }

    connect(s){
        throw new Error('JSONSocketEndPoint.connect: Internal error:',
                       'Should never be called directly');
    }
};

EndPoint.create = (c, e) => {
    log.silly('EndPoint.create:', `Protocol: ${c.protocol}` );
    switch(c.protocol){
    case 'WS':
    case 'WebSocket':        return new WebSocketEndPoint(c, e);
    case 'UDP':              return new UDPEndPoint(c, e);
    case 'TCP':              return new NetSocketEndPoint(c, e);
    case 'UnixDomainSocket': return new NetSocketEndPoint(c, e);
    case 'Test':             return new TestEndPoint(c, e);
    case 'JSONSocket':       return new JSONSocketEndPoint(c, e);
    default:
        let err = 'EndPoint.create: '+`TODO: Protocol "${c.protocol}" unimplemented`;
        log.warn(err);
        throw new Error(err);
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
            c.loadbalancer || { policy: 'Trivial' } );
        this.type         = c.type || '';
        this.stats        = {
            active_sessions: 0,
            total_sessions:  0,
            counter: new StreamCounter()
        };

        this.endpoints = [];
        if(c.endpoints)
            c.endpoints.forEach( (e) => this.addEndPoint(e) );
        this.retriable = true;
        this.options = c.options ||
            {removeOrphanSessions: true};
    }

    toJSON(){
        log.silly('Cluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
            // type:         this.type,
            endpoints:    this.endpoints,
            loadbalancer: this.loadbalancer,
            // retriable:    this.retriable
            options:      this.options,
        };
    }

    addEndPoint(e){
        log.silly('Cluster.addEndPoint:', dumper(e));
        let ep = EndPoint.create(this, e);
        this.endpoints.push(ep);
        this.loadbalancer.update(this.endpoints);
        return ep;
    }

    getEndPoint(n){
        return this.endpoints.find( ({name}) => name === n );
    }

    deleteEndPoint(n){
        log.silly('Cluster.deleteEndPoint: name:', n);

        var i = this.endpoints.findIndex( ({name}) => name === n );
        if(i < 0){
            log.warn('Cluster.deleteEndPoint', `EndPoint "${n}" undefined`);
            return;
        }

        this.endpoints.splice(i, 1);
        this.loadbalancer.update(this.endpoints);
    }

};
Cluster.index = 0;

// Inherit from EventEmitter: roughly equivalent to:
// Cluster.prototype = Object.create(EventEmitter.prototype)
util.inherits(Cluster, EventEmitter);

// class HTTPCluster extends Cluster {};

// test: returns a stream after timeout or may fail after timeout
class TestCluster extends Cluster {
    constructor(c) {
        super(c);
        this.type = 'byte-stream'; // test endpoint returns
                                   // non-objectmode passthrough
    }

    async connect(s){
        log.silly('TestCluster.connect');
        var e = this.endpoints[0];
        return pEvent(e.connect(s), 'test-open', {
            rejectionEvents: ['test-error'],
            multiArgs: true, timeout: s.route.retry.timeout
        });
    }

    async stream(s){
        log.silly('TestCluster.stream');
        return this.connect(s).then(
            (args) => { return args[0]; }
        );
    }
};

class WebSocketCluster extends Cluster {
    constructor(c) {
        super(c);
        this.objectMode = true;
        this.type = 'datagram-stream';
    }

    async connect(s){
        log.silly('WebSocketCluster.connect:', `Protocol: ${this.protocol}`,
                  `Session: ${s.name}`);
        var e = this.loadbalancer.apply(s);
        // Promisifies endpoint events: cancels the event listeners on
        // reject!
        return pEvent(e.connect(s), 'open', {
            rejectionEvents: ['close', 'error', 'unexpected-response'],
            multiArgs: true, timeout: s.route.retry.timeout
        });
    }

    async stream(s){
        log.silly('WebSocketCluster.stream:',  `Protocol: ${this.protocol}`,
                  `Session: ${s.name}`);
        return this.connect(s).then(
            (args) => {
                // multiArg!
                let ws = args[0];
                let _stream = WebSocket
                    .createWebSocketStream(ws, {readableObjectMode: true});
                // eventDebug(_stream);
                return _stream;
            });
    }
};

class NetSocketCluster extends Cluster {
    constructor(c) {
        super(c);
        this.type = 'byte-stream';
    }

    async connect(s){
        log.silly('NetSocketCluster.connect:', `Session: ${s.name}`);
        var e = this.loadbalancer.apply(s);
        return pEvent(e.connect(s), 'open', {
            rejectionEvents: ['close', 'end', 'error', 'timeout'],
            multiArgs: true, timeout: s.route.retry.timeout
        });
    }

    async stream(s){
        log.silly('NetSocketCluster.stream:', `Session: ${s.name}`);
        return this.connect(s).then(
            (args) => {
                // multiArg!
                return args[0];
            });
    }
};

class UDPCluster extends Cluster {
    constructor(c) {
        super(c);
        this.objectMode = true;
        this.type = 'datagram-stream';
    }

    async connect(s){
        log.silly('UDPCluster.connect:', `Session: ${s.name}`);
        var e = this.loadbalancer.apply(s);
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

            this._stream = new utils.DatagramStream(socket);
            log.silly('UDPCluster.stream:', `Created`);
            // eventDebug(this._stream);

            return this._stream;
        });
    }
};

class JSONSocketCluster extends Cluster {
    constructor(c) {
        super(c);

        // crate a dummy transport cluster with no endpoints
        // 1. create transport
        let cu = {
            name: this.name + ':transport-cluster',
            spec: c.spec.transport_spec,
            loadbalancer: c.loadbalancer || { policy: 'Trivial' },
        };
        if(!cu.spec){
            let e = 'JSONSocketCluster: No transport specified';
            log.warning(e);
            throw new Error(e);
        }
        this.transport = Cluster.create(cu);
        this.type = this.transport.type;

        log.info('JSONSocketCluster:', `${this.name} initialized, using transport:`,
                 dumper(this.transport, 2));
    }

    async connect(s){
        throw new Error('JSONSocketEndPoint.connect: Internal error:',
                        `Session: ${s.name}`,
                        'Should never be called directly');
    }

    // 1. create transport stream
    // 2. add JSONSocket fields to metadata and send as header
    // 3. wait for a valid response header from server and return stream to caller
    async stream(s){
        log.silly('JSONSocketCluster.stream:',  `Protocol: ${this.protocol}`,
                  `Session: ${s.name}`);

        // 2. ask for a stream
        try {
            var stream = await this.transport.stream(s);
        } catch(e){
            log.silly('JSONSocketCluster.stream:', `Could not obtain transport stream:`,
                      e.message);
            return Promise.reject(e.message);
        }

        if(!(stream.readableObjectMode || stream.writableObjectMode))
            log.warn('JSONSocketCluster:', `${this.name}:`,
                     `Transport is not message-based, JSON headers may be fragmented`);

        // 3. add JSONSocket fields to metadata and send as header
        let req_header = {...s.metadata};
        req_header['JSONSocketVersion'] = 1; // overwrite

        stream.write(JSON.stringify(req_header));

        // 4. wait for a valid response header from server and return stream to caller
        try {
            var data = await pEvent(stream, 'data', {
                rejectionEvents: ['close', 'error'],
                multiArgs: true, // TODO: support TIMEOUT: timeout: this.timeout
            });
        } catch(e){
            log.silly('JSONSocketCluster.stream:', `Error receiving response header:`,
                      e.message);
            stream.destroy();
            return Promise.reject(e.message);
        }

        log.silly('JSONSocketCluster:', `${this.name}:`,
                  `Received packet, checking for JSON response header"`);

        try {
            var header = JSON.parse(data);
        } catch(e){
            let err = `Invalid JSON response header, dropping connection:`+e.message;
            log.warn('JSONSocketCluster:', `${this.name}:`, err);
            stream.destroy();
            return Promise.reject(err);
        }

        if(typeof header['JSONSocketVersion'] === 'undefined'){
            log.warn('JSONSocketCluster:', `${this.name}:`,
                     `No JSONSocket version info in reponse header:`, dumper(header,5));
            stream.destroy();
            return Promise.reject(err);
        }

        let version = header['JSONSocketVersion'];

        if(typeof version != "number") {
            let err = `JSONSocket version info is not numeric in response header: `+
                dumper(header,5);
            log.warn('JSONSocketCluster:', `${this.name}:`, err);
            stream.destroy();
            return Promise.reject(err);
        }

        if(version < 0 || version > 1) {
            let err = `Unsupported JSONSocket version "${version}" in header, dropping connection`;
            log.warn('JSONSocketCluster:', `${this.name}:`, err);
            stream.destroy();
            return Promise.reject(err);
        }

        if(header['JSONSocketStatus'] < 200 || header['JSONSocketStatus'] > 299){
            let err = `Server sent invalid statis "${header['JSONSocketStatus']}" in `+
                `response header, dropping connection`;
            log.warn('JSONSocketCluster:', `${this.name}:`, err);
            stream.destroy();
            return Promise.reject(err);
        }

        log.silly('JSONSocketCluster:', `${this.name}:`, `Connected`);
        return Promise.resolve(stream);
    }
};

// non-transport

class L7mpControllerCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'L7mpControllerCluster',
            spec:         { protocol: 'L7mpController' },
            type:         'byte-stream'
        });
        this.openapi = new L7mpOpenAPI();
        this.retriable = false;
    }

    toJSON(){
        log.silly('L7mpControllerCluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
        };
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
            loadbalancer: { policy: 'None' },
            type:         'byte-stream'
        });
        this.retriable = false;
    }

    toJSON(){
        log.silly('StdioCluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
        };
    }

    connect(s){
        return Promise.reject('StdioCluster:connect: Not supported');
    }

    stream(s){
        log.silly('StdioCluster.stream', `Session: "${s.name}"`);
        // flush stdout
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        return Promise.resolve(miss.duplex(process.stdout, process.stdin));
    }
};

class EchoCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'EchoCluster',
            spec:         {protocol: 'Echo' },
            type:         'datagram-stream'
        });
    }

    toJSON(){
        log.silly('EchoCluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
        };
    }

    connect(s){
        return Promise.reject('EchoCluster.connect: Not implemented');
    }

    stream(s){
        log.silly('EchoCluster.stream', `Session: "${s.name}"`);
        return Promise.resolve(new stream.PassThrough({readableObjectMode: true}));
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
            loadbalancer: { policy: 'None' },
            type:         'byte-stream'
        } );
    }

    toJSON(){
        log.silly('LoggerCluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
        };
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

        return Promise.resolve( miss.through(
            (arg, enc, cb) => {
                let log_msg = (this.spec.log_prefix) ?
                    `${this.spec.log_prefix}: ${arg}` : arg;
                log_stream.write(log_msg);
                cb(null, arg);
            },
            (cb) => { cb(null, '') }
        ));

        // return Promise.resolve( streamops.map( (arg) => {
        //     let log_msg = (this.spec.log_prefix) ?
        //         `${this.spec.log_prefix}: ${arg}` : arg;
        //     log_stream.write(log_msg); return arg;
        // }));
    }
};

class JSONEncapCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'JSONEncapCluster',
            spec:         { protocol: 'JSONEncap'},
            type:         'datagram-stream',
        } );
    }

    toJSON(){
        log.silly('JSONEncapCluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
        };
    }

    connect(s){
        return Promise.reject('JSONEncapCluster.connect: Not implemented');
    }

    stream(s){
        log.silly('JSONEncapCluster.stream', `Session: ${s.name}`);
        return Promise.resolve( miss.through.obj( // objectMode=true
            (arg, enc, cb) => {
                let buffer = arg instanceof Buffer;
                let ret = buffer ? arg : Buffer.from(arg, enc);
                let json = {
                    metadata: s.metadata,
                    payload: ret.toString('base64'),
                };
                ret = JSON.stringify(json);
                cb(null, ret);
            },
            (cb) => { cb(null, '') }
        ));
    }
};

class JSONDecapCluster extends Cluster {
    constructor(c) {
        super( {
            name:         c.name || 'JSONDecapCluster',
            spec:         { protocol: 'JSONDecap'},
            type:         'datagram',
        } );
    }

    toJSON(){
        log.silly('JSONDecapCluster.toJSON:', `"${this.name}"`);
        return {
            name:         this.name,
            spec:         this.spec,
        };
    }

    connect(s){
        return Promise.reject('JSONDecapCluster.connect: Not implemented');
    }

    stream(s){
        log.silly('JSONDecapCluster.stream', `Session: ${s.name}`);
        return Promise.resolve( miss.through.obj(  // objectMode=true
            (arg, enc, cb) => {
                let buffer = arg instanceof Buffer;
                arg = buffer ? arg : arg.toString(enc);
                try {
                    let json = JSON.parse(arg);
                    var ret = Buffer.from(json.payload, 'base64') || "";
                } catch(e){
                    log.info('JSONDecapCluster.stream.transform:',
                             `Invalid JSON payload`,
                             `"${ret.toString('base64')}":`, e,);
                }
                cb(null, ret);
            },
            (cb) => { cb(null, '') }
        ));
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
            loadbalancer: { policy: 'None' },
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
            // type:       'datagram',
            query:      this.query,
            streams:    this.streams.length,
        };
    }

    connect(s){
        return Promise.reject(new Error('SyncCluster.connect: Not implemented'));
    }

    stream(s){
        log.silly('SyncCluster.stream', `Session: "${s.name}"`);

        let label = Rule.getAtPath(s.metadata, this.query);
        if (typeof label !== 'undefined'){
            if(!(label in this.streams)){
                // unknown label: create stream
                this.streams[label] = new utils.BroadcastStream();
            }

            let port = this.streams[label].add(s.name);
            return Promise.resolve(port);
        } else {
            return Promise.reject(
                new Error(`SyncCluster.stream: reject: Session: "${s.name}":`+
                          ` query "${this.query}": empty label`));
        }
    }
};

Cluster.create = (c) => {
    log.silly('Cluster.create', dumper(c, 4));
    switch(c.spec.protocol){
    case 'Test':             return new TestCluster(c);
    case 'HTTP':             return new HTTPCluster(c);
    case 'WebSocket':        return new WebSocketCluster(c);
    case 'UDP':              return new UDPCluster(c);
    case 'TCP':              return new NetSocketCluster(c);
    case 'UnixDomainSocket': return new NetSocketCluster(c);
    case 'JSONSocket':       return new JSONSocketCluster(c);
    case 'Stdio':            return new StdioCluster(c);
    case 'Echo':             return new EchoCluster(c);
    case 'Logger':           return new LoggerCluster(c);
    case 'JSONEncap':        return new JSONEncapCluster(c);
    case 'JSONDecap':        return new JSONDecapCluster(c);
    case 'Sync':             return new SyncCluster(c);
    case 'L7mpController':   return new L7mpControllerCluster(c);
    default:
        let err='Cluster.create: '+`TODO: Protocol "${c.spec.protocol}" unimplemented`;
        log.warn(err);
        throw new Error(err);
    }
}

module.exports.Cluster      = Cluster;
module.exports.EndPoint     = EndPoint;
module.exports.LoadBalancer = LoadBalancer;
