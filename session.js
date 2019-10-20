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
const util         = require('util');

const StreamCounter = require('./stream-counter.js').StreamCounter;

//------------------------------------
//
// Session
//
//------------------------------------

// - Event: 'connect': Emitted when a session stream pipeline is
//   successfully established.

// - Event: 'close': Emitted if one of the streams in the session's
//   pipeline is closed.

// - Event: 'error' (<Error>): Emitted when an error occurs in the
//   pipeline. The 'close' event will be called directly following
//   this event.

class Session {
    constructor(m, l, p){
        this.metadata = m;
        this.name     = m.name;  // id
        this.listener = l;
        this.route    = undefined;
        this.stats    = { counter: new StreamCounter() };
        this.priv     = p || {};
    }

    toJSON(){
        log.silly('Session.toJSON:', `"${this.name}"`);
        return {
            metadata: this.metadata,
            route:    this.route
        };
    }

    setRoute(r){
        this.route = r;

        this.route.on('close', (origin, stream) => {
            this.onClose(origin, stream);
        });

        this.route.on('error', (e, origin, stream) => {
            this.onError(e, origin, stream);
        });
    }

    onClose(o, s){
        log.info('Session.onClose',
                 `TODO: Close event on session "${this.name}"`);
        //  from`, `origin: ${o.name}`);
        this.metadata.status = 'DISCONNECT';
    }

    onError(e, o, s){
        log.info('Session.onError',
                 `TODO: Error event on session "${this.name}"`);
        //from`, `origin: ${o.name}: ${e}`);
        this.metadata.status = 'DISCONNECT';
    }
};
util.inherits(Session, EventEmitter);

module.exports.Session = Session;
