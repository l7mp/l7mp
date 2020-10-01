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

const log = require('npmlog');
const _   = require('lodash');

const ipaddr   = require('../ipaddr.js').ipaddr;
const Protocol = require('../protocol.js').Protocol;

/*
  # DNS Protocol

  Stores protocol definitions and their primitives as well as any other
  associated protocol constants

  ## References

  http://tools.ietf.org/html/rfc1035
  http://tools.ietf.org/html/rfc4408
  http://tools.ietf.org/html/rfc2782
  http://tools.ietf.org/html/rfc3596

  ## Notes

  * Even though RFC1035 says that questions should support multiple queries, the
  reality is *nobody* does this. MS DNS doesn't support it and apparently BIND
  doesn't support it as well. That implies no client side tools do either - so
  we will not worry about that complication.

  * DNS Extensions have been proposed, but another case of chicken-and-egg.
  These extensions make it _possible_ to have DNS queries over 512 bytes in
  length, but because it is not universally supported, nobody does it.

  ## Copyright

  Original code taken from https://github.com/trevoro/node-named and redistributed under the MIT
  licence.

  Copyright (c) 2015 Trevor Orsztynowicz
*/

class DNSProtocol extends Protocol {
    constructor(opts){
        super(opts);

        _.extend(this.formats, {
            answer: {
                name: { type: '_nsName' },
                // rtype: { type: 'UInt16BE' },
                // rclass: { type: 'UInt16BE' },
                rtype: { type: '_nsType' },
                rclass: { type: '_nsQClass' },
                rttl: { type: 'UInt32BE' },
                rdata: { type: '_nsData' },     // rdlength is prepended to this field
            },
            question: {
                name: { type: '_nsName' },
                type: { type: '_nsType' },
                qclass: { type: '_nsQClass' },
            },
            header: {
                id: { type: 'UInt16BE' },
                flags: { type: '_nsFlags' },
                qdCount: { type: 'UInt16BE' },
                anCount: { type: 'UInt16BE' },
                nsCount: { type: 'UInt16BE' },
                srCount: { type: 'UInt16BE' },
            },
            soa: {
                host: { type: '_nsName' },
                admin: { type: '_nsName' },
                serial: { type: 'UInt32BE' },
                refresh: { type: 'UInt32BE' },
                retry: { type: 'UInt32BE' },
                expire: { type: 'UInt32BE' },
                ttl: { type: 'UInt32BE' }
            },
            mx: {
                priority: { type: 'UInt16BE' },
                exchange: { type: '_nsName' },
            },
            txt: {
                text: { type: '_nsText' },
            },
            srv: {
                priority: { type: 'UInt16BE' },
                weight: { type: 'UInt16BE' },
                port: { type: 'UInt16BE' },
                target: { type: '_nsName' },
            },
            queryMessage: {
                header: { type: { format: 'header' } },
                question: { type: { format: 'question' } },
            },
            answerMessage: {
                header: { type: { format: 'header' } },
                question: { type: { format: 'question' } },
                answers: { type: '_nsAnswers' },
            },
        });

        _.extend(this.serializers, {
            '_nsAnswers': {
                encoder: function(v) {
                    var s = 0, p = 0, answers = [];
                    for (i in v) {
                        var r = this.encode(v[i], 'answer');
                        answers.push(r);
                        s = s + r.length;
                    }
                    b = Buffer.alloc(s);
                    for (n in answers) {
                        answers[n].copy(b, p);
                        p = p + answers[n].length;
                    }
                    return b;
                }
            },
            '_nsFlags': {
                encoder: function(v) {
                    if (typeof(v) !== 'object') {
                        throw new TypeError("flag must be an object");
                    }

                    if(typeof v.opcode === 'string' &&
                       typeof DNSProtocol.constants.opcodes[v.opcode] !== 'undefined')
                        v.opcode = DNSProtocol.constants.opcodes[v.opcode];

                    var b = Buffer.alloc(2);
                    var f = 0x0000;
                    f = f | (v.qr << 15);
                    f = f | (v.opcode << 11);
                    f = f | (v.aa << 10);
                    f = f | (v.tc << 9);
                    f = f | (v.rd << 8);
                    f = f | (v.ra << 7);
                    f = f | (v.z  << 6);
                    f = f | (v.ad << 5);
                    f = f | (v.cd << 4);
                    f = f | v.rcode;
                    b.writeUInt16BE(f, 0);
                    return b;
                },
                decoder: function(v, p) {
                    var flags, f;
                    flags = v.readUInt16BE(p);
                    f = {
                        qr:     (( flags & 0x8000 )) ? true : false,
                        opcode: (( flags & 0x7800 )),
                        aa:     (( flags & 0x0400 )) ? true : false,
                        tc:     (( flags & 0x0200 )) ? true : false,
                        rd:     (( flags & 0x0100 )) ? true : false,
                        ra:     (( flags & 0x0080 )) ? true : false,
                        z:      (( flags & 0x0040 )) ? true : false,
                        ad:     (( flags & 0x0020 )) ? true : false,
                        cd:     (( flags & 0x0010 )) ? true : false,
                        rcode:  (( flags & 0x000F ))
                    };
                    if(typeof DNSProtocol.constants.opcodes[f.opcode] !== undefined)
                        f.opcode = DNSProtocol.constants.opcodes[f.opcode];

                    return { val: f, len: 2 };
                }
            },
            '_nsIP4': {
                encoder: function(v) {
                    var a, b;
                    a = ipaddr.parseIPv4(v);
                    b = Buffer.alloc(4);
                    b.writeUInt32BE(a, 0);
                    return b;
                }
            },
            '_nsIP6': {
                encoder: function(v) {
                    var a, b, i = 0;
                    a = ipaddr.parseIPv6(v);
                    b = Buffer.alloc(16);
                    for (var i=0; i<8; i++) {
                        b.writeUInt16BE(a[i], i * 2);
                    }
                    return b;
                }
            },
            '_nsName': {
                encoder: function(v) {
                    if (typeof(v) !== 'string')
                        throw new TypeError('name (string) is required')
                    var n = v.split(/\./);

                    var b = Buffer.alloc(n.toString().length + 2);
                    var o = 0; //offset

                    for (var i = 0; i < n.length; i++) {
                        var l = n[i].length;
                        b[o] = l;
                        b.write(n[i], ++o, l, 'utf8');
                        o += l;
                    }
                    b[o] = 0x00;

                    return b;
                },
                decoder: function(v, p) {
                    var rle, start = p, name = [];

                    let rlen = v.readUInt8(p);
                    while (rlen != 0x00) {
                        p++;
                        var t = v.slice(p, p + rlen);
                        name.push(t.toString());
                        p = p + rlen;
                        rlen = v.readUInt8(p);
                    }

                    return { val: name.join('.'), len: (p - start + 1) };
                }
            },
            // type: { type: 'UInt16BE' },
            '_nsType': {
                encoder: function(v) {
                    if (typeof(v) !== 'string')
                        throw new TypeError('type (string) is required');

                    var b = Buffer.alloc(2);
                    if(typeof DNSProtocol.constants.queryTypes[v] === 'undefined')
                        throw new TypeError(`no such type ${v}`);

                    b.writeUInt16BE(DNSProtocol.constants.queryTypes[v], 0);
                    return b;
                },
                decoder: function(v, p) {
                    let type = v.readUInt16BE(p);

                    dump(type, 1);
                    dump(this, 5);

                    if(typeof DNSProtocol.constants.queryTypes[type] === 'undefined')
                        throw new TypeError(`no such type ${type}`);
                    return { val: DNSProtocol.constants.queryTypes[type], len: 2 };
                }
            },
            // qclass: { type: 'UInt16BE' },
            '_nsQClass': {
                encoder: function(v) {
                    if (typeof(v) !== 'string')
                        throw new TypeError('type (string) is required');

                    var b = Buffer.alloc(2);
                    if(typeof DNSProtocol.constants.classes[v] === 'undefined')
                        throw new TypeError(`no such class ${v}`);

                    b.writeUInt16BE(DNSProtocol.constants.classes[v], 0);
                    return b;
                },
                decoder: function(v, p) {
                    let _class = v.readUInt16BE(p);
                    if(typeof DNSProtocol.constants.classes[_class] === 'undefined')
                        throw new TypeError(`no such class ${_class}`);
                    return { val: DNSProtocol.constants.classes[_class], len: 2 };
                }
            },
            '_nsText': {
                encoder: function(v) {
                    var b;
                    b = Buffer.alloc(v.length + 1);
                    b.writeUInt8(v.length, 0);
                    b.write(v, 1);
                    return b;
                }
            },
            '_nsData': {
                encoder: function(v, t) {
                    var r, b, l;
                    // TODO with the new queryTypes layout this could probably be mostly
                    // eliminated

                    switch(t) {
                    case this.constants.queryTypes['A']:
                        r = this.serializers['_nsIP4'].encoder(v.target);
                        break;
                    case this.constants.queryTypes['CNAME']:
                        r = this.serializers['_nsName'].encoder(v.target);
                        break;
                    case this.constants.queryTypes['NS']:
                        r = this.serializers['_nsName'].encoder(v.target);
                        break;
                    case this.constants.queryTypes['SOA']:
                        r = this.encode(v, 'soa');
                        break;
                    case this.constants.queryTypes['MX']:
                        r = this.encode(v, 'mx');
                        break;
                    case this.constants.queryTypes['TXT']:
                        r = this.serializers['_nsText'].encoder(v.target);
                        break;
                    case this.constants.queryTypes['AAAA']:
                        r = this.serializers['_nsIP6'].encoder(v.target);
                        break;
                    case this.constants.queryTypes['SRV']:
                        r = this.encode(v, 'srv');
                        break;
                    default:
                        throw new Error('unrecognized nsdata type');
                        break;
                    }

                    l = r.length;
                    b = Buffer.alloc(l + 2);
                    b.writeUInt16BE(l, 0);
                    r.copy(b, 2);
                    return b;
                }
            },
        });

        _.extend(this.validators, {
            nsName: function(v) {
                // hostname regex per RFC1123
                var reg =/^([a-z0-9]|[a-z0-9][a-z0-9\-]{0,61}[a-z0-9])(\.([a-z0-9]|[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]))*$/i;
                if (typeof(v) !== 'string')
                    return false;
                if (v.length > 255)
                    return false;

                if (reg.test(v)) {
                    return true;
                }
                else {
                    return false;
                }
            },
            nsText: function(v) {
                if (typeof(v) === 'string') {
                    if (v.length < 256)
                        return true;
                }
                else {
                    return false;
                }
            },
        });
    }
}

Object.defineProperty(DNSProtocol, 'constants', {
    value: {
        classes: {
            IN: 0x01, // the internet
            CS: 0x02, // obsolete
            CH: 0x03, // chaos class. yes this actually exists
            HS: 0x04, // Hesiod
            0x01: 'IN',
            0x02: 'OBSOLETE',
            0x03: 'CH',
            0x04: 'HS',
        },
        opcodes: {
            query: 0x00,
            status: 0x02,
            notify: 0x04,
            update: 0x05,
            0x00: 'query' ,
            0x02: 'status',
            0x04: 'notify',
            0x05: 'update',
        },
        errors: {
            DNS_ENOERR:  0x00, // No error
            DNS_EFORMAT: 0x01, // Formatting Error
            DNS_ESERVER: 0x02, // server it unable to process
            DNS_ENONAME: 0x03, // name does not exist
            DNS_ENOTIMP: 0x04, // feature not implemented on this server
            DNS_EREFUSE: 0x05, // refused for policy reasons
        },
        queryTypes: {
            A     : 0x01,   // ipv4 address
            NS    : 0x02,   // nameserver
            MD    : 0x03,   // obsolete
            MF    : 0x04,   // obsolete
            CNAME : 0x05,   // alias
            SOA   : 0x06,   // start of authority
            MB    : 0x07,   // experimental
            MG    : 0x08,   // experimental
            MR    : 0x09,   // experimental
            NULL  : 0x0A,   // experimental null RR
            WKS   : 0x0B,   // service description
            PTR   : 0x0C,   // reverse entry (inaddr.arpa)
            HINFO : 0x0D,   // host information
            MINFO : 0x0E,   // mailbox or mail list information
            MX    : 0x0F,   // mail exchange
            TXT   : 0x10,   // text strings
            AAAA  : 0x1C,   // ipv6 address
            SRV   : 0x21,   // srv records
            AXFR  : 0xFC,   // request to transfer entire zone
            MAILA : 0xFE,   // request for mailbox related records
            MAILB : 0xFD,   // request for mail agent RRs
            ANY   : 0xFF,   // any class
            0x01  : 'A' ,   // ipv4 address
            0x02  : 'NS',   // nameserver
            0x03  : 'MD',   // obsolete
            0x04  : 'MF',   // obsolete
            0x05  : 'CNAME',// alias
            0x06  : 'SOA',  // start of authority
            0x07  : 'MB',   // experimental
            0x08  : 'MG',   // experimental
            0x09  : 'MR',   // experimental
            0x0A  : 'NULL', // experimental null RR
            0x0B  : 'WKS',  // service description
            0x0C  : 'PTR',  // reverse entry (inaddr.arpa)
            0x0D  : 'HINFO',// host information
            0x0E  : 'MINFO',// mailbox or mail list information
            0x0F  : 'MX',   // mail exchange
            0x10  : 'TXT',  // text strings
            0x1C  : 'AAAA', // ipv6 address
            0x21  : 'SRV',  // srv records
            0xFC  : 'AXFR', // request to transfer entire zone
            0xFE  : 'MAILA',// request for mailbox related records
            0xFD  : 'MAILB',// request for mail agent RRs
            0xFF  : 'ANY',  // any class
        },
    },
    writable : false,
    enumerable : true,
    configurable : false
});



module.exports.DNSProtocol = DNSProtocol;
