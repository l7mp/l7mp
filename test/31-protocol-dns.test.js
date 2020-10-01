// L7mp: A programmable L7 meta-proxy
//
// Copyright 2020 by its authors.
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

const assert = require('chai').assert;

const L7mp        = require('../l7mp.js').L7mp;
const DNSProtocol = require('../protocols/dns.js').DNSProtocol;

const decode_samples = [
    {
        id: 0,
        description: 'query ns1.joyent.dev (A)',
        data: "0f 34 01 00 00 01 00 00 00 00 00 00 03 6e 73 31 06 6a 6f 79 65 " +
            "6e 74 03 64 65 76 00 00 01 00 01",
        type: 'queryMessage',
        decoded: { val: { header: { id: 3892, flags: { qr: false, opcode: 'query', aa: false, tc: false, rd: true, ra: false, z: false, ad: false, cd: false, rcode: 0 }, qdCount: 1, anCount: 0, nsCount: 0, srCount: 0 }, question: { name: 'ns1.joyent.dev', type: 'A', qclass: 'IN' } }, len: 44 }
    },
    {
        id: 1,
        description: 'query ns1.joyent.dev (AAAA)',
        data: "b9 dd 01 00 00 01 00 00 00 00 00 00 03 6e 73 31 06 6a 6f 79 65 " +
            "6e 74 03 64 65 76 00 00 1c 00 01",
        type: 'queryMessage',
        decoded: { val: { header: { id: 47581, flags: { qr: false, opcode: 'query', aa: false, tc: false, rd: true, ra: false, z: false, ad: false, cd: false, rcode: 0 }, qdCount: 1, anCount: 0, nsCount: 0, srCount: 0 }, question: { name: 'ns1.joyent.dev', type: 'AAAA', qclass: 'IN' } }, len: 44 }
    }
];

function encode(data) {
    var tokens, buffer, pos = 0;

    if (typeof(data) !== 'string')
        throw new TypeError('data (string) is required');

    tokens = data.split(/\s/);
    buffer = Buffer.alloc(tokens.length);
    for (i in tokens) {
        var t = '0x' + tokens[i];
        var v = parseInt(t);
        buffer.writeUInt8(v, pos++, true);
    }
    return buffer;
}

function equalBuffers(b1, b2) {
        if (b1.length !== b2.length) {
                return false;
        }

        var l = b1.length;
        while (l--) {
                var one = b1.readUInt8(l);
                var two = b2.readUInt8(l);
                if (one !== two) {
                        return false;
                }
        }
        return true;
}

var dns = new DNSProtocol();
for (i in decode_samples) {
    decode_samples[i].raw = encode(decode_samples[i].data);
}


describe('basic', ()  => {
    context('decode', () => {
        for (let i in decode_samples) {
            var sample = decode_samples[i];
            it('protocol decode: ' + sample.description, () => {
                let decoded = dns.decode(sample.raw, sample.type);
                // dump(decoded, 5);
                assert.deepEqual(decoded, sample.decoded);
            });
        }
    });

    context('encode', () => {
        for (let i in decode_samples) {
            var sample = decode_samples[i];
            it('protocol encode: ' + sample.description, () => {
                let encoded = dns.encode(sample.decoded.val, sample.type);
                // dump(encoded, 1);
                assert.isOk(encoded, sample.raw);
            });
        }
    });
});
