const Stream       = require('stream');
const assert       = require('chai').assert;
const EventEmitter = require('events').EventEmitter;
const Net          = require('net');
const L7mp         = require('../l7mp.js').L7mp;
const Listener     = require('../listener.js').Listener;
const Session      = require('../session.js').Session;
const EndPoint     = require('../cluster.js').EndPoint;
const Cluster      = require('../cluster.js').Cluster;

describe('Rerty', ()  => {
    var l, e, c, s;
    before( () => {
        l7mp = new L7mp();
        l7mp.applyAdmin({ log_level: 'error' });
        l7mp.run(); // should return
        l = Listener.create( {name: 'Test', spec: { protocol: 'Test' }});
        c = Cluster.create({ name: 'Test', spec: {protocol: 'Test'},
                             endpoints: [{ name: 'Test', spec: {}}]});
        e = c.endpoints[0];
    });

    context('empty', () => {
        it('ok', () => { assert.isOk(true); });
    });

});
