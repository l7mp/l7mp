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
const WebSocket    = require('ws');
const http         = require('http');
const udp          = require('dgram');
const url          = require('url');
const EventEmitter = require('events').EventEmitter;
const util         = require('util');
const miss         = require('mississippi');
const eventDebug   = require('event-debug')

const StreamCounter = require('./stream-counter.js').StreamCounter;
const utils         = require('./utils.js');

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
    }

    getNewSessionId() { return this.sessionId++; }

    toJSON(){
        log.silly('Listener.toJSON', `"${this.name}"`);
        return {
            name:     this.name,
            spec:     this.spec,
            rules:    this.rules
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

        try {
            var query = url.parse(req.url);
        } catch(e){
            let error = `Could not parse URL: "${req.url}":` + e;
            this._reject(res, error);
            return req.destroy(error);
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
            status: 'CONNECT',
        };

        let listener = {  // immutable
            origin: this,
            stream: miss.duplex(res, req, {objectMode: false})
        };

        var priv = { req: req, res: res };
        this.emit('connection', metadata, listener, priv);
    }

    reject(s, e){ this._reject(s.priv.res, e); }
    _reject(res, e) {
        res.writeHead(404, {
            'Content-Length': e.length,
            'Content-Type': 'text/plain'
        });
        res.end(e);
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
                       (req, res) => this.onReq(req, res));
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
            this._reject(req, error);
            return req.destroy(error);
        }

        const duplex =
              WebSocket.createWebSocketStream(socket, {readableObjectMode: true});

        let metadata = {
            name: name,
            IP: {
                src_addr: req.connection.localAddress,
                dst_addr: req.connection.remoteAddress,
            },
            TCP: {
                src_port: req.connection.localPort,
                dst_port: req.connection.remotePort,
            },
            HTTP: {
                version: req.httpVersion,
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
            status: 'CONNECT',
        };

        let listener = {
            origin: this,
            stream: duplex
        };

        var priv = { socket: socket, req: req };
        this.emit('connection', metadata, listener, priv);
    }

    reject(s, e){
        log.info('WebSocketListener:', 'reject');
        // 1011: Internal Error: The server is terminating the
        // connection because it encountered an unexpected condition
        // that prevented it from fulfilling the request.
        s.priv.socket.close(1011, e.toString());
    }
};

class UDPSingletonListener extends Listener {

    // unconnected mode: bind socket, wait for the first packet, use
    // the source IP and source port as remote, connect back to this
    // remote, create a stream
    // connected mode: bind socket, wait for the first packet whose
    // remote address and port match, connect back to the remote,
    // create a stream
    constructor(l){
        super(l);
        if(this.stream)
            log.error('UDPSingletonListener', 'Listener already connected');
        this.type = 'datagram';
        this.mode = 'singleton';

        this.connected = false;
        if(l.spec.connect && l.spec.connect.address && l.spec.connect.port){
            this.connected      = true;
            this.remote_address = this.spec.connect.address;
            this.remote_port    = this.spec.connect.port;
            log.info('UDPSingletonListener:', 'Connected mode: remote:',
                     `${this.remote_address}:${this.remote_port}`);
        }

        this.local_address  = this.spec.address || '0.0.0.0';
        this.local_port     = this.spec.port || -1;

        var socket = udp.createSocket({type: 'udp4', reuseAddr: true});

        // eventDebug(socket);

        // socket.once('listening', () => {
        //     setImmediate(() => {
        //         socket.emit('listening');
        //     })});

        // socket.once('listening', () => {
        //     log.silly('UDPSingletonListener:', `"${this.name}" listening`);
        // });

        this.socket = socket;

        socket.bind({
            port: this.local_port,
            address: this.local_address,
            exclusive: false
        }, () => {
            log.silly('UDPSingletonListener:', `"${this.name}" bound to`,
                      `${this.local_address}:${this.local_port}`);

            this.onConn = this.onConnect.bind(this);
            socket.on('message', this.onConn);
        });
    }

    onConnect(msg, rinfo){
        if(this.connected){
            if(rinfo.address !== this.remote_address ||
               rinfo.port !== this.remote_port){
                log.warn('UDPSingletonListener:onConnect:', `"${this.name}:"`,
                         `packet received from unknown peer:`,
                         `${rinfo.address}:${rinfo.port}, expecting`,
                         `${this.remote_address}:${this.remote_port}`);
                return;
            }
        } else {
            // use packet source IP:port are remote
            this.remote_address = rinfo.address;
            this.remote_port = rinfo.port;
        }

        log.info('UDPSingletonListener:onConnect:', `"${this.name}:"`,
                 `packet received, connecting to peer:`,
                 `${rinfo.address}:${rinfo.port}`);

        var self = this;
        let socket = this.socket;

        // stop accepting packets
        socket.removeListener("message", this.onConn);

        socket.connect(this.remote_port, this.remote_address,
                       () => {
                           log.silly(`UDPSingletonListener: "${this.name}"`,
                                     `connected for remote`,
                                     `${this.remote_address}:`+
                                     `${this.remote_port} on`,
                                     `${this.local_address}:`+
                                     `${this.local_port}`);

                           self.stream =
                               new utils.DatagramStream(socket);

                           self.stream.once('listening', () => {
                               // reemit message event
                               socket.emit('message', msg, rinfo);
                               self.onRequest();
                           });

                           setImmediate(() => {
                               socket.emit('listening');
                           });
                       });
    }

    onRequest(){
        log.silly('UDPSingletonListener.onRequest', `Listener: ${this.name}`);

        var name =
            `UDPsingleton:${this.remote_address}:${this.remote_port}::` +
            `${this.local_address}:${this.local_port}-` +
            this.getNewSessionId();

        let metadata = {
            name: name,
            IP: {
                src_addr: this.remote_address,
                dst_addr: this.local_address,
            },
            UDP: {
                src_port: this.remote_port,
                dst_port: this.local_port,
            },
            status: 'CONNECT',
        };

        let listener = {
            origin: this,
            stream: this.stream,
        };

        this.emit('connection', metadata, listener);
    }

    reject(s, e){ this.socket.close(); }
};

Listener.create = (l) => {
    log.silly('Listener.create', dumper(l, 8));
    let protocol = l.spec.protocol;
    switch(protocol){
    case 'HTTP':          return new HTTPListener(l);
    case 'WebSocket':     return new WebSocketListener(l);
    case 'UDP':           log.warn('Listener.create:', 'UDP listener:',
                                   'falling back to UDPSingleton');
    case 'UDPSingleton':  return new UDPSingletonListener(l);
    default:  log.error('Listener.create',
                        `Unknown protocol: "${protocol}"`);
    }
}

module.exports.Listener = Listener;
