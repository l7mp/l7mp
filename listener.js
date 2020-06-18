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
const net          = require('net');
const WebSocket    = require('ws');
const http         = require('http');
const udp          = require('dgram');
const url          = require('url');
const EventEmitter = require('events').EventEmitter;
const util         = require('util');
const miss         = require("mississippi");
const duplex3      = require("duplexer2");
const eventDebug   = require('event-debug');
const pEvent       = require('p-event');

const StreamCounter = require('./stream-counter.js').StreamCounter;
const utils         = require('./stream.js');
const {L7mpError, Ok, InternalError, BadRequestError, NotFoundError, GeneralError} = require('./error.js');

// for get/setAtPath()
const Rule          = require('./rule.js').Rule;

class Listener {
    constructor(l){
        this.protocol  = l.spec.protocol;
        this.name      = l.name;
        this.spec      = l.spec;
        this.rules     = "";
        this.type      = "";
        this.sessionId = 0;
        this.emitter   = l.emitter;
        this.stats     = {
            active_sessions:   0,
            accepted_sessions: 0,
            counter: new StreamCounter()
        };
        this.options = l.options ||
            {removeOrphanSessions: true};
    }

    getNewSessionId() { return this.sessionId++; }

    toJSON(){
        log.silly('Listener.toJSON', `"${this.name}"`);
        return {
            name:    this.name,
            spec:    this.spec,
            rules:   this.rules,
            options: this.options,
        };
    }

    json(res){
        let json = {
            status: res.status,
            message: res.message
        };
        if(res.content) json.content = res.content;
        return JSON.stringify(json);
    }

    emitSession(m, s, p){
        let sess = { metadata: m, source: { origin: this.name, stream: s }};
        if(p) sess.priv = p
        return this.emitter(sess);
    }
}

// Inherit from EventEmitter: roughly equivalent to:
// Listener.prototype = Object.create(EventEmitter.prototype)
util.inherits(Listener, EventEmitter);

// for testing: emits a session req when we ask
class TestListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'datagram-stream';  // whatever
        this.mode = 'server';
    }
    run(){ }
    emitSession(m, s, p){ this.emit('emit', this.getSession(m,s,p))}
}

class HTTPListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'byte-stream';
        this.mode = 'server';
    }

    run(){
        this.server = http.createServer( this.onRequest );

        this.server.on('error', (e) => {
            log.warn('HTTPListener.new: Error:', e);
            return;
        });

        try {
            this.server.listen(this.spec.port, () => {
                log.info('HTTPListener.new',
                         `"${this.name}" running on port`,
                         `${this.spec.port}`)
            });
        } catch(e){
            log.warn('HTTPListener.listen: Error:', e);
            return;
        }

        this.server.on('request', (req, res) => {
            this.onReq(req, res);
        });
    }

    async onReq(req, res){
        log.silly('HTTPListener.onRequest:', `Listener: ${this.name}`);
        let name =
            `HTTP:${req.connection.remoteAddress}:` +
            `${req.connection.remotePort}::` +
            `${req.connection.localAddress}:` +
            `${req.connection.localPort}-` +
            this.getNewSessionId();

        // eventDebug(req);
        // eventDebug(res);

        // let stream = duplex3(res, req, {objectMode: false});
        let stream = miss.duplex(res, req, {objectMode: false});

        try {
            var query = url.parse(req.url);
        } catch(e){
            let error = `Could not parse URL: "${req.url}":` + e;
            this.finalize(res, { status: 404,
                                 content: {
                                     message: 'Not found',
                                     error: error }});
        }

        let metadata = {
            name: name,
            IP: {
                src_addr: req.connection.remoteAddress,
                dst_addr: req.connection.localAddress,
            },
            TCP: {
                src_port: req.connection.remotePort,
                dst_port: req.connection.localPort,
            },
            HTTP: {
                version: req.httpVersion,
                method:  req.method,
                url: {
                    url:      req.url,
                    href:     query.href || '',
                    protocol: query.protocol || '',
                    host:     query.host || '',
                    port:     query.port || '',
                    path:     query.path || '',
                    query:    query.query || '',
                },
                headers: req.headers,
            },
        };

        // this.emit('emit', this.getSession(
        //     metadata, stream,
        //     { req: req, res: res, setResponseHeader: this.end }));

        await this.emitSession(
            metadata, stream, { req: req, res: res, error: this.error });

        // this.router({
        //     metadata: metadata,
        //     listener: { origin: this.name, stream: stream },
        //     priv: { req: req, res: res, end: this.end },
        // }).then((res) => {
        //     // should only ever get here with an Ok status
        //     if(!(res instanceof Ok))
        //         log.warn('HTTPListener.onReq: Router returned non-Ok status '+
        //                  'on the resolve path');
        //     let json = this.json(res);
        //     s.priv.res.writeHead(res.status, {
        //         'Content-Length': Buffer.byteLength(json),
        //         'Content-Type': 'application/json'})
        //         .end(json);
        // },
        //         (err) => {
        //             let json = this.json(res);
        //             s.priv.res.writeHead(res.status, {
        //                 'Content-Length': Buffer.byteLength(json),
        //                 'Content-Type': 'application/json'})
        //                 .end(json);
        //         });
    }

    error(priv, err){
        let header = {
            status:  err.status,
            message: err.message,
        };
        let json = err instanceof Ok ?
            // content is to be sent as is
            err.content :
            { status: err.status,
              message: err.message,
              content: err.content
            };
        json = JSON.stringify(json, null, 4);
        header['Content-Length'] = json.length;
        header['Content-Type'] = 'application/json';
        log.silly('HTTPListener.error:', `Setting headers from`, dumper(header,5));

        priv.res.writeHead(header.status, header.message, header);
        priv.res.end(json);
    };

    // // session priv, header, also immediately ends the session, optional data
    // end(priv, h, d){
    //     log.silly('HTTPListener.end:', `Setting headers from`, dumper(h,5));
    //     let res = priv.res;
    //     if(!res)
    //         h = {status: 500, message: 'Internal server error',
    //              content: 'Cannot find HTTP response stream in session'};
    //     priv.res.writeHead(h.status, h.message, h);
    //     priv.res.end(d);
    // };

    // // if we receive an object or empty msg: normal end, jsonify 7 send msg if any
    // // anything else is an error
    // end(s, e){
    //     log.silly('HTTPListener.end');
    //     let res = s.priv.res;

    //     if(!e){
    //         e = { status: 200, content: { message: 'OK'} };
    //     } else if(e instanceof Error){
    //         e.status = e.status || 500;
    //         e.content = { message: 'Internal server error',
    //                       error: e.message };
    //     } else if(e && typeof e === 'object'){
    //         e.status = e.status || 400;
    //         e.content = e.content ||
    //             { message: 'Bad request',
    //               error: e };
    //     } else {
    //         e = { status: 500, content: { message: 'Internal server error' }};
    //     }

    //     let msg = JSON.stringify(e.content, null, 4);
    //     res.writeHead(e.status, {
    //         'Content-Length': msg.length,
    //         'Content-Type': 'application/json'
    //     });
    //     res.end(msg);
    // }

    close(){
        this.server.close();
    }
};

class WebSocketListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'datagram';
        this.mode = 'server';
    }

    run(){
        this.server = new WebSocket.Server( { port: this.spec.port } );

        this.server.on('error', (e) => {
            log.warn('WebSocketListener.new: Error:', e);
            return;
        });

        try {
            this.server.on('listening', () => {
                log.info('WebSocketListener:',
                         `${this.name} running on port`,
                         `${this.spec.port}`);
            });
        } catch(e){
            log.warn('WebSocketListener.listen: Error:', e);
            return;
        }

        this.server.on('connection',
                       (socket, res) => this.onReq(socket, res));
    }

    async onReq(socket, req){
        log.silly('WebSocketListener.onRequest', `Listener: ${this.name}`);
        var name =
            `WS:${req.connection.remoteAddress}:` +
            `${req.connection.remotePort}::` +
            `${req.connection.localAddress}:` +
            `${req.connection.localPort}-` +
            this.getNewSessionId();

        try {
            var query = url.parse(req.url);
        } catch(e){
            let error = `Could not parse URL: "${req.url}":` + e;
            log.warn('HTTPListener.onReq:', error);
            return;
            // this.end(req, error);
        }

        const duplex =
              WebSocket.createWebSocketStream(socket, {readableObjectMode: true});

        let metadata = {
            name: name,
            IP: {
                src_addr: req.connection.remoteAddress,
                dst_addr: req.connection.localAddress,
            },
            TCP: {
                src_port: req.connection.remotePort,
                dst_port: req.connection.localPort,
            },
            HTTP: {
                version: req.httpVersion,
                method:  req.method || 'ws',
                url:     {
                    url:      req.url,
                    href:     query.href || '',
                    protocol: query.protocol || '',
                    host:     query.host || '',
                    port:     query.port || '',
                    path:     query.path || '',
                    query:    query.query || '',
                },
                headers: req.headers,
            },
        };

        // await this.router({
        //     metadata: metadata,
        //     listener: { origin: this.name, stream: duplex },
        //     priv: { socket: socket, req: req, end: this.end },
        // });

        // this.emit('emit', this.getSession(metadata, duplex,
        //                                   { req: req, res: res }));
        await this.emitSession(metadata, duplex, { req: req, res: res });
    }

    // end(s, e){
    //     log.info('WebSocketListener:', 'end');
    //     // 1011: Internal Error: The server is terminating the
    //     // connection because it encountered an unexpected condition
    //     // that prevented it from fulfilling the request.
    //     s.priv.socket.close(1011, e.toString());
    // }

    close(){
        this.server.close();
    }
};

class UDPListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'datagram';
        // for singleton mode, we need both remote addr and port
        if(l.spec.connect && l.spec.connect.address && l.spec.connect.port){
            this.mode       = 'singleton';
            this.connection = l.spec.options && l.spec.options.connection ?
                l.spec.options.connection : 'immediate';
            this.reuseaddr  = this.connection === 'ondemand';
            log.info('UDPListener:', 'Singleton/Connected mode: remote:',
                     `${this.spec.connect.address}:${this.spec.connect.port},`,
                     `options.connection=${this.connection}`);
        } else {
            this.mode       = 'server';
            this.reuseaddr  = true;
            this.connection = 'ondemand';
            log.info('UDPListener:', 'Server/Unconnected mode');
        }

        this.local_address  = this.spec.address || '0.0.0.0';
        this.local_port     = this.spec.port || -1;
        this.onConn         = this.onConnect.bind(this);

        this.socket = udp.createSocket({type: 'udp4',
                                        reuseAddr: this.reuseaddr});
        // eventDebug(this.socket);
    }

    run(){
        if(this.mode === 'singleton')
            return this.run_singleton();
        else
            return this.run_server();
    }

    async run_singleton(){
        log.silly('UDPListener:run_singleton', `"${this.name}"`);

        try {
            // emits socket.error if fails
            this.socket.bind({ port: this.local_port,
                               address: this.local_address });
            await pEvent(this.socket, 'listening',
                         { rejectionEvents: ['close', 'error'] });
        } catch(e){
            throw new Error(`UDPListener.run_singleton: "${this.name}": `,
                            `Could not bind to `+
                            `${this.local_address}:${this.local_port}`);
        }

        log.verbose('UDPListener:run_singleton', `"${this.name}:"`,
                    `bound to ${this.local_address}:${this.local_port}`);

        // immediate: piggyback on the listener's socket
        let connection = {
            socket:         this.socket,
            local_address:  this.local_address,
            local_port:     this.local_port,
            remote_address: this.spec.connect.address,
            remote_port:    this.spec.connect.port,
        };

        try{
            this.socket.connect(connection.remote_port,
                                connection.remote_address);
            await pEvent(this.socket, 'connect',
                         { rejectionEvents: ['close', 'error'] });
        } catch(e){
            throw new Error(`UDPListener.run_singleton: "${this.name}"/${this.connection}: `+
                            `Could not connect to `+
                            `${connection.remote_address}:`+
                            `${connection.remote_port}`);
        }

        log.verbose(`UDPListener.run_singleton: "${this.name}"/${this.connection}`,
                    `connected to remote`,
                    `${connection.remote_address}:`+
                    `${connection.remote_port} on`,
                    `${connection.local_address}:`+
                    `${connection.local_port}`);

        if(this.connection === 'ondemand'){
            this.socket.on('message', this.onConn);
        } else {
            return this.onRequest(connection);
        }
    }

    async run_server(){
        log.silly('UDPListener:run_server', `"${this.name}"`);

        try {
            // emits socket.error if fails
            this.socket.bind({ port: this.local_port,
                               address: this.local_address });
            await pEvent(this.socket, 'listening',
                         { rejectionEvents: ['close', 'error'] });
        } catch(e){
            throw new Error(`UDPListener.run_server: "${this.name}: "`+
                            `Could not bind to `+
                            `${this.local_address}:${this.local_port}`);
        }

        log.verbose('UDPListener:run_server', `"${this.name}:"`,
                    `bound to ${this.local_address}:${this.local_port}`);

        this.socket.on('message', this.onConn);
    }

    // ondemand!
    async onConnect(msg, rinfo){
        if(rinfo && this.mode === 'singleton' && (
            rinfo.address !== this.spec.connect.address ||
                rinfo.port !== this.spec.connect.port)){
            let e = 'UDPListener:onConnect: Singleton/connected mode: '+
                `"${this.name}:" packet received from unknown peer: `+
                `${rinfo.address}:${rinfo.port}, expecting `+
                `${this.spec.connect.address}:${this.spec.connect.port}`;
            throw new Error(e);
        }

        log.verbose('UDPListener.onConnect: new connection from',
                    `${rinfo.address}:${rinfo.port}`);

        if(this.mode === 'singleton' && this.connection === 'ondemand'){
            var socket = this.socket;
            socket.removeListener("message", this.onConn);
        } else {
            // server mode: a new socket for this connection
            var socket = udp.createSocket({type: 'udp4',
                                           reuseAddr: this.reuseaddr});
            // eventDebug(socket);
            try {
                // emits socket.error if fails
                socket.bind({ port: this.local_port,
                              address: this.local_address });
                await pEvent(socket, 'listening',
                             { rejectionEvents: ['close', 'error'] });
            } catch(e){
                throw new Error(`UDPListener.onConnect: "${this.name}"/server: `,
                                `Could not bind to `+
                                `${this.local_address}:${this.local_port}`);
            }
        }

        let connection = {
            socket:         socket,
            local_address:  this.local_address,
            local_port:     this.local_port,
            remote_address: rinfo.address,
            remote_port:    rinfo.port,
            msg:            msg,
            rinfo:          rinfo,
        };

        if(this.mode === 'server'){
            try{
                connection.socket.connect(connection.remote_port,
                                          connection.remote_address);
                await pEvent(connection.socket, 'connect',
                             { rejectionEvents: ['close', 'error'] });

                log.verbose(`UDPListener.onConnect: "${this.name}"`,
                            `connected to remote`,
                            `${connection.remote_address}:`+
                            `${connection.remote_port} on`,
                            `${connection.local_address}:`+
                            `${connection.local_port}`);
            } catch(e){
                throw new Error('UDPListener.onConnect: '+
                                `"${this.name}:" `+
                                `Could not connect to `+
                                `${connection.remote_address}:`+
                                `${connection.remote_port}`);
            }
        }

        return this.onRequest(connection);
    }

    async onRequest(conn){
        log.silly('UDPListener.onRequest', `Listener: ${this.name}`);

        var name =
            `UDP:${conn.remote_address}:${conn.remote_port}::` +
            `${conn.local_address}:${conn.local_port}-` +
            this.getNewSessionId();

        conn.stream = new utils.DatagramStream(conn.socket);
        let metadata = {
            name: name,
            IP: {
                src_addr: conn.remote_address,
                dst_addr: conn.local_address,
            },
            UDP: {
                src_port: conn.remote_port,
                dst_port: conn.local_port,
            },
        };

        if(conn.msg)
            conn.socket.emit('message', conn.msg, conn.rinfo);

        await this.emitSession(metadata, conn.stream);
        // this.emit('emit', this.getSession(metadata, conn.stream));
        // await this.router({
        //     metadata: metadata,
        //     listener: { origin: this.name, stream: conn.stream },
        // });
    }

    // do not close session, ie, this.socket for singleton/immediate
    close(){
        if(this.mode === 'server' ||
           (this.mode === 'server' && this.connection === 'ondemand')){
            this.socket.close();
            this.socket.unref();
        }
    }
};

class NetServerListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'byte-stream';
        this.mode = 'server';
    }

    run(){
        this.server = net.createServer();

        this.server.on('error', (e) => {
            log.warn('NetServerListener.new: Error:', e);
            return;
        });

        this.server.on('connection', (socket) => this.onReq(socket));
        this.server.listen(this.protocol === 'TCP' ?
                           { port: this.spec.port} :
                           { path: this.spec.filename}, () => {
                               log.silly('NetServerListener:',
                                         `Listener: ${this.name}:`,
                                         `protocol: ${this.protocol}:`,
                                         `Listening on`,
                                         this.protocol === 'TCP' ?
                                         `${this.server.address().address}:`+
                                         `${this.server.address().port}` :
                                         this.server.address());
                           });

        // cleanup on exit
        if(this.protocol === 'UnixDomainSocket')
            l7mp.cleanup.push(this.spec.filename);
    }

    async onReq(socket){
        log.silly('NetServerListener.onRequest:', `Listener: ${this.name}:`,
                 `protocol: ${this.protocol}`);

        var name = this.protocol === 'TCP' ?
            `TCP:${socket.remoteAddress}:` +
            `${socket.remotePort}::` +
            `${socket.address().address}:` +
            `${socket.address().port}` :
            `UNIX:${this.name}-` + this.getNewSessionId();

        let metadata = this.protocol === 'TCP' ?
            {
                name: name,
                IP: {
                    src_addr: socket.remoteAddress,
                    dst_addr: socket.address().address,
                },
                TCP: {
                    src_port: socket.remotePort,
                    dst_port: socket.address().port,
                },
            } :
            {
                name: name,
                UNIX: {
                    filename: this.localAddress
                },
            };

        this.emitSession(metadata, socket);
        // this.emit('emit', this.getSession(metadata, socket));
        // await this.router({
        //     metadata: metadata,
        //     listener: { origin: this.name, stream: socket },
        // });
    }

    close(){
        this.server.close();
        this.server.unref();
    }
};

// 1. create transport
// 2. wait for first packet
// 3. if not a proper JSONSocket header, drop
// 4. accept header, send response, emit a new session, set metadata from the JSONSocket header
// WARNING: ineacivity timeout is NOT IMPLEMENTED
class JSONSocketListener extends Listener {
    constructor(l){
        super(l);

        // 1. create transport
        let li = {
            name: this.name + '-transport-listener',
            spec: l.spec.transport_spec || l.spec.transport,
        };
        if(!li.spec){
            let e = 'JSONSocketListener: No transport specified';
            log.warning(e);
            throw new Error(e);
        }
        this.transport = Listener.create(li);
        this.type = this.transport.type;

        log.info('JSONSocketListener:', `${this.name} initialized, using transport:`,
                 dumper(this.transport.spec, 2));
    }

    run(){
        log.info('JSONSocketListener.run');
        // this.transport.on('emit', this.onSession.bind(this));
        this.transport.emitter = this.onSession.bind(this);
        this.transport.run();
        // eventDebug(socket);
    }

    close(){
        log.info('JSONSocketListener.close');
        this.transport.close();
    }

    // WARNING: we may lose the JSON header here when the transport (e.g., UDP) re-emits the packet
    // using setImmediate();
    async onSession(s){
        log.silly('JSONSocketListener:', `${this.name}:`, `New connection request: "${s.metadata.name}"`);
        let m = s.metadata;
        let l = s.source;

        // 2. wait for first packet: stream should be in object mode so we should be able to read
        // the entire "JSON header" in one shot
        let data = await pEvent(l.stream, 'data', {
            rejectionEvents: ['close', 'error'],
            multiArgs: false, // TODO: support TIMEOUT: timeout: this.timeout
        });

        log.silly('JSONSocketListener:', `${this.name}:`,
                  `Received packet, checking for JSON header`);

        // warn if we are not in object mode
        if(typeof data !== 'object' ||
           !(l.stream.readableObjectMode || l.stream.writableObjectMode))
            log.warn('JSONSocketListener:', `${this.name}:`,
                     `Transport is not message-based, JSON header may be fragmented`);

        try {
            var header = JSON.parse(data);
        } catch(e){
            log.warn('JSONSocketListener:', `${this.name}:`,
                     `Invalid JSON headers`);
            l.stream.end(JSON.stringify({
                JSONSocketVersion: 1,
                JSONSocketStatus: 400,
                JSONSocketMessage: "Bad Request: Invalid JSON request header",
            }));
            return;
        }

        // 3. if not a proper JSONSocket header, drop
        if(typeof header['JSONSocketVersion'] === 'undefined'){
            log.warn('JSONSocketListener:', `${this.name}:`,
                     `No JSONSocket version info in header:`, dumper(header,5));
            l.stream.end(JSON.stringify({
                JSONSocketVersion: 1,
                JSONSocketStatus: 400,
                JSONSocketMessage: "Bad Request: No JSONSocket version in request header",
            }));
            return;
        }
        let version = header['JSONSocketVersion'];

        if(typeof version != "number" || !Number.isInteger(version)) {
            log.warn('JSONSocketListener:', `${this.name}:`,
                     `JSONSocket version info is not numeric/integer in header:`,
                     dumper(header,5));
            l.stream.end(JSON.stringify({
                JSONSocketVersion: 1,
                JSONSocketStatus: 400,
                JSONSocketMessage: "Bad Request: Invalid JSONSocket version",
                }));
            return;
        }

        if(version < 0 || version > 1) {
            log.warn('JSONSocketListener:', `${this.name}:`,
                     `Unsupported JSONSocket version in header:`,
                     dumper(header,5));
            l.stream.end(JSON.stringify({
                JSONSocketVersion: 1,
                JSONSocketStatus: 505,
                JSONSocketMessage: "JSONSocket Version Not Supported",
            }));
            return;
        }

        log.silly('JSONSocketListener:', `${this.name}:`,
                  `Accepting connection with JSONSocket header`, dumper(header,5));

        // 4. accept header, send response, emit a new session, set metadata from the
        // JSONSocket header

        m.name = `JSONSocket:${this.name}-` + this.getNewSessionId();
        if(m['JSONSocket'])
            log.warn('JSONSocketListener:', `${this.name}:`,
                     `Will overwrite metadata in transport session`);
        m['JSONSocket'] = header;
        l.origin = this.name;

        await this.emitSession(m, l.stream, {res: l.stream, error: this.error});

        // ack
        l.stream.write(JSON.stringify({
            JSONSocketVersion: 1,
            JSONSocketStatus: 200,
            JSONSocketMessage: "OK",
        }));
    }

    error(priv, err){
        priv.res.write(JSON.stringify({
            JSONSocketVersion: 1,
            JSONSocketStatus: err.status,
            JSONSocketMessage: err.message
        }));
    }

        // this.emit('emit', this.getSession(
        //     m, l.stream, {res: l.stream, setResponseHeader: this.setResponseHeader}));

        // // and emit new session
        // this.router({
        //     metadata: m,
        //     listener: { origin: this.name, stream: l.stream },
        // }).then( (res) => {
        //     l.stream.write(JSON.stringify({
        //         JSONSocketVersion: 1,
        //         JSONSocketStatus: 200,
        //         JSONSocketMessage: "OK",
        //     }))
        // },
        //          (err) => {
        //              l.stream.write(JSON.stringify({
        //                  JSONSocketVersion: 1,
        //                  JSONSocketStatus: err.status,
        //                  JSONSocketMessage: err.message,
        //              }))
        //          });

        // Do not reemit header!: setImmediate(() => { l.stream.emit("data", chunk); });
};

Listener.create = (l) => {
    log.silly('Listener.create', dumper(l, 8));
    let protocol = l.spec.protocol;
    switch(protocol){
    case 'HTTP':             return new HTTPListener(l);
    case 'WebSocket':        return new WebSocketListener(l);
    case 'UDP':              return new UDPListener(l);
    case 'TCP':              return new NetServerListener(l);
    case 'UnixDomainSocket': return new NetServerListener(l);
    case 'JSONSocket':       return new JSONSocketListener(l);
    case 'Test':             return new TestListener(l);
    default:
        let err = 'Listener.create:'+ `Unknown protocol: "${protocol}"`;
        log.warn(err);
        throw new Error(err);
    }
}

module.exports.Listener = Listener;
