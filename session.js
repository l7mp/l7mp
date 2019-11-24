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

// - Event: 'end': Emitted if one of the streams in the session's
//   pipeline is closed. (sometimes it's 'close' but the 'route' takes
//   cares of this), if error is defined, then it's an error

class Session {
    constructor(m, l, p){
        this.metadata = m;
        this.name     = m.name;  // id
        this.listener = l;
        this.route    = undefined;
        this.stats    = { counter: new StreamCounter() };
        this.priv     = p || {};
        this.retryPolicy = 'NEVER';
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

        this.route.on('end', (origin, stream, error) => {
            log.info('Session.end event:',
                     `Route.end for session "${this.name}"`);
            this.onDisconnect('end', origin, stream, error);
        });
    }

    onDisconnect(event, origin, stream, error){
        log.silly('Session.onDisconnect event:',
                 `Route.${event} for session "${this.name}":`,
                  (error) ? dumper(error, 1) : '',
                  `origin: "${origin.name}"`);

        switch(this.retryPolicy){
        case 'NEVER':
            this.disconnect(event, error);
            break;
        default:
            log.warn('Session.onDisconnect:',
                     'unknown retry policy, not retrying');
            this.disconnect(event, error);
        }
    }

    disconnect(e, error){
        log.silly('Session.disconnect');
        dump(this.metadata);
        if(this.metadata.status === 'ESTABLISHED'){
            this.emit('end', this, error);
        } else {
            log.silly('Session.disconnect: session not established, ignoring');
        }
    }
};
util.inherits(Session, EventEmitter);

module.exports.Session = Session;
