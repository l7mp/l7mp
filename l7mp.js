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

const os         = require('os');
const fs         = require('fs');

const parseArgs  = require('minimist');
const util       = require('util');
var   log        = require('npmlog');
const path       = require('path');
const YAML       = require('yamljs');
const getVersion = require('git-repo-version');

const Listener   = require('./listener.js').Listener;
const Cluster    = require('./cluster.js').Cluster;
const Session    = require('./session.js').Session;
const Rule       = require('./rule.js').Rule;
const RuleList   = require('./rule.js').RuleList;
const Route      = require('./route.js').Route;

const hostname   = os.hostname();

const MAX_NAME_ATTEMPTS = 20;

global.dumper = function dumper(o, depth=1){
    return util.inspect(o, {compact: 100000,
                            breakLength: Infinity,
                            depth: depth});
}

global.dump = function dump(o, depth=5){
    console.log(dumper(o, depth));
}

// validate object schamas beyond OpenAPI validation
const validate = (object, schema) => {
    if(object === null || !object ||
       !(object instanceof Object &&
         Object.getPrototypeOf(object) == Object.prototype))
        return 'An object (a set of key-value pairs) is expected';

    let e = Object
        .entries(schema)
        .map( ([key, ref]) => [
            key,
            !ref.required || (key in object),
            !ref.validate || (!ref.required && !(key in object)) ||
                ref.validate(object[key])
        ])
        .find( ([_, r, v]) => !r || !v );
    return e && `Property ${e[0]} is ${ !e[1] ? 'required' : 'invalid' }`;
}

Object.defineProperty(log, 'heading',
                      { get: () => { return new Date().toISOString() } });
log.headingStyle = { bg: '', fg: 'white' }

// cleanup handlers
for(let event of ['exit', 'SIGINT', 'SIGTERM']){
    process.on(event, () => {
        log.info(`Normal exit: event: ${event}`);
        if(l7mp && l7mp.cleanup)
            l7mp.cleanup.forEach(file => {
                try {
                    fs.accessSync(file);
                    log.silly(`Cleanup: removing "${file}"`);
                    fs.unlinkSync(file);
                } catch(e) { /* NOP */ }
            })
        process.exit();
    });
}

process.on('uncaughtException', (err) => {
    log.error(`Uncaught exception:`, err);
});

process.on('unhandledRejection', (reason, p) => {
    log.error(`Unhandled Rejection at Promise ${dumper(p, 3)}: Reason:`,
              reason);
});

class L7mp {
    constructor() {
        this.static_config;
        // object hierarchy
        this.admin      = {};
        this.listeners  = [];
        this.clusters   = [];
        this.rulelists  = [];
        this.rules      = [];
        this.sessions   = [];
        this.routes     = [];
        this.endpoints  = [];
        this.cleanup    = [];
    }

    toJSON(){
        log.silly('L7MP.toJSON:', `"${this.name}"`);
        return {
            admin:      this.getAdmin(),
            listeners:  this.listeners,
            clusters:   this.clusters,
            rulelists:  this.rulelists,
            rules:      this.rules,
            sessions:   this.sessions,
            routes:     this.routes,
            endpoints:  this.endpoints,
        };
    }

    newName(name, find){
        let i = 0;
        do{
            if(i > MAX_NAME_ATTEMPTS){
                let e = `Could not find new name after` +
                    `${MAX_NAME_ATTEMPTS} iterations`;
                log.error('L7mp.newName:', e);
                throw new Error(`Cannot create new name from ${name}: ${e}`);
            }
            var newname = name + (i > 0 ? `_${i}` : '');
            i++;
        } while(find.bind(this)(newname));
        return newname;
    }

    readConfig(config){
        log.silly('L7mp.readConfig', config);
        try {
            if(path.extname(config).toLowerCase() === '.yaml')
                this.static_config = YAML.parse(fs.readFileSync(config, 'utf8'));
            else
                this.static_config = JSON.parse(fs.readFileSync(config));
            this.applyAdmin(this.static_config.admin);
        } catch(e) {
            log.error(`Could not read static configuration ${config}:`,
                      e.code ? `${e.code}: ${e.message}` : e.message);
        }
    }

    run(){
        log.info('Starting l7mp version:', this.admin.version,
                 'Strict mode:', l7mp.admin.strict ? 'enabled' : 'disabled');

        try {
            if('clusters' in this.static_config){
                this.static_config.clusters.forEach(
                    (c) => this.addCluster(c)
                );
            }

            if('listeners' in this.static_config){
                this.static_config.listeners.forEach(
                    (l) => this.addListener(l).catch((e) => {
                        log.error(`Could not initialize static configuration`,
                                  `${config}:`,
                                  e.code ? `${e.code}: ${e.message}` : e.message
                                 );
                    })
                );
            }

            if('rules' in this.static_config){
                this.static_config.rules.forEach(
                    (r) => this.addRule(r)
                );
            }
        } catch(e) {
            console.log(dumper(e, 6));
            log.error(`Could not initialize static configuration ${config}:`,
                      e.code ? `${e.code}: ${e.message}` : e.message);
        }
    }

    ////////////////////////////////////////////////////
    //
    // Admin API
    //
    ////////////////////////////////////////////////////

    applyAdmin(admin) {
        log.silly('L7mp.applyAdmin', dumper(admin));
        this.admin.log_level = log.level = 'log_level' in admin ?
            admin.log_level : log.level;
        this.admin.strict = 'strict' in admin ? admin.strict : false;

        if('log_file' in admin){
            this.admin.log_file = admin.log_file;
            switch(admin.log_file){
            case 'stdout':
                this.admin.log_stream = process.stdout;
                break;
            case 'stderr':
                this.admin.log_stream = process.stderr;
                break;
            default:
                this.admin.log_stream =
                    fs.createWriteStream(admin.log_file);
            }
        }
        if('access_log_path' in admin){
            this.admin.access_log_path = admin.access_log_path;
            log.warn('L7mp.applyAdmin: access_log_path', 'TODO');
        }

        this.admin.version = getVersion({ shaLength: 10, includeDate: true }) ||
            '<UNKNOWN>';
    }

    getAdmin(){
        log.silly('L7mp.getAdmin');
        var admin = { log_level: this.admin.log_level,
                      strict: this.admin.strict,
                      version: this.admin.version };
        if(this.admin.log_file) admin.log_file = this.admin.log_file;
        if(this.admin.access_log_path)
            admin.access_log_path = this.admin.access_log_path;
        return admin;
    }

    ////////////////////////////////////////////////////
    //
    // Listener API
    //
    ////////////////////////////////////////////////////
    async addListener(l) {
        log.info('L7mp.addListener', dumper(l, 8));

        let schema = {
            name: {
                validate: (value) => /^\S+?$/.test(value), // alnum
                required: true,
            },
            spec: {
                validate: (value) => value instanceof Object,
                required: true,
            },
            rules: {
                validate: (value) => value instanceof Array,
                required: true,
            }
        };

        let e = validate(l, schema);
        if(e){
            log.warn('L7mp.addListener:', e);
            throw new Error(`Cannot add listener: ${e}`);
        }

        if(this.getListener(l.name)){
            let e = `Listener "${l.name}" already defined`;
            log.warn(`L7mp.addListener:`, e );
            throw new Error(`Cannot add listener: ${e}`);
        }

        var li = Listener.create(l);

        // if this is a reference to a named RuleList (aka:
        // MatchActionTable), defer binding until runtime, otherwise,
        // create a new rulelist
        if(Array.isArray(l.rules)){
            let rl = {};
            rl.rules = l.rules;
            rl.name = this.newName(`RuleList_${RuleList.index++}`,
                                   this.getRuleList);
            this.addRuleList(rl);
            li.rules = rl.name;
        }

        if(typeof li.rules !== 'string'){
            let e = `Invalid RuleList`;
            log.warn(`L7mp.addListener:`, e );
            throw new Error(`Cannot add listener: ${e}`);
        }

        li.on('emit', (s) => this.addSession(s));
        this.listeners.push(li);

        // this may fail: promise
        try {
            await li.run();
        } catch(e){
            log.silly(`L7mp.addListener:`, e);
            log.warn(`Cannot add listener: ${e.message}`);
            throw e;
        }
        return li;
    }

    getListener(n){
        log.silly('L7mp.getListener:', n);
        return this.listeners.find( ({name}) => name === n );
    }

    deleteListener(n){
        log.info('L7mp.deleteListener:', n);
        let i = this.listeners.findIndex( ({name}) => name === n);
        if(i >= 0){
            let l = this.listeners[i];
            if(l.options.removeOrphanSessions)
                for(let s of this.sessions){
                    let r = s.route;
                    if(r && r.source.origin.name === l.name)
                        this.deleteSession(s.name);
                }
            l.end();

            this.listeners.splice(i, 1);
        } else {
            let e = `Unknown listener "${n}"`;
            log.warn(`L7mp.deleteListener:`, e );
            throw new Error(`Cannot delete listener: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // Cluster API
    //
    ////////////////////////////////////////////////////
    addCluster(c) {
        log.info('L7mp.addCluster', dumper(c, 8));

        let schema = {
            name: {
                validate: (value) => /^\S+?$/.test(value),
                required: true,
            },
            spec: {
                validate: (value) => value instanceof Object,
                required: true,
            },
        };

        let e = validate(c, schema);
        if(e){
            log.warn('L7mp.addCluster:', e);
            throw new Error(`Cannot add cluster: ${e}`);
        }

        if(this.getCluster(c.name)){
            let e = `Cluster "${c.name}" already defined`;
            log.warn('L7mp.addCluster', e);
            throw new Error(`Cannot add cluster: ${e}`);
        }

        c = Cluster.create(c);
        this.clusters.push(c);
        return c;
    }

    getCluster(n){
        log.silly('L7mp.getCluster:', n);
        return this.clusters.find( ({name}) => name === n );
    }

    deleteCluster(n){
        log.info('L7mp.deleteCluster');
        let i = this.clusters.findIndex( ({name}) => name === n);
        if(i >= 0){
            let c = this.clusters[i];
            if(c.options.removeOrphanSessions)
                for(let s of this.sessions){
                    let r = s.route;
                    if(r.destination.origin.name === c.name ||
                       r.chain.ingress.some(stage =>
                                            stage.origin.name === c.name) ||
                       r.chain.egress.some(stage =>
                                           stage.origin.name === c.name))
                        this.deleteSession(s.name);
                }
            this.clusters.splice(i, 1);
        } else {
            let e = `Unknown cluster "${n}"`;
            log.warn(`L7mp.deleteCluster:`, e );
            throw new Error(`Cannot delete cluster: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // Rule API
    //
    ////////////////////////////////////////////////////

    addRule(r) {
        log.info('L7mp.addRule:', dumper(r, 8));

        let schema = {
            name: {
                validate: (value) => /^\S+?$/.test(value),
                required: true,
            },
            action: {
                validate: (value) => value instanceof Object,
                required: true,
            },
        };

        let e = validate(r, schema);
        if(e){
            log.warn('L7mp.addRule:', e);
            throw new Error(`Cannot add rule: ${e}`);
        }

        if(this.getRule(r.name)){
            let e = `Rule "${r.name}" already defined`;
            log.warn('L7mp.addRule', e);
            throw new Error(`Cannot add rule: ${e}`);
        }

        r = Rule.create(r);
        this.rules.push(r);

        let route = r.action.route;
        if(route){
            if(typeof route === 'object'){
                // inline route: create
                route.name = route.name ||
                    this.newName(`Route_${Route.index++}`, this.getRoute);
                this.addRoute(route);
                r.action.route = route.name;
            }

            if(typeof r.action.route !== 'string'){
                let e = `Invalid route`;
                log.warn(`L7mp.addRule:`, e );
                throw new Error(`Cannot add rule: ${e}`);
            }
        }

        return r;
    }

     getRule(n){
        log.silly('L7mp.getRule:', n);
        return this.rules.find( ({name}) => name === n );
    }

    deleteRule(n){
        log.info('L7mp.deleteRule:', n);
        let i = this.rules.findIndex( ({name}) => name === n);
        if(i >= 0){
            this.rules.splice(i, 1);
        } else {
            let e = `Unknown rule "${n}"`;
            log.warn(`L7mp.deleteRule:`, e );
            throw new Error(`Cannot delete rule: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // RuleList (aka MatchActionTable) API
    //
    ////////////////////////////////////////////////////

    addRuleList(r) {
        log.info('L7mp.addRuleList', dumper(r, 8));

        let schema = {
            name: {
                validate: (value) => /^\S+?$/.test(value),
                required: true,
            },
            rules: {
                validate: (value) => value instanceof Array,
                required: true,
            },
        };

        let e = validate(r, schema);
        if(e){
            log.warn('L7mp.addRuleList:', e);
            throw new Error(`Cannot add RuleList: ${e}`);
        }

        if(this.getRuleList(r.name)){
            let e = `RuleList "${r.name}" already defined`;
            log.warn('L7mp.addRuleList', e);
            throw new Error(`Cannot add RuleList: ${e}`);
        }

        r = RuleList.create(r);
        this.rulelists.push(r);

        for(let i = 0; i < r.rules.length; i++){
            let rule = r.rules[i];
            if(typeof rule === 'object'){
                // inline rule: create
                rule.name = rule.name ||
                    this.newName(`Rule_${Rule.index++}`, this.getRule);
                this.addRule(rule);
                r.rules[i] = rule.name;
            }

            if(typeof r.rules[i] !== 'string'){
                let e = `Invalid rule`;
                log.warn(`L7mp.addRule:`, e );
                throw new Error(`Cannot add rule: ${e}`);
            }
        }

        return r;
    }

     getRuleList(n){
        log.silly('L7mp.getRuleList:', n);
        return this.rulelists.find( ({name}) => name === n );
    }

    deleteRuleList(n){
        log.info('L7mp.deleteRuleList:', n);
        let i = this.rulelists.findIndex( ({name}) => name === n);
        if(i >= 0){
            this.rulelists.splice(i, 1);
            // remove the listeners that refer to this rulelist
            for(let l of this.listeners){
                if(l.rules.name === n)
                    this.deleteListener(l.name);
            }
        } else {
            let e = `Unknown RuleList "${n}"`;
            log.warn(`L7mp.deleteRuleList:`, e );
            throw new Error(`Cannot delete RuleList: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // Route API
    //
    ////////////////////////////////////////////////////

    addRoute(r){
        log.silly('L7mp.addRoute:', dumper(r, 6));

        // accept ols-style API
        r.destination = r.destination || r.cluster;

        let schema = {
            name: {
                validate: (value) => /^\S+?$/.test(value),
                required: true,
            },
            destination: {
                required: true,
            },
            ingress: {
                validate: (value) => value instanceof Array,
            },
            egress: {
                validate: (value) => value instanceof Array,
            },
            retry: {
                validate: (value) => value instanceof Object,
            },
        };

        let e = validate(r, schema);
        if(e){
            log.warn('L7mp.addRoute:', e);
            throw new Error(`Cannot add route: ${e}`);
        }

        if(typeof r.destination === 'object'){
            // inline cluster: create
            r.destination.name = r.destination.name ||
                this.newName(`Cluster_${Cluster.index++}`, this.getCluster);
            this.addCluster(r.destination);
            r.destination = r.destination.name;
        }


        if(typeof r.destination !== 'string'){
            let e = `Invalid destination`;
            log.warn(`L7mp.addRoute:`, e );
            throw new Error(`Cannot add route: ${e}`);
        }

        for(let dir of ['ingress', 'egress']){
            if(!r[dir]) continue;
            for(let i = 0; i < r[dir].length; i++){
                let c = r[dir][i];
                if(typeof c === 'object'){
                    // inline cluster: create
                    c.name = c.name ||
                        this.newName(`Cluster_${Cluster.index++}`, this.getCluster);
                    this.addCluster(c);
                    r[dir][i] = c.name;
                }
                if(typeof r[dir][i] !== 'string'){
                    let e = `Invalid cluster`;
                    log.warn(`L7mp.addRoute:`, e );
                    throw new Error(`Cannot add route: ${e}`);
                }
            }
        }

        r = Route.create(r);
        this.routes.push(r);

        return r;
    }

    getRoute(n){
        log.silly('L7mp.getRoute:', n);
        return this.routes.find( ({name}) => name === n );
    }

    // internal, not to be called from the API
    deleteRoute(n){
        log.silly('L7mp.deleteRoute:', n);
        let i = this.routes.findIndex(({name}) => name === n);
        if(i >= 0)
            this.routes.splice(i, 1);
    }

    ////////////////////////////////////////////////////
    //
    // EndPoint API
    //
    ////////////////////////////////////////////////////

    addEndPoint(ep){
        log.silly('L7mp.addEndPoint:', dumper(ep, 6));

        let schema = {
            name: {
                validate: (value) => /^\S+?$/.test(value),
                required: true,
            },
            spec: {
                validate: (value) => value instanceof Object,
                required: true,
            },
        };

        let e = validate(ep, schema);
        if(e){
            log.warn('L7mp.addEndPoint:', e);
            throw new Error(`Cannot add route: ${e}`);
        }

        ep = EndPoint.create(ep);
        this.endpoints.push(ep);

        return ep;
    }

    getEndPoint(n){
        log.silly('L7mp.getEndPoint:', n);
        return this.endponts.find( ({name}) => name === n );
    }

    // internal, not to be called from the API
    deleteEndPoint(n){
        log.silly('L7mp.deleteEndPoint:', n);
        let i = this.endpoints.findIndex(({name}) => name === n);
        if(i >= 0)
            this.endpoints.splice(i, 1);
    }

    ////////////////////////////////////////////////////
    //
    // Session API
    //
    ////////////////////////////////////////////////////

    // internal, not to be called from the API
    addSession(s){
        log.silly('L7mp.addSession');

        let schema = {
            metadata: {
                validate: (value) => value instanceof Object,
                required: true,
            },
            listener: {
                validate: (value) => value instanceof Object,
                required: true,
            },
            priv: {
                validate: (value) => value instanceof Object,
            },
        };

        let e = validate(s, schema);
        if(e){
            log.warn('L7mp.addSession:', s);
            throw new Error(`Cannot add sesson: ${e}`);
        }

        s.metadata.name = this.newName(s.metadata.name, this.getSession);
        s = new Session(s);
        this.sessions.push(s);

        s.on('init', () => log.silly(`Session "${s.name}: initializing"`));
        s.on('connect', () => log.silly(`Session "${s.name}:`,
                                        `successfully (re)connected"`));
        s.on('disconnect', (origin, error) => {
            log.info(`Session "${s.name}":`,
                     `temporarily disconnected at stream "${origin}":`,
                     `reason: ${error ? error.message : 'unknown'}`);
        });

        s.on('error', (e) => {
            // if(log.level === 'silly') dump(e);
            log.warn(`Session "${s.name}": fatal error:`, e.message);
            if(s.priv && s.priv.end)
                s.priv.end(s, e);
        });

        // normal end
        s.on('end', (msg) => {
            log.info(`Session "${s.name}": ending normally`);
            if(s.priv && s.priv.end)
                s.priv.end(s, msg);
        });

        s.on('destroy', () => {
            log.silly(`Session "${s.name}": destroyed`);
            setImmediate(() => this.deleteSession(s.name));
        });

        // may use .error()
        try {
            s.create();
        } catch(e){
            if(log.level === 'silly') dump(e);
            e = `Could not create session "${s.name}": ${e.message}`
            log.warn(e);
        }
    }

    deleteSession(n){
        log.verbose('L7mp.deleteSession:', `"${n}"`);

        let i = this.sessions.findIndex( ({name}) => name === n);
        if(i < 0){
            let e = `Unknown session "${n}"`;
            log.warn(`L7mp.deleteSession:`, e );
            throw new Error(`Cannot delete session: ${e}`);
        } else {
            this.sessions.splice(i, 1);
        }
    }

    getSession(n){
        log.silly('L7mp.getSession:', n);
        return this.sessions.find( ({name}) => name === n );
    }

};

///////////////////////////////////////

var usage = 'l7mp -c <static_config> -s -l <log-level>'
var argv = parseArgs(process.argv.slice(2));
if(!('c' in argv)){
    console.error(usage);
    process.exit(1);
}

log.stream = process.stderr;
log.on('log.error', (msg) => {
    console.error(`Error: ${msg.prefix}: ${msg.message}`);
    process.exit(1);
});

global.l7mp = new L7mp();
var config = argv.c;
l7mp.readConfig(config);

// override loglevel
if('l' in argv) log.level = argv.l;

// strict mode: boolean
if('s' in argv) l7mp.admin.strict = true;

if(!l7mp.static_config)
    log.error('No static configuration found');

l7mp.run();
