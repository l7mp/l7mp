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

const path       = require('path');
const fs         = require('fs');
const util       = require('util');
const log        = require('npmlog');
const YAML       = require('yamljs');
const getVersion = require('git-repo-version');
const jsonFormat = require('format-json');

const Listener   = require('./listener.js').Listener;
const Cluster    = require('./cluster.js').Cluster;
const EndPoint   = require('./cluster.js').EndPoint;
const Session    = require('./session.js').Session;
const Rule       = require('./rule.js').Rule;
const RuleList   = require('./rule.js').RuleList;
const Route      = require('./route.js').Route;
const L7mpOpenAPI= require('./l7mp-openapi.js').L7mpOpenAPI;

const {L7mpError, Ok, InternalError, BadRequestError, NotFoundError, ValidationError, GeneralError} = require('./error.js');

const MAX_NAME_ATTEMPTS = 20;

// WARNING: these dumpers are needed for development and testing only,
// will be removed later
global.dumper = function dumper(o, depth=1){
    return util.inspect(o, {compact: 100000,
                            breakLength: Infinity,
                            depth: depth});
}

global.dump = function dump(o, depth=5){
    console.log(dumper(o, depth));
}

global.toJSON = function toJSON(data, format='plain'){
    switch(format){
    case 'terse':  return jsonFormat.terse(data);
    case 'space':  return jsonFormat.space(data);
    case 'lines':  return jsonFormat.lines(data);
    case 'diffy':  return jsonFormat.diffy(data);
    case 'plain':
    default:       return jsonFormat.plain(data);
    }
}

// validate object schemas beyond OpenAPI validation
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

class L7mp {
    constructor(n) {
        this.name = n || `L7mp-${L7mp.index++}`;
        this.static_config = {};
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

    dumpL7mp(options) {
        log.silly('L7mp.dumpL7mp:', `"${this.name}"`);

        return {
            admin:      this.getAdmin(),
            listeners:  this.listeners.map( l => this.dumpListener(l.name)),
            clusters:   this.clusters.map(  c => this.dumpCluster(c.name)),
            rulelists:  this.rulelists.map( r => this.dumpRuleList(r.name)),
            rules:      this.rules.map(     r => this.dumpRule(r.name)),
            routes:     this.routes.map(    r => this.dumpRoute(r.name)),
            endpoints:  this.endpoints.map( e => this.dumpEndPoint(e.name)),
            sessions:   this.sessions.map(s => s.toJSON()),
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

    async readConfig(config){
        log.silly('L7mp.readConfig', config);
        try {
            this.static_config = {};
            if(path.extname(config).toLowerCase() === '.yaml')
                this.static_config = YAML.parse(fs.readFileSync(config, 'utf8'));
            else
                this.static_config = JSON.parse(fs.readFileSync(config));
        } catch(err) {
            log.error(`Could not read static configuration ${config}:`,
                      err.code ? `${err.code}: ${err.message}` : err.message);
        }
    }

    async run(argv){
        // validate and execute static config
        if(this.admin.strict){
            log.info('L7mp.run: Initializing OpenAPI backend');

            this.openapi = new L7mpOpenAPI();
            await this.openapi.init();

            // mock a request object for the openapi-backend validator
            let req = {
                version: '1.1',
                method: 'POST',
                url: '/api/v1/setConf',
                query: {},
                headers: { host: 'localhost:65555'},
                'content-type': 'application/json',
                body: this.static_config,
            };

            let res = this.openapi.api.validator.validateRequest(req, 'setConf');
            if(!res.valid)
                log.error("Config file JSON validation error (strict mode: on):\n",
                          JSON.stringify(res.errors, null, 4));
        }

        this.applyAdmin(this.static_config.admin || {});

        // override anything that was set in the config file
        if(argv && 's' in argv) l7mp.admin.strict = true;
        if(argv && 'l' in argv) log.level = argv.l;

        log.info(`Starting l7mp version: ${this.admin.version} Log-level: ${log.level}`,
                 'Strict mode:', l7mp.admin.strict ? 'enabled' : 'disabled');

        try {
            let p = [];
            if('clusters' in this.static_config)
                this.static_config.clusters.map((c) => p.push(this.addCluster(c)));

            if('listeners' in this.static_config)
                this.static_config.listeners.map((l) => p.push(this.addListener(l)));

            if('rulelists' in this.static_config)
                this.static_config.rulelists.map((r) => p.push(this.addRuleList(r)));

            if('rules' in this.static_config)
                this.static_config.rules.map((r) => p.push(this.addRule(r)));

            if('routes' in this.static_config)
                this.static_config.routes.map((r) => p.push(this.addRoute(r)));

            await Promise.all(p);

        } catch(e) {
            log.silly(dumper(e, 6));
            log.error(`Could not initialize static configuration:`,
                      e.code ? `${e.code}: ${e.message}` : e.message);
        }
    }

    ////////////////////////////////////////////////////
    //
    // Admin API
    //
    ////////////////////////////////////////////////////

    applyAdmin(admin) {
        log.silly('L7mp.applyAdmin:', dumper(admin));
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

        // VERSION: package.jon:version + git-commit-hash + git-commit-date
        this.admin.version =
            getVersion({ shaLength: 10, includeDate: true });
        // if git-commit is missing, we get 'null', remove it
        this.admin.version = this.admin.version.replace(/ null/, '');
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
    async addListener(l, options) {
        options = {autogenerated: false, ...options};
        log.info('L7mp.addListener', dumper(l, 8), 'options:', dumper(options,3));

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
                validate: (value) => (value instanceof Array) || (typeof value === 'string'),
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

        l.emitter = this.addSession.bind(this);
        l.autogenerated = options.autogenerated;
        var li = Listener.create(l);
        // li.on('emit', (s) => this.addSession(s));

        // if this is a reference to a named RuleList (aka:
        // MatchActionTable), defer binding until runtime, otherwise,
        // create a new rulelist
        if(Array.isArray(l.rules)){
            let rl = {};
            rl.rules = l.rules;
            rl.name = this.newName(`${li.name}-RuleList-${RuleList.index++}`,
                                   this.getRuleList);
            await this.addRuleList(rl, {autogenerated: true});
            li.rules = rl.name;
        } else if(typeof l.rules === 'string'){
            li.rules = l.rules;
        } else {
            let e = `Invalid RuleList`;
            log.warn(`L7mp.addListener:`, e );
            throw new Error(`Cannot add listener: ${e}`);
        }

        this.listeners.push(li);

        // this may fail: promise
        try {
            await li.run();
        } catch(err){
            log.silly(`L7mp.addListener:`, dumper(err, 6));
            log.warn(`Cannot add listener: ${err.message}`);
            this.deleteListener(li.name, {recursive: true});
            throw err;
        }
        return li;
    }

    getListener(n){
        log.silly('L7mp.getListener:', n);
        return this.listeners.find( ({name}) => name === n );
    }

    dumpListener(n, options){
        options = {recursive: false, ...options};
        log.silly('L7mp.dumpListener:', n, 'options:', dumper(options, 4));

        let l = this.getListener(n);
        if(!l){
            let error = `Unknown listener "${n}"`;
            log.warn('L7mp.dumpListener:', error);
            throw new NotFoundError(`Cannot dump Listener: ${error}`);
        }

        let rules = l.rules;
        if(options.recursive){
            let r = this.getRuleList(l.rules);
            if(r){
                let rl = this.dumpRuleList(r.name, options);
                rules = rl.rules; // we have to "jump through" the rulelist
            } else {
                rules = `${l.rules}:<STALE>`;
            }
        }

        return {
            name:    l.name,
            spec:    l.spec,
            rules:   rules,
            options: l.options,
        };
    }

    deleteListener(n, options){
        options = {recursive: false, ...options};
        log.info('L7mp.deleteListener:', n, 'options:', dumper(options, 4));

        let i = this.listeners.findIndex( ({name}) => name === n);
        if(i >= 0){
            let l = this.listeners[i];
            if(options.recursive){
                let rulelist = this.getRuleList(l.rules);
                if(rulelist && rulelist.autogenerated)
                    this.deleteRuleList(rulelist.name, options);

                // sessions are always autogenerated
                for(let s of this.sessions)
                    if(s.source && s.source.origin === l.name)
                        s.end(new Ok("Listener deleted from API"));
            }
            l.close();

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
    async addCluster(c, options) {
        options = {autogenerated: false, ...options};
        log.info('L7mp.addCluster', dumper(c, 8), 'options:', dumper(options,3));

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

        c.autogenerated = options.autogenerated;
        let cu = Cluster.create(c);
        this.clusters.push(cu);

        if(c.endpoints)
            for(let e of c.endpoints){
                e.name = e.name ||
                    this.newName(`${cu.name}-EndPoint-${EndPoint.index++}`,
                                 this.getEndPoint);
                this.addEndPoint(cu.name, e);
            }

        try {
            await cu.run();
        } catch(err){
            log.silly(`L7mp.addCluster:`, dumper(err, 6));
            log.warn(`Cannot add cluster: ${err.message}`);
            this.deleteCluster(cu.name, {recursive: true});
            throw err;
        }

        return cu;
    }

    getCluster(n){
        log.silly('L7mp.getCluster:', n);
        return this.clusters.find( ({name}) => name === n );
    }

    dumpCluster(n, options){
        options = {recursive: false, ...options};
        log.silly('L7mp.dumpCluster:', n, 'options:', dumper(options, 4));

        let c = this.getCluster(n);
        if(!c){
            let error = `Unknown cluster "${n}"`;
            log.warn('L7mp.dumpCluster:', error);
            throw new NotFoundError(`Cannot dump Cluster: ${error}`);
        }
        let endpoints = c.endpoints.length;
        if(options.recursive)
            endpoints = c.virtual ? [c.virtualEndPoint()] :
            c.endpoints.map(x => this.dumpEndPoint(x.name));

        return {
            name:         c.name,
            spec:         c.spec,
            endpoints:    endpoints,
            loadbalancer: c.loadbalancer.toJSON(),
            options:      c.options,
        };
    }

    deleteCluster(n, options){
        options = {recursive: false, ...options};
        log.info('L7mp.deleteCluster:', n, 'options:', dumper(options, 4));

        let i = this.clusters.findIndex( ({name}) => name === n);
        if(i >= 0){
            let c = this.clusters[i];
            if(options.recursive){
                for(let s of this.sessions)
                    if(s.destination.origin === c.name ||
                       s.chain.ingress.some(stage =>
                                            stage.origin === c.name) ||
                       s.chain.egress.some(stage =>
                                           stage.origin === c.name))
                        s.end(new Ok("Traversed Cluster deleted from API"));
            }

            // deleting a cluster always deletes the endpoints
            let endpoints = c.endpoints.map(e => e.name);
            for(let e of endpoints)
                this.deleteEndPoint(e, options);
            this.clusters.splice(i, 1);
        } else {
            let e = `Unknown cluster "${n}"`;
            log.warn(`L7mp.deleteCluster:`, e );
            throw new Error(`Cannot delete cluster: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // RuleList (aka MatchActionTable) API
    //
    ////////////////////////////////////////////////////
    async addRuleList(r, options) {
        options = {autogenerated: false, ...options};
        log.info('L7mp.addRuleList', dumper(r, 8), 'options:', dumper(options,3));

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

        // rules are added in a separate run
        let rules = Array.from(r.rules);
        r.rules = [];

        r.autogenerated = options.autogenerated;
        let rl = RuleList.create(r);
        this.rulelists.push(rl);

        for(let i = 0; i < rules.length; i++)
            await this.addRuleToRuleList(rl, rules[i], i, {autogenerated: true});

        return r;
    }

     getRuleList(n){
        log.silly('L7mp.getRuleList:', n);
        return this.rulelists.find( ({name}) => name === n );
    }

    dumpRuleList(n, options){
        options = {recursive: false, ...options};
        log.silly('L7mp.dumpRuleList:', n, 'options:', dumper(options, 4));

        let r = this.getRuleList(n);
        if(!r){
            let error = `Unknown RuleList "${n}"`;
            log.warn('L7mp.dumpRuleList:', error);
            throw new NotFoundError(`Cannot dump RuleList: ${error}`);
        }

        let rules = r.rules;
        if(options.recursive){
            rules = [];
            for(let ru of r.rules){
                let rule = this.getRule(ru);
                rules.push(rule ? this.dumpRule(rule.name, options) :
                           `${ru}:<STALE>`);
            }
        }

        return {
            name:   r.name,
            rules:  rules,
        };
    }

    deleteRuleList(n, options){
        options = {recursive: false, ...options};
        log.info('L7mp.deleteRuleList:', n, 'options:', dumper(options, 4));

        let i = this.rulelists.findIndex( ({name}) => name === n);
        if(i >= 0){
            let rl = this.rulelists[i];
            if(options.recursive){
                let rules = [...rl.rules];
                for(let r of rules){
                    let rule = this.getRule(r);
                    if(rule && rule.autogenerated){
                        let i = rl.rules.findIndex( (name) => name === r);
                        this.deleteRuleFromRuleList(rl, i);
                    }
                    this.deleteRule(r, options);
                }
            }

            this.rulelists.splice(i, 1);
        } else {
            let e = `Unknown RuleList "${n}"`;
            log.warn(`L7mp.deleteRuleList:`, e );
            throw new Error(`Cannot delete RuleList: ${e}`);
        }
    }

    // must be called with a ref to rulelist!
    async addRuleToRuleList(rl, rule, pos, options) {
        options = {autogenerated: false, ...options};
        log.info(`L7mp.addRuleToRuleList: position ${pos}:`, dumper(rule, 8),
                 'options:', dumper(options, 4));

        if(!(rl instanceof RuleList)){
            let e = `Invalid rulelist`;
            log.warn(`L7mp.addRuleToRuleList:`, e );
            throw new Error(`Cannot add rule to rulelist: ${e}`);
        }

        if(pos < 0 || pos > rl.rules.length){
            let e = `Cannot insert rule at position ${pos} into rulelist`;
            log.warn(`L7mp.addRuleToRuleList:`, e);
            throw new Error(e);
        }

        let name = rule;
        if(typeof rule === 'object'){
            // inline rule: create
            name = rule.name = rule.name ||
                this.newName(`${rl.name}-Rule-${Rule.index++}`, this.getRule);
            await this.addRule(rule, {autogenerated: true});
        } else if(typeof rule !== 'string'){
            let e = `Invalid rule`;
            log.warn(`L7mp.addRule:`, e );
            throw new Error(`Cannot add rule to rulelist: ${e}`);
        }

        rl.rules.splice(pos, 0, name);
    }

    // must be called with a ref to rulelist!
    // cannot be recursive
    deleteRuleFromRuleList(rl, pos, options){
        options = {recursive: false, ...options};
        log.info(`L7mp.deleteRuleFromRuleList: rulelist ${rl.name}, position ${pos}`,
                 'options:', dumper(options, 4));

        if(!(rl instanceof RuleList)){
            let e = `Invalid rulelist`;
            log.warn(`L7mp.deleteRuleFromRuleList:`, e );
            throw new Error(`Cannot delete rule from rulelist: ${e}`);
        }

        if(pos < 0 || pos > rl.rules.length){
            let e = `Cannot delete rule at position ${pos} from rulelist`;
            log.warn(`L7mp.deleteRuleFromRuleList:`, e);
            throw new Error(e);
        }

        let r = rl.rules[pos];
        if(options.recursive)
            this.deleteRule(r, options);
        rl.rules.splice(pos, 1);
    }

    ////////////////////////////////////////////////////
    //
    // Rule API
    //
    ////////////////////////////////////////////////////
    async addRule(r, options) {
        options = {autogenerated: false, ...options};
        log.info('L7mp.addRule:', dumper(r, 8), 'options:', dumper(options,3));

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

        r.autogenerated = options.autogenerated;
        r = Rule.create(r);
        this.rules.push(r);

        let route = r.action.route;
        if(route){
            if(typeof route === 'object'){
                // inline route: create
                route.name = route.name ||
                    this.newName(`${r.name}-Route-${Route.index++}`, this.getRoute);
                await this.addRoute(route, {autogenerated: true});
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

    dumpRule(n, options){
        options = {recursive: false, ...options};
        log.silly('L7mp.dumpRule:', n, 'options:', dumper(options, 4));

        let r = this.getRule(n);
        if(!r){
            let error = `Unknown Rule "${n}"`;
            log.warn('L7mp.dumpRule:', error);
            throw new NotFoundError(`Cannot dump Rule: ${error}`);
        }

        let res = { name: r.name, match: r.match.toJSON(), action: {} };
        if(r.action.rewrite)
            res.action.rewrite = r.action.rewrite;

        if(r.action.apply){
            res.action.apply = r.action.apply;
        }

        if(r.action.route){
            let route = r.action.route;
            if(options.recursive){
                let rou = this.getRoute(route);
                res.action.route = rou ? this.dumpRoute(rou.name, options) : `${route}:<STALE>`;
            } else {
                res.action.route = route;
            }
        }

        return res;
    }

    deleteRule(n, options){
        options = {recursive: false, ...options};
        log.info('L7mp.deleteRule:', n, 'options:', dumper(options, 4));

        let i = this.rules.findIndex( ({name}) => name === n);
        if(i >= 0){
            let rule = this.rules[i];
            if(options.recursive && rule.action.route){
                let route = this.getRoute(rule.action.route);
                if(route && route.autogenerated)
                    this.deleteRoute(rule.action.route, options);
            }

            this.rules.splice(i, 1);
        } else {
            let e = `Unknown rule "${n}"`;
            log.warn(`L7mp.deleteRule:`, e );
            throw new Error(`Cannot delete rule: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // Route API
    //
    ////////////////////////////////////////////////////
    async addRoute(r, options) {
        options = {autogenerated: false, ...options};
        log.silly('L7mp.addRoute:', dumper(r, 6), 'options:', dumper(options,3));

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

        if(this.getRoute(r.name)){
            let e = `Route "${r.name}" already defined`;
            log.warn('L7mp.addRoute', e);
            throw new Error(`Cannot add route: ${e}`);
        }

        if(typeof r.destination === 'object'){
            // inline cluster: create
            r.destination.name = r.destination.name ||
                this.newName(`${r.name}-Cluster-${Cluster.index++}`, this.getCluster);
            await this.addCluster(r.destination, {autogenerated: true});
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
                        this.newName(`${r.name}-${dir}-Cluster-${Cluster.index++}`, this.getCluster);
                    await this.addCluster(c, {autogenerated: true});
                    r[dir][i] = c.name;
                }
                if(typeof r[dir][i] !== 'string'){
                    let e = `Invalid cluster`;
                    log.warn(`L7mp.addRoute:`, e );
                    throw new Error(`Cannot add route: ${e}`);
                }
            }
        }

        r.autogenerated = options.autogenerated;
        r = Route.create(r);
        this.routes.push(r);

        return r;
    }

    getRoute(n){
        log.silly('L7mp.getRoute:', n);
        return this.routes.find( ({name}) => name === n );
    }

    dumpRoute(n, options){
        options = {recursive: false, ...options};
        log.silly('L7mp.dumpRoute:', n, 'options:', dumper(options, 4));

        let r = this.getRoute(n);
        if(!r){
            let error = `Unknown Route "${n}"`;
            log.warn('L7mp.dumpRoute:', error);
            throw new NotFoundError(`Cannot dump Route: ${error}`);
        }

        let res = {
            name: r.name,
            destination: r.destination,
            ingress:     r.ingress,
            egress:      r.egress,
            retry:       r.retry,
        };

        if(options.recursive){
            let dest = this.getCluster(r.destination);
            res.destination = dest ? this.dumpCluster(dest.name, options) :
                `${r.destination}:<STALE>`;

            for(let dir of ['ingress', 'egress']){
                res[dir] = [];
                for(let i = 0; i < r[dir].length; i++){
                    let c = this.getCluster(r[dir][i]);
                    res[dir].push(c ? this.dumpCluster(r[dir][i], options) :
                                  `${r[dir][i]}:<STALE>`);
                }
            }
        }

        return res;
    }

    deleteRoute(n, options){
        options = {recursive: false, ...options};
        log.silly('L7mp.deleteRoute:', n, 'options:', dumper(options, 4));

        let i = this.routes.findIndex(({name}) => name === n);
        if(i >= 0){
            if(options.recursive){
                let route = this.routes[i];

                let dest = this.getCluster(route.destination);
                if(dest && dest.autogenerated)
                    this.deleteCluster(route.destination, options);

                for(let dir of ['ingress', 'egress']){
                    if(!route[dir]) continue;
                    let cs = [...route[dir]];
                    for(let i = 0; i < cs.length; i++){
                        let c = this.getCluster(cs[i]);
                        if(c && c.autogenerated)
                            this.deleteCluster(cs[i], options);
                    }
                }
            }
            this.routes.splice(i, 1);
        } else {
            let e = `Unknown Route "${n}"`;
            log.warn(`L7mp.deleteRoute:`, e );
            throw new Error(`Cannot delete Route: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // EndPoint API
    //
    ////////////////////////////////////////////////////
    async addEndPoint(c, ep) {
        log.silly('L7mp.addEndPoint:', dumper(ep, 6));

        let schema = {
            name: {
                validate: (value) => /^\S+?$/.test(value),
            },
            spec: {
                validate: (value) => value instanceof Object,
                required: true,
            },
        };

        let e = validate(ep, schema);
        if(e){
            log.warn('L7mp.addEndPoint:', e);
            throw new Error(`Cannot add endpoint: ${e}`);
        }

        if(this.getEndPoint(ep.name)){
            let e = `Endpoint "${ep.name}" already defined`;
            log.warn('L7mp.addEndpoint', e);
            throw new Error(`Cannot add endpoint: ${e}`);
        }

        let cl = this.getCluster(c);
        if(!cl){
            let e = `Unknown cluster "${c}"`;
            log.warn('L7mp.addEndPoint', e);
            throw new NotFoundError(`Cannot add endpoint: ${e}`);
        }

        ep = cl.addEndPoint(ep);
        this.endpoints.push(ep);

        return ep;
    }

    getEndPoint(n){
        log.silly('L7mp.getEndPoint:', n);
        return this.endpoints.find( ({name}) => name === n );
    }

    dumpEndPoint(n){
        log.silly('L7mp.dumpEndPoint:', n);

        let e = this.getEndPoint(n);
        if(!e){
            let error = `Unknown endpoint "${n}"`;
            log.warn('L7mp.dumpEndPoint:', error);
            throw new NotFoundError(`Cannot dump EndPoint: ${error}`);
        }

        return {
            name:   e.name,
            spec:   e.spec,
            weight: e.weight,
        };
    }

    deleteEndPoint(n, options){
        options = {recursive: false, ...options};
        log.silly('L7mp.deleteEndPoint:', n, 'options:', dumper(options, 4));

        let i = this.endpoints.findIndex(({name}) => name === n);
        if(i >= 0){
            let endpoint = this.endpoints[i];
            let cl = this.getCluster(endpoint.cluster.name);

            // this should never happen, fail aggressively
            if(!cl) {
                let e = `Trying to delete EndPoint but the corresponding "${c}" does not exist`;
                log.error('L7mp.deleteEndPoint', e);
            }

            cl.deleteEndPoint(n);
            this.endpoints.splice(i, 1);

            if(options.recursive)
                for(let s of this.sessions){
                    if(s.destination.endpoint && s.destination.endpoint.name === n)
                        // note: s.disconnect returns a promise but we don't want to wait for it to
                        // be resolved: just call without await
                        s.disconnect(s.destination, new Ok(`Traversed EndPoint ${n} of destination `+
                                                           `cluster ${cl.name} is deleted from API`)).
                        catch(err => { /* ignore error silently: disconnect logs what's needed */ });


                    let stages = s.chain.ingress.filter(_stage => _stage.endpoint.name === n);
                    for(let stage of stages)
                        // note: s.disconnect returns a promise but we don't want to wait for it to
                        // be resolved: just call without await
                        s.disconnect(stage, new Ok(`Traversed EndPoint ${n} of Cluster ${cl.name} `+
                                                   `on the ingress chain is deleted from API`)).
                        catch(err => { /* ignore error silently: disconnect logs what's needed */ });

                    stages = s.chain.egress.filter(_stage => _stage.endpoint.name === n);
                    for(let stage of stages)
                        // note: s.disconnect returns a promise but we don't want to wait for it to
                        // be resolved: just call without await
                        s.disconnect(stage, new Ok(`Traversed EndPoint ${n} of Cluster ${cl.name} `+
                                                   `on the egress chain is deleted from API`)).
                        catch(err => { /* ignore error silently: disconnect logs what's needed */ });

                }

        } else {
            let e = `Unknown endpoint "${n}"`;
            log.warn(`L7mp.deleteEndPoint:`, e);
            throw new NotFoundError(`Cannot delete endpoint: ${e}`);
        }
    }

    ////////////////////////////////////////////////////
    //
    // Session API
    //
    ////////////////////////////////////////////////////

    // internal, not to be called from the API
    // input: {metadata: {...}, source: {origin:<name>, stream: <stream>}}
    // output: {status: <HTTP status code>, content: { message: {...}, ...}}
    async addSession(s){
        log.silly('L7mp.addSession');

        let schema = {
            metadata: {
                validate: (value) => value instanceof Object,
                required: true,
            },
            source: {
                validate: (value) => value instanceof Object,
                required: true,
            },
            priv: {
                validate: (value) => value instanceof Object,
            },
        };

        let e = validate(s, schema);
        if(e){
            log.warn('L7mp.addSession:', `Cannot add sesson: ${e}`);
            return;
        }

        s.metadata.name = this.newName(s.metadata.name, this.getSession);
        s = new Session(s);
        this.sessions.push(s);

        s.on('init', () => log.silly(`Session "${s.name}: initializing"`));
        s.on('connect', () => log.info(`Session "${s.name}: successfully (re)connected"`,
                                       dumper(s.metadata, 10)));

        s.on('disconnect', (origin, error) => {
            log.info(`Session "${s.name}":`,
                     `temporarily disconnected at stage "${origin}":`,
                     `reason: ${error ? error.message : 'unknown'}`);
        });

        s.on('error', (err) => {
            // if(log.level === 'silly') dump(e);
            log.warn(`Session "${s.name}": fatal error: ${err.message}` +
                     (err.content ? `: ${err.content}`: ""));
        });

        // normal end
        s.on('end', (err) => {
            log.info(`Session "${s.name}":`, err ? err.message : `Ending normally`);
        });

        // immediate end
        s.on('destroy', () => {
            log.info(`Session "${s.name}": destroyed`);
            setImmediate(() => this.deleteSession(s.name));
        });

        let status = await s.router();
        log.silly(`Session "${s.name}": router finished, status:`, status.status);

        return s;
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
L7mp.index = 0;

module.exports.L7mp = L7mp;
