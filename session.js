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
const eventDebug   = require('event-debug')

const StreamCounter = require('./stream-counter.js').StreamCounter;

//------------------------------------
//
// Session
//
//------------------------------------

// - Event: 'init': Emitted when the listener emits a new stream.
//   status: INIT
//   args:

// - Event: 'connect': Emitted after an 'init' session's stream
//   pipeline was successfully established or when it is re-connected
//   after 'disconnect' event.
//   status: INIT/DISCONNECTED -> CONNECTED
//   args: -

// - Event: 'disconnect': Emitted if one of the streams in the
//   session's pipeline is prematurely closed. This state is temporal:
//   the session may still re-connect later as per the retry policy.
//   status: CONNECTED -> DISCONNECTED
//   args: origin, error

// - Event: 'error': Emitted if one or more of the streams that
//   underlie a session fail and we cannot reconnect, under the retry
//   policy.
//   status: CONNECTED/DISCONNECTED -> FINALIZING
//   args: error

// - Event: 'end': Emitted if the session is deleted from the API or
//   ends normally.
//   status: CONNECTED/DISCONNECTED -> FINALIZING
//   args: -

// - Event: 'destroy': Emitted when all streams of the session have
//   closed down successfully
//   status: FINALIZING -> DESTROYED
//   args: -

class Session {
    constructor(m, l, s, p){
        this.metadata = m;
        this.name     = m.name;  // id
        this.listener = l;
        this.stream   = s;  // listener stream, valid before we had a route
        this.route    = undefined;
        this.stats    = { counter: new StreamCounter() };
        this.priv     = p || {};

        // eventDebug(this);
    }

    toJSON(){
        log.silly('Session.toJSON:', `"${this.name}"`);
        return {
            metadata: this.metadata,
            listener: this.listerer,
            route:    this.route,
        };
    }

    setRoute(r){
        this.route = r;
        // TODO: break circular dependency
        r.session = this;
    }
};
util.inherits(Session, EventEmitter);

module.exports.Session = Session;
