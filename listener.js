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
            status: 'INIT',
        };

        let listener = {  // immutable
            origin: this,
            stream: stream,
        };

        var priv = { req: req, res: res };
        this.emit('emit', metadata, listener, priv);
    }

    end(s, e){
        let res = s.priv.res;
        this.finalize(res, e);
    }

    finalize(res, e){
        // dump(e, 3);
        if(typeof e === 'string' && e)
            e = { status: 400,
                  content: { message: 'Bad request',
                             error: e } };
        else if(typeof e === 'object' && e)
        {} // do nothing
        else
            e = { status: 500,
                  content: {
                      message: 'Internal Server Error' } };
        // dump(e);
        let msg = JSON.stringify(e.content, null, 4);
        // dump(msg);

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
            status: 'INIT',
        };

        let listener = {
            origin: this,
            stream: duplex
        };

        var priv = { socket: socket, req: req };
        this.emit('emit', metadata, listener, priv);
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
    // unconnected mode:
    // bind socket, wait for the first packet, use the source IP and
    // source port as remote, connect back to this remote, create a
    // stream
    // connected mode:
    // reuseaddr=true: bind socket, immediately connect back to the
    // remote, create a stream
    // reuseaddr=false: bind socket, wait for the first received
    // packet and if source IP/port is OK, then connect back to the
    // remote, create a stream
    constructor(l){
        super(l);
        if(this._stream)
            log.error('UDPListener', 'Listener already connected');
        this.type = 'datagram';
        this.mode = 'singleton';

        this.connected = false;
        this.reuseaddr = this.spec.reuseaddr || true;
        // at least a source IP or port must be specified for connected mode
        if(l.spec.connect && (l.spec.connect.address || l.spec.connect.port)){
            this.connected      = true;
            this.remote_address = this.spec.connect.address;
            this.remote_port    = this.spec.connect.port;
            log.info('UDPListener:', 'Connected mode: remote:',
                     `${this.remote_address || '<ANY>'}:${this.remote_port || '<ANY>'}`);
        }

        this.local_address  = this.spec.address || '0.0.0.0';
        this.local_port     = this.spec.port || -1;

        var socket = udp.createSocket({type: 'udp4', reuseAddr: this.reuseaddr});

        // eventDebug(socket);

        // socket.once('listening', () => {
        //     setImmediate(() => {
        //         socket.emit('listening');
        //     })});

        // socket.once('listening', () => {
        //     log.silly('UDPListener:', `"${this.name}" listening`);
        // });

        this.socket = socket;

        socket.bind({
            port: this.local_port,
            address: this.local_address,
            exclusive: false
        }, () => {
            log.silly('UDPListener:', `"${this.name}" bound to`,
                      `${this.local_address}:${this.local_port}`);

            if(this.connected && this.reuseaddr){
                this.onConnect();
            } else {
                this.onConn = this.onConnectMsg.bind(this);
                socket.once('message', this.onConn);
            }
        });
    }

    onConnectMsg(msg, rinfo){
        // if we are here, reuseaddr=false
        if(this.connected){
            if((this.remote_address && rinfo.address !== this.remote_address) ||
               (this.remote_port && rinfo.port !== this.remote_port)){
                log.warn('UDPListener:onConnect:', `"${this.name}:"`,
                         `packet received from unknown peer:`,
                         `${rinfo.address}:${rinfo.port}, expecting`,
                         `${this.remote_address}:${this.remote_port}`);
                return;
            }
        }

        log.warn('UDPListener:onConnectMsg:', `"${this.name}:"`,
                 `packet received from peer:`,
                 `${rinfo.address}:${rinfo.port}: connecting`);
        this.remote_address = rinfo.address;
        this.remote_port = rinfo.port;
        this.socket.removeListener("message", this.onConn);
        this.onConnect(msg, rinfo);
    }

    onConnect(msg, rinfo){
        let socket = this.socket;

        // stop accepting packets
        socket.connect(this.remote_port, this.remote_address,
                       () => {
                           this.remote_address = socket.remoteAddress().address;
                           this.remote_port    = socket.remoteAddress().port;

                           log.silly(`UDPListener: "${this.name}"`,
                                     `connected for remote`,
                                     `${this.remote_address}:`+
                                     `${this.remote_port} on`,
                                     `${this.local_address}:`+
                                     `${this.local_port}`);

                           this.stream =
                               new utils.DatagramStream(socket);

                           this.socket.once('listening', () => {
                               // reemit message event
                               if(msg && rinfo)
                                   this.socket.emit('message', msg, rinfo);
                               this.onRequest();
                           });

                           setImmediate(() => {
                               socket.emit('listening');
                           });
                       });
    }

    onRequest(){
        log.silly('UDPListener.onRequest', `Listener: ${this.name}`);

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
            status: 'INIT',
        };

        let listener = {
            origin: this,
            stream: this.stream,
        };

        this.emit('emit', metadata, listener);
    }

    end(s, e){ try { this.socket.close(); } catch(e) {/*ignore*/} }
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
                status: 'INIT',
            } :
            {
                name: name,
                UNIX: {
                    filename: this.localAddress
                },
                status: 'INIT',
            };

        let listener = {
            origin: this,
            stream: socket,
        };

        this.emit('emit', metadata, listener, {});
    }

    end(s, e){
        log.info('NetServerListener: end:', e ? e.message : 'No error');
        s.listener.stream && s.listener.stream.end();
    }
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
    default:  log.error('Listener.create',
                        `Unknown protocol: "${protocol}"`);
    }
}

module.exports.Listener = Listener;
