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

const stream_pipe  = require('stream').prototype.pipe;
const log          = require('npmlog');

// WARNING: The below will switch to the old-style streams API
// ("classic" streams) as per having a "data" listener (see
// https://github.com/substack/stream-handbook
//
// TODO: rewrite in "new-style" (streams3) by properly subclassing
// streams.Duplex, see ws/lib/streams.js in the source of the 'ws'
// module for how to do that
function socket2dgramstream(socket, remote){
    socket.readable = true;
    socket.writable = true;

    socket.write = function (message) {
        if (typeof message === "string")
            message = new Buffer(message, "utf8");
        if(!Buffer.isBuffer(message))
            message = new Buffer(message);

        log.silly('socket2dgramstream.write:',
                  `${remote.address}:${remote.port}:`,
                  `${message}`);

        socket.send(message, 0, message.length,
                    remote.port, remote.address);
        return true;
    };

    socket.end = function () {
        setImmediate(function () {
            socket.emit('end')
            socket.close();
        });
    };

    socket.pause = function () {
        socket.paused = true;
        return socket;
    };

    socket.resume = function () {
        socket.paused = false;
        return socket;
    };

    socket.on('message', function (msg, rinfo) {
        // msg.rinfo = rinfo;
        log.silly('socket2dgramstream.onmessage:',
                  `rinfo: ${dump(rinfo)}: ${msg}`);
        socket.emit('data', msg);
    });

    socket.on('error', (e) => {
        log.warn(`Error in datagram-stream: ${e}`);
        socket.destroy();
        return;
    });

    socket.pipe = stream_pipe;
    return socket;
}

module.exports.socket2dgramstream = socket2dgramstream;
