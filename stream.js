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

const log         = require('npmlog');
const util        = require('util');

const stream_pipe = require('stream').prototype.pipe;
const { Duplex, PassThrough }  = require('stream');
const duplex3     = require("duplexer2");
const miss        = require('mississippi');
const eventDebug  = require('event-debug');

class DatagramStream extends Duplex {
    constructor(socket, options){
        super({
            ...options,
            autoDestroy: false,
            emitClose: false,
            // objectMode: false,
            objectMode: true,
            // readableObjectMode: false,
            // writableObjectMode: false
        });
        this.drops  = 0;

        // check if socket is properly connected
        try {
            this.remote = socket.remoteAddress();
        } catch(e) {
            throw 'DatagramStream: Cannot create a stream for an unconnected '+
                'socket: '+ e;
        }

        // event handlers

        // datagram streams have no flow control: if we cannot push msg we
        // must drop it
        socket.on('message', (msg, rinfo) => {
            // msg.rinfo = rinfo;
            log.silly('DatagramStream.onmessage:',
                      `rinfo: ${dumper(rinfo)}: ${msg}`);

            if(!this.push(msg))
                log.verbose('DatagramStream.onmessage: Dropping message:',
                            `rinfo: ${dumper(rinfo)}: ${msg}`);
        });

        socket.once('listening', () => {
            this.emit('listening');
        });

        // we cannot get 'connect' anymore, socket is already
        // connected

        socket.on('error', (e) => {
            log.silly('DatagramStream.onerror:',
                      e.message || dumper(e));
            this.emit('error', e);
        });

        socket.on('close', () => {
            log.silly('DatagramStream.onclose');
            this.emit('close');
        });

        this.socket = socket;
    }

    _read() {
        // empty
    };

    _write(message, encoding, callback) {
        // if (typeof message === "string")
        //     message = Buffer.from(message, encoding);
        // if(!Buffer.isBuffer(message))
        //     message = new Buffer(message);

        if (! (message instanceof Buffer) )
            message = Buffer.from(message, encoding);

        log.silly('DatagramStream._write:', `${this.remote.address}:`+
                  `${this.remote.port}:`,`${message}`);

        this.socket.send(message, 0, message.length);

        callback();
    };

    // net.socket has destroy/end, dgram.socket has close... why???
    destroy(){ this.end(); }

    end(msg){
        setImmediate( () => {
            if(msg)this.socket.send(msg);
            this.socket.emit('end');
            try{this.socket.close()}catch(e){/*nop*/};
        });
    }
};


//          port1
//         +--------+
// --------> input ------------+       port2
//         |        |          |     +--------+
// <-------- output <----+------------- input <---------
//         +--------+    |     |     |        |
//                       |     +-----> output--------->
//                       |     |     +--------+
//                       |     |
//                   +---|-----V----+
//                   | input output |port3
//                   +---A-----|----+
//                       |     |
//                       |     |
//                       |     V
class BroadcastStream {
    constructor(){
        this.ports = [];
        return this;
    }

    // key is a transparent id
    add(key) {
        log.silly(`BroadcastStream.add: adding key: "${key}"`);
        let input  = new PassThrough({objectMode: true});
        // eventDebug(input, `${key}: input`);
        let output = new MergeStream();
        // eventDebug(output, `${key}: output`);

        // propagate errors from input/output to port
        let port   = duplex3({readableObjectMode: true, writableObjectMode: true,
                              bubbleErrors: true}, input, output);
        // eventDebug(output, `${key}: port`);

        this.ports.push( {port: port, input: input, output: output, key: key} );


        port.once('end', () => {
            log.silly(`BroadcastStream.end on port ${key}`);
            this.remove(key);
        });
        port.once('error', (e) => {
            log.silly(`BroadcastStream.error on port ${key}:`, e.message);
            this.emit('end');
        });

        // input
        this.ports.forEach( (p) => {
            if(p.key !== key){
                input.pipe(p.output);   // will call merge.add
                // miss.pipe(input, p.output);   // will call merge.add
            }
        });

        // output
        this.ports.forEach( (p) => {
            if(p.key !== key){
                p.input.pipe(output);   // will call merge.add
                // miss.pipe(p.input, output);   // will call merge.add
            }
        });

        return port;
    }

    isEmpty(){
        return this.ports.length == 0;
    }

    remove(k) {
        log.silly(`BroadcastStream.remove: removing key: "${k}"`);
        let i = this.ports.findIndex( ({key}) => key === k );
        if(i >= 0){
            let port   = this.ports[i];
            let input  = port.input;
            let output = port.output;

            // input
            this.ports.forEach( (p) => {
                if(p.key !== k){
                    input.unpipe(p.output);
                }
            });

            // output
            this.ports.forEach( (p) => {
                if(p.key !== k){
                    p.input.unpipe(output);
                }
            });

            // if(port.output.readable) { port.output.end() };
            // port.output.end();

            this.ports.splice(i, 1);

        }
    }
};

//     left   right
//        +---+
//     W -+---+> R    upper
//        |   |
//     R <+---+- W    lower
//        +---+

class DuplexPassthrough {
    constructor(upperOptions, lowerOptions){
        this.upper = new PassThrough(upperOptions);
        this.lower = new PassThrough(lowerOptions);
        this.left  = duplex3(this.upper, this.lower);
        this.right = duplex3(this.lower, this.upper);
    }

    upper() { return this.upper }
    lower() { return this.lower }
    left()  { return this.left }
    right() { return this.right }

    destroy(e) { this.upper.destroy(e); this.lower.destroy(e); };
    end(d,e,c) { this.upper.end(d,e,c); this.lower.end(d,e,c); };
};

// adopted from merge-streams:
// change: do not end the merge stream when the last writer goes away,
// we want to keep it around so that later we can add new writers
var MergeStream = function (/*streams...*/) {
    var sources = []
    var output  = new PassThrough({objectMode: true})

    output.setMaxListeners(0)

    output.add = add
    output.isEmpty = isEmpty

    output.on('unpipe', remove)

    Array.prototype.slice.call(arguments).forEach(add)

    return output

    function add (source) {
        log.silly('MergeStream.add');
        if (Array.isArray(source)) {
            source.forEach(add)
            return this
        }

        sources.push(source);
        source.once('end', remove.bind(null, source))
        source.once('error', output.emit.bind(output, 'error'))
        source.pipe(output, {end: false})
        return this
    }

    function isEmpty () {
        return sources.length == 0;
    }

    function remove (source) {
        log.silly('MergeStream.remove');
        sources = sources.filter(function (it) { return it !== source })
        // if (!sources.length && output.readable) { output.end() }
    }
}

// module.exports.socket2dgramstream = socket2dgramstream;
// module.exports.Status            = Status;
module.exports.DatagramStream    = DatagramStream;
module.exports.BroadcastStream   = BroadcastStream;
module.exports.DuplexPassthrough = DuplexPassthrough;
module.exports.MergeStream       = MergeStream;
