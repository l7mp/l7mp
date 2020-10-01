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

const log    = require('npmlog');
const ipaddr = require('./ipaddr.js');
const net    = require('net');
const _      = require('lodash');

class Protocol {
    constructor(opts){
        this.constants = {};
        this.formats   = {};
        this.serializers = {
            // each of these serializers are functions which accept a value to serialize and must return
            // the serialized value as a buffer
            'UInt32BE': {
                encoder: function(v) {
                    var b = Buffer.alloc(4);
                    b.writeUInt32BE(v, 0);
                    return b;
                },
                decoder: function(v, p) {
                    return v.readUInt32BE(v, p);
                }
            },
            'UInt16BE': {
                encoder: function(v) {
                    var b = Buffer.alloc(2);
                    b.writeUInt16BE(v, 0);
                    return b;
                },
                decoder: function(v, p) {
                    var res = v.readUInt16BE(p);
                    return { val: res, len: 2 };
                }
            },
        };
        this.validators = {
            UInt32BE: function(v) {
                if (typeof(v) === 'number') {
                    var n = parseInt(v);
                    if (n !== NaN && n < 4294967295) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
                else {
                    return false;
                }
            },
            UInt16BE: function(v) {
                if (typeof(v) === 'number') {
                    var n = parseInt(v);
                    if (n !== NaN && n < 65535) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
                else {
                    return false;
                }
            },
            IPv4: function(v) {
                return net.isIPv4(v);
            },
            IPv6: function(v) {
                return net.isIPv6(v);
            },

            validate: function(obj, model) {
                var result = true;
                for (v in model) {
                    valid = model[v](obj[v]);
                    if (!valid) {
                        valid = false;
                        break;
                    }
                }
                return result;
            }
        };
    }
    
    encode(obj, format) {
        var size = 0, pos = 0, fmt, field, type, result, encoder, results = [];

        fmt = this.formats[format];

        for (let f in fmt) {
            var type, decoder, res;
            type = fmt[f].type;

            if (typeof(type) === 'string') {
                // WARNING: this ought to have been super-important, but specific to DNS, so it got
                // removed
                // if (type == '_nsData') {
                //     res = this.serializers['_nsData'].encoder(obj[f], obj['rtype']);
                // }
                // else {
                res = this.serializers[type].encoder(obj[f]);
                // }
            }
            else if (typeof(type) === 'object') {
                let reftype = type.format;
                res = this.encode(obj[f], reftype);
            }
            else {
                throw new TypeError('invalid type');
            }

            results.push(res);
            size = size + res.length;
            
        }

        result = Buffer.alloc(size);

        for (i in results) {
            var buf = results[i];
            buf.copy(result, pos);
            pos = pos + buf.length;
        }

        return result;
    }

    decode(raw, format, pos) {
        var size = 0, fmt, field, type, decoder, result = {};

        if (!pos) pos = 0;
        fmt = this.formats[format];

        for (var f in fmt) {
            var type, decoder, res;
            type = fmt[f].type;

            // if the type is a string its a reference to a serializer
            // if the type is an object its a nested format and we call decode again
            // with the appropriate offset

            if (typeof(type) === 'string') {
                res = this.serializers[type].decoder(raw, pos);
            }
            else if (typeof(type) === 'object') {
                let reftype = type.format;
                res = this.decode(raw, reftype, pos);
            }
            else {
                throw new TypeError('invalid type');
            }

            pos += res.len;
            result[f] = res.val;
        }

        return {val: result, len: pos};
    }
}

module.exports.Protocol = Protocol;
