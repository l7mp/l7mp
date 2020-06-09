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

const StreamCounter = require('./stream-counter.js').StreamCounter;
const utils         = require('./stream.js');

// for get/setAtPath()
const Rule          = require('./rule.js').Rule;

class Listener {
    constructor(l){
        this.protocol  = l.spec.protocol;
        this.name      = l.name;
        this.spec      = l.spec;
        this.rules     = [];
        this.type      = "";
        this.sessionId = 0;
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

}

// Inherit from EventEmitter: roughly equivalent to:
// Listener.prototype = Object.create(EventEmitter.prototype)
util.inherits(Listener, EventEmitter);

class HTTPListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'session';
        this.mode = 'server';
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

    onReq(req, res){
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

        this.emit('emit', {
            metadata: metadata,
            listener: { origin: this.name, stream: stream },
            priv: { req: req, res: res, end: this.end },
        });

    }

    // if we receive an object or empty msg: normal end, jsonify 7 send msg if any
    // anything else is an error
    end(s, e){
        log.silly('HTTPListener.end');
        let res = s.priv.res;

        if(!e){
            e = { status: 200, content: { message: 'OK'} };
        } else if(e instanceof Error){
            e.status = e.status || 500;
            e.content = { message: 'Internal server error',
                          error: e.message };
        } else if(e && typeof e === 'object'){
            e.status = e.status || 400;
            e.content = e.content ||
                { message: 'Bad request',
                  error: e };
        } else {
            e = { status: 500, content: { message: 'Internal server error' }};
        }

        let msg = JSON.stringify(e.content, null, 4);
        res.writeHead(e.status, {
            'Content-Length': msg.length,
            'Content-Type': 'application/json'
        });
        res.end(msg);
    }
};

class WebSocketListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'datagram';
        this.mode = 'server';
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

    onReq(socket, req){
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
            this.end(req, error);
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

        this.emit('emit', {
            metadata: metadata,
            listener: { origin: this.name, stream: duplex },
            priv: { socket: socket, req: req, end: this.end },
        });
    }

    end(s, e){
        log.info('WebSocketListener:', 'end');
        // 1011: Internal Error: The server is terminating the
        // connection because it encountered an unexpected condition
        // that prevented it from fulfilling the request.
        s.priv.socket.close(1011, e.toString());
    }
};

class UDPListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'datagram';
        // for singleton mode, we need both remote addr and port
        if(l.spec.connect && l.spec.connect.address && l.spec.connect.port){
            this.mode       = 'singleton';
            this.reuseaddr  = this.spec.options && this.spec.options.reuseaddr ?
                this.spec.options.reuseaddr : true;
            this.connection = this.reuseaddr ? 'immediate' :
                (this.spec.options.connection || 'immediate');
            log.info('UDPListener:', 'Singleton/Connected mode: remote:',
                     `${this.spec.connect.address}:${this.spec.connect.port},`,
                     `reuseaddr=${this.reuseaddr}`);
        } else {
            this.mode       = 'server';
            this.reuseaddr  = true;
            this.connection = 'ondemand';
            log.info('UDPListener:', 'Server/Unconnected mode:',
                     `reuseaddr=${this.reuseaddr}`);
        }

        this.local_address  = this.spec.address || '0.0.0.0';
        this.local_port     = this.spec.port || -1;

        var socket = udp.createSocket({type: 'udp4',
                                       reuseAddr: this.reuseaddr});

        // eventDebug(socket);

        this.socket = socket;
        socket.bind(
            { port: this.local_port, address: this.local_address },
            () => {
                log.silly('UDPListener:', `"${this.name}" bound to`,
                          `${this.local_address}:${this.local_port}`);

                if(this.mode === 'singleton' &&
                   this.connection === 'immediate'){
                    this.onConnect();
                } else {
                    this.onConn = this.onConnect.bind(this);
                    // after a connection is established for a remote,
                    // we should no longer get new packets from that
                    // connection any more on this socket, so each no
                    // packet received will spark a new connection
                    socket.on('message', this.onConn);
                }
            });
    }

    // without msg/rinfo: connected+immediate mode
    // otherwise we are called from the first packet
    onConnect(msg, rinfo){
        // check source
        if(this.mode === 'singleton'){
            if(rinfo && (
                rinfo.address !== this.spec.connect.address ||
                    rinfo.port !== this.spec.connect.port)){
                log.warn('UDPListener:onConnect: Singleton/connected mode:',
                         `"${this.name}:"`,
                         `packet received from unknown peer:`,
                         `${rinfo.address}:${rinfo.port}, expecting`,
                         `${this.spec.connect.address}:${this.spec.connect.port}`);
                return;
            }

            // piggyback on the listener's socket
            let connection = {
                socket:         this.socket,
                local_address:  this.local_address,
                local_port:     this.local_port,
                remote_address: rinfo ? rinfo.address : this.spec.connect.address,
                remote_port:    rinfo ? rinfo.port : this.spec.connect.port,
                msg:            msg,
                rinfo:          rinfo,
            };

            if(this.connection === 'ondemand'){
                connection.socket.removeListener("message", this.onConn);
                connection.socket.emit('message', msg, rinfo);
            }

            this.socket.connect(connection.remote_port, connection.remote_address,
                                () => {
                               log.info(`UDPListener: "${this.name}"`,
                                        `connected to remote`,
                                        `${connection.remote_address}:`+
                                        `${connection.remote_port} on`,
                                        `${connection.local_address}:`+
                                        `${connection.local_port}`);

                                    this.onRequest(connection);
                                });
        } else {
            // server mode
            if(this.spec.connect && (
                (this.spec.connect.address &&
                 rinfo.address !== this.spec.connect.address) ||
                    (this.spec.connect.port &&
                     rinfo.port !== this.spec.connect.port))){
                log.warn('UDPListener:onConnect: Server/unconnected mode:',
                         `"${this.name}:"`,
                         `packet received from unknown peer:`,
                         `${rinfo.address}:${rinfo.port}, expecting`,
                         `${this.spec.connect.address || '<ANY>'}`+
                         `${this.spec.connect.port || '<ANY>'}`);
                return;
            }

            // a new socket for this connection
            let socket = udp.createSocket({type: 'udp4',
                                       reuseAddr: this.reuseaddr});
            // eventDebug(socket);
            socket.bind(
                { port: this.local_port, address: this.local_address },
                () => {

                    let connection = {
                        socket:         socket,
                        local_address:  this.local_address,
                        local_port:     this.local_port,
                        remote_address: rinfo.address,
                        remote_port:    rinfo.port,
                        msg:            msg,
                        rinfo:          rinfo,
                    };

                    socket.connect(rinfo.port, rinfo.address,
                           () => {
                               log.info(`UDPListener: "${this.name}"`,
                                        `new connection for remote`,
                                        `${connection.remote_address}:`+
                                        `${connection.remote_port} on`,
                                        `${connection.local_address}:`+
                                        `${connection.local_port}`);

                               setImmediate(() => {
                                   socket.emit('message', msg, rinfo);
                               });
                               this.onRequest(connection);
                           });
                });
        }
    }

    onRequest(conn){
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

        this.emit('emit', {
            metadata: metadata,
            listener: { origin: this.name, stream: conn.stream },
        });
    }

};

class NetServerListener extends Listener {
    constructor(l){
        super(l);
        this.type = 'byte-stream';
        this.mode = 'server';
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

    onReq(socket){
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

        this.emit('emit', {
            metadata: metadata,
            listener: { origin: this.name, stream: socket },
        });
    }
};

// class JSONSocketListener extends Listener {
//     constructor(l){
//         super(l);
//         this.type = 'datagram';
//         let li = {
//             name: this.name + '-embedded_listener',
//             spec: l.spec.transport_spec,
//         };
//         if(!li.spec)
//             log.error('JSONSocketListener:', 'No transport specified');
//         this.transport = Listener.create(li);

//         log.info('JSONSocketListener:', `${this.name} initialized`);

//         this.transport.on('emit', (m, l, p) => this.onSession(m, l, p));
//         // eventDebug(socket);
//     }

//     onSession(m, l, p){
//         log.info('JSONSocketListener:', `${this.name}:`,
//                  `New connection request: "${m.name}"`);
//         // stream should be in object mode so we should be able to
//         // read the entire "JSON header" in one shot
//         l.stream.once('data', (chunk) => {
//             if(typeof chunk !== 'object')
//                 log.warn('JSONSocketListener:', `${this.name}:`,
//                          `Transport is not message based, JSON header`,
//                          `may be fragmented`);
//             try {
//                 var header = JSON.parse(chunk);
//             } catch(e){
//                 log.warn('JSONSocketListener:', `${this.name}:`,
//                          `Invalid JSON header, dropping connection`);
//                 l.stream.destroy();
//                 return;
//             }

//             if(typeof header.metadata === 'undefined'){
//                 log.warn('JSONSocketListener:', `${this.name}:`,
//                          `Empty metadata in header:`, dumper(header,5));
//                 l.stream.destroy();
//                 return;
//             }

//             for(let q of this.spec.parse){
//                 if(!q.path){
//                     log.warn('JSONSocketListener:', `${this.name}:`,
//                              `Invalid parse path`);
//                     return;
//                 }

//                 let value = Rule.getAtPath(header.metadata, q.path);
//                 if(typeof value === 'undefined'){
//                     log.warn('JSONSocketListener:', `${this.name}:`,
//                              `Empty field in JSON header for query`,
//                              `"${q.path}"`);
//                     continue;
//                 }
//                 let target = q.target || q.path;
//                 Rule.setAtPath(m, target, value)
//             }

//             l.origin = this;
//             m.name = `JSONSocket:${this.name}-` + this.getNewSessionId();

//             // reemit chunk
//             setImmediate(() => { l.stream.emit("data", chunk); });

//             // and emit new session
//             this.emit('emit', m, l, {});
//         });
//     }

//     end(s, e){ /*ignore*/ };
// };

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
    default:  log.error('Listener.create',
                        `Unknown protocol: "${protocol}"`);
    }
}

module.exports.Listener = Listener;
