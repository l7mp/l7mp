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

class L7mpError extends Error {
    constructor(status, message, content) {
        super(message);
        this.name = this.constructor.name;
        // This clips the constructor invocation from the stack trace.
        // It's not absolutely essential, but it does make the stack trace a little nicer.
        //  @see Node.js reference (bottom)
        Error.captureStackTrace(this, this.constructor);
        this.status = status;
        this.content = content; // addditional content
    }

    toJSON() {
        let json = { name: this.name,
                     status: this.status,
                     message: this.message,
                   };
        if(this.content && this.content.toJSON)
            json.content = this.content.toJSON();
        if(log.level === 'silly')
            json.stacktrace = this.stack;
        return json;
    }
}

// reuse error object for successfull operations as well
class Ok extends L7mpError {
    constructor(content) {
        super(200, 'OK', content);
        this.name = this.constructor.name;
    }
}

// Only for unexpected program errors!
class InternalError extends L7mpError {
    constructor(content) {
        super(500, 'Internal Server Error', content);
        this.name = this.constructor.name;
    }
}

// Errors from the API
class BadRequestError extends L7mpError {
    constructor(content) {
        super(400, 'Bad Request', content);
        this.name = this.constructor.name;
    }
}

// Input validation errors from the API
class ValidationError extends L7mpError {
    constructor(content) {
        super(422, 'Unprocessable Entity: Input JSON schema validation failed', content);
        this.name = this.constructor.name;
    }
}

// Missing API endpoint
class NotFoundError extends L7mpError {
    constructor(content) {
        super(404, 'Not Found', content);
        this.name = this.constructor.name;
    }
}

class GeneralError extends L7mpError {
    constructor(content) {
        super(500, 'General Server Error', content); // service unavailable
        this.name = this.constructor.name;
    }
}

module.exports.L7mpError       = L7mpError;
module.exports.Ok              = Ok;
module.exports.InternalError   = InternalError;
module.exports.BadRequestError = BadRequestError;
module.exports.NotFoundError   = NotFoundError;
module.exports.ValidationError = ValidationError;
module.exports.GeneralError    = GeneralError;
