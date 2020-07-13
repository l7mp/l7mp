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
const jsonPredicate = require("json-predicate")

// use json-predicate.dataAtPath to query metadata
// see doc at https://tools.ietf.org/html/draft-snell-json-test-07

// this is pretty basic: eventually, we should monkey-patch dataAtPath
// with with something like json-query or jsonpath to enable complex
// queries

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
        log.silly("JSONPredicate.apply", `Session: ${s.name}`,
                  `predicate:`, dumper(this.predicate, 5),
                  `on metadata:`, dumper(s.metadata, 5));
        let res = jsonPredicate.test(s.metadata, this.predicate);

        log.silly("JSONPredicate.apply", `results: "${res}"`);
        return res === true;
    }

    toJSON(){ return this.predicate; }
};

Match.create = (m) => {
    log.silly("Match.create:", dumper(m));
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
        this.name   = r.name;
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
        log.silly('Rule.apply:', `"${this.name}"`);

        if(this.match.apply(s)){
            log.silly(`Rule.apply: "${this.name}": Match`);
            // _.extend(s.metadata, this.action.set);
            this.stats.total_applied++;
            return this.action;
        }
        log.silly(`Rule.apply: "${this.name}": No match`);
    }
};
Rule.index = 0;

Rule.create = (r) => {
    log.silly("Rule.create:", dumper(r, 5));
    return new Rule(r);
}

// no equivalent setAtPath for dataAtPath, we have to special-case
// this here:
// if data under path does not exist, we create it
// value can be object, in this case it will be deepcopied
Rule.getAtPath = (data, path) => {
    var result, loc, locs = path.split('/');
    // remove leading /
    if(locs.length && locs[0] === '')
        locs.shift();

    // ready: '/'
    if(locs.length===1 && locs[0] === '')
        return data;

    while(data && (loc = locs.shift()) && loc!=='') {
        result = data = data[loc];
    }
    return result;
}

Rule.setAtPath = (data, path, value) => {
    let ret = data;
    var loc, locs = path.split('/');

    // remove trailing /
    if(locs.length && locs[locs.length-1] === '')
        locs.pop();

    // remove leading /
    if(locs.length && locs[0] === '')
        locs.shift();

    // ready: '/'
    if(locs.length===0){
        ret = typeof value === 'object' ? _.cloneDeep(value) : value;
        return ret;
    }
    while((loc = locs.shift())) {
        let index = parseInt(loc, 10);
        if(!isNaN(index))loc=index;
        if(locs.length === 0) {
            if(typeof value !== 'object'){
                data[loc] = value;
            } else {
                data[loc] = _.cloneDeep(value);
            }
        } else {
            if(data[loc]){
                data = data[loc];
            } else {
                data = data[loc] = {};
            }
        }
    }
    return ret;
}

module.exports.Rule = Rule;

//------------------------------------
//
// RuleList (aka: MatchActionTable)
//
//------------------------------------
class RuleList {
    constructor(rs){
        this.name   = rs.name;
        this.rules  = rs.rules;
    }

    toJSON(){
        log.silly('RuleList.toJSON:', `"${this.name}"`);
        return {
            name:   this.name,
            rules:  this.rules,
        };
    }

    // // apply rule to session
    // apply(s){
    //     log.silly('RuleList.apply:', `"${this.name}"`);

    //     // late-bind rules
    //     for(let i = 0; i < this.rules.length; i++){
    //         // this is a rule name, substitute ref to Rule
    //         let ru = this.getRule(this.rules[i]);
    //         if(!ru){
    //             let e = `Cannot find named rule "${this.rules[i]}"`;
    //             log.warn(`RuleList.apply: "${this.name}":`, e);
    //             throw new Error(`Cannot apply RuleList "${this.name}": ${e}`);
    //         }

    //         let action = ru.apply(s)
    //         if (action)
    //             return action;
    //     }

    //     log.silly(`RuleList.apply: "${this.name}": No match`);
    // }
};
RuleList.index = 0;

RuleList.create = (r) => {
    log.silly("RuleList.create:", dumper(r, 5));
    return new RuleList(r);
}

module.exports.RuleList = RuleList;
