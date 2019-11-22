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

const log           = require('npmlog');
const _             = require('underscore');

const jsonPredicate = require("json-predicate")
// TODO: se use json-predicate.dataAtPath to query metadata but this
// is pretty basic; eventually, we should monkey-patch dataAtPath with
// with something like json-query or jsonpath to enable complex
// queries

// see doc at https://tools.ietf.org/html/draft-snell-json-test-07


//------------------------------------
//
// Match
//
//------------------------------------
class Match {
    apply(s) { log.error("Match.apply", "Base class called"); }
}

class Wildcard extends Match {
    constructor() { super(); }

    apply(s){
        log.silly("Wildcard.apply", `Session: ${s.name}`);
        return true;
    }

    toJSON(){
        log.silly('WildCard.toJSON');
        return { match: '*' };
    }
};

class JSONPredicate extends Match {
    constructor(m) {
        super();
        // TODO: validate query. We now accept invalid queries and
        // silently fail during runtime
        this.predicate = m;
    }

    apply(s){
        log.silly("JSONPredicate.apply",
                  `Session: ${s.name}, predicate: "${this.predicate}"`);
        let res = jsonPredicate.test(s.metadata, this.predicate);

        log.silly("JSONPredicate.apply", `resuts: "${res}"`);
        return res === true;
    }

    toJSON(){ return this.predicate; }
};

Match.create = (m) => {
    log.silly("Match.create:", dump(m));
    if(typeof m === 'string'){
        return new Wildcard();
    } else {
        return new JSONPredicate(m);
    }
}

//------------------------------------
//
// Rule
//
//------------------------------------
class Rule {
    constructor(r){
        this.name   = r.name || `Rule_${Rule.index++}`;
        this.match  = Match.create(r.match || "*");
        this.action = r.action;
        this.stats  = { total_applied: 0 };
    }

    toJSON(){
        log.silly('Rule.toJSON:', `"${this.name}"`);
        return {
            name:   this.name,
            match:  this.match,
            action: this.action,
        };
    }

    // apply rule to session
    apply(s){
        log.silly(`Rule.apply: ${dump(this)}`);

        if(this.match.apply(s)){
            _.extend(s.metadata, this.action.set);
            this.stats.total_applied++;
            log.silly(`Rule.apply: "${this.name}": Match`);
            return this.action;
        }
        log.silly(`Rule.apply: "${this.name}": No match`);
    }
};
Rule.index = 0;

Rule.create = (r) => {
    log.silly("Rule.create:", dump(r));
    return new Rule(r);
}

module.exports.Rule = Rule;
