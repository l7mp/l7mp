const assert   = require('chai').assert;
const L7mp     = require('../l7mp.js').L7mp;
const Rule         = require('../rule.js').Rule;
const RuleList     = require('../rule.js').RuleList;

let static_config = {
  "admin": {
    "log_level": "info",
    "log_file": "stdout",
    "access_log_path": "/tmp/admin_access.log"
  },
  "listeners": [
    {
      "name": "controller-listener",
      "spec": {
        "protocol": "HTTP",
        "port": 1234
      },
      "rules": [
        {
          "action": {
            "route": {
              "destination": {
                "name": "l7mp-controller",
                "spec": {
                  "protocol": "L7mpController"
                }
              }
            }
          }
        }
      ]
    }
  ]
};

describe('Rule API', ()  => {
    var e, s;
    before( () => {
        l7mp = new L7mp();
        l7mp.static_config = static_config;
        l7mp.applyAdmin({ log_level: 'warn' });
        l7mp.run(); // should return
    });

    after(() => {
        let l = l7mp.getListener('controller-listener');
        l.close();
    });

    context('create', () => {
        it('controller-listener',         () => { assert.lengthOf(l7mp.listeners, 1); } );
    });

});
