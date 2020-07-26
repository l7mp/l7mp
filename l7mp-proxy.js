#!/usr/bin/env node

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
const log        = require('npmlog');
const path       = require('path');
const YAML       = require('yamljs');
const hostname   = os.hostname();

const L7mp       = require('./l7mp.js').L7mp;

// Globals
global.l7mp = new L7mp();

// Set up logging
Object.defineProperty(log, 'heading',
                      { get: () => { return new Date().toISOString() } });
log.headingStyle = { bg: '', fg: 'white' }
log.stream = process.stderr;
log.on('log.error', (msg) => {
    console.error(`Error: ${msg.prefix}: ${msg.message}`);
    process.exit(1);
});

// Cleanup handlers
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

process.title = 'l7mp'

// Command line args
const usage = 'l7mp -c <static_config> -s -l <log-level>'
var argv = parseArgs(process.argv.slice(2));
var config = argv.c;

if(!('c' in argv)){
    console.error(usage);
    process.exit(1);
}

// Start
if('l' in argv) log.level = argv.l;
if('s' in argv) l7mp.admin.strict = true;

l7mp.readConfig(config)
if(!l7mp.static_config)
    log.error('No static configuration found');

l7mp.run(argv);
