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

"use strict";

const child_process = require("child_process");
const fs            = require("fs");
const os            = require("os");
const log           = require('npmlog');
const bpf           = require("bpf");
const ipaddr        = require("ipaddr.js");

const REDIRMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_redirects";
const STATMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_statistics";

const BPF_OBJ_FILE = "./kernel-offload/udp_kernel_offload.o";

const PROC_TARGETS = ["/proc/sys/net/ipv4/conf/all/forwarding",
                      "/proc/sys/net/ipv4/conf/all/route_localnet",
                      "/proc/sys/net/ipv4/conf/all/accept_local"];

class Flow {
    constructor(src_ip4=0, src_port=0, dst_ip4=0, dst_port=0, proto=0,
                metrics=["pkts", "bytes"])
    {
        this.src_ip4 = src_ip4;
        this.src_port = src_port;
        this.dst_ip4 = dst_ip4;
        this.dst_port = dst_port;
        this.proto = proto;
        this.metrics=metrics;
    }

    toBuffer(buffer_size=16) {
        var buf = Buffer.alloc(buffer_size);
        buf.writeUInt32BE(this.src_ip4, 0);
        buf.writeUInt32BE(this.dst_ip4, 4);
        buf.writeUInt16BE(this.src_port, 8);
        buf.writeUInt16BE(this.dst_port, 10);
        buf.writeUInt32LE(this.proto, 12);
        return buf;
    }

    fromBuffer(buffer) {
        this.src_ip4 = buffer.readUInt32BE(0);
        this.dst_ip4 = buffer.readUInt32BE(4);
        this.src_port = buffer.readUInt16BE(8);
        this.dst_port = buffer.readUInt16BE(10);
        this.proto = buffer.readUInt32LE(12);
        return this;
    }

    toString(){
        let from = ipaddr.IPv4.parse(`${this.src_ip4}`);
        let to   = ipaddr.IPv4.parse(`${this.dst_ip4}`);
        return `${from}:${this.src_port}->${to}:${this.dst_port}[${this.proto}]`;
    }
}

class FlowStat {
    constructor(pkts=0, bytes=0, timestamp_last=0) {
        this.pkts = BigInt(pkts);
        this.bytes = BigInt(bytes);
        this.timestamp_last = BigInt(timestamp_last);
    }
    toBuffer(buffer_size=24) {
        var buf = Buffer.alloc(buffer_size);
        buf.writeBigUInt64LE(BigInt(this.pkts), 0);
        buf.writeBigUInt64LE(BigInt(this.bytes), 8);
        buf.writeBigUInt64LE(BigInt(this.timestamp_last), 16);
        return buf;
    }
    fromBuffer(buffer) {
        this.pkts = buffer.readBigUInt64LE(0);
        this.bytes = buffer.readBigUInt64LE(8);
        this.timestamp_last = buffer.readBigUInt64LE(16);
        return this;
    }
}

class UDPOffload {
    constructor(setup=false, ifNames=[]){
        this.setup = setup;
        this.ifNames = ifNames.length > 0 ? ifNames : Object.keys(os.networkInterfaces());
        this.redirectsMap = null;
        this.statisticsMap = null;
        this.flows = new Set();
    }

    loadBpf(ifName, bpfObjFile) {
        log.silly(`UDPOffload.loadBpf: if: ${ifName}`);
        
        // Check if BPF object file exists
        if (!fs.existsSync(bpfObjFile)) {
            throw new Error("UDPOffload.loadBpf: Error during checking BPF object: " +
                            "Object file '" + bpfObjFile + "' does not exist.");
        }

        // Load bpf object with 'tc'

        // Check if clsact is available..
        const qdiscInfoCmdArgs = ["qdisc", "list", "dev", ifName];
        const qdiscInfoCmd = child_process.spawnSync("/sbin/tc", qdiscInfoCmdArgs,
                                                     { encoding: "utf-8" });
        const clsactIsLoaded = qdiscInfoCmd.stdout && qdiscInfoCmd.stdout.includes("clsact");

        // Add clsact if not
        if (!clsactIsLoaded) {
            // console.log(clsactIsLoaded);
            if(!this.setup){
                throw new Error(`UDPOffload.loadBpf: Qdisc unavailable on ${ifName}, ` +
                                `(run 'tc qdisc add dev ${ifName} clsact' to fix)`);

            }

            const qdiscAddCmdArgs = ["qdisc", "add", "dev", ifName, "clsact"];
            const qdiscAddCmd = child_process.spawnSync("/sbin/tc", qdiscAddCmdArgs,
                                                        { encoding: "utf-8" });
            if (qdiscAddCmd.status !== 0) {
                throw new Error("UDPOffload.loadBpf: Error during qdisc creation: " +
                                "retval: " + qdiscAddCmd.status +
                                ", output: " + qdiscAddCmd.output);
            }
        }

        // Load BPF code to interface
        const command = (
            clsactIsLoaded ? "replace" : "add"
        );
        const tcArgs = ["filter", command, "dev", ifName, "ingress", "bpf",
                        "direct-action", "object-file", bpfObjFile,
                        "section", "classifier"];
        const tcLoadBpfCmd = child_process.spawnSync("/sbin/tc", tcArgs,
                                                     { encoding: "utf-8" });
        if (tcLoadBpfCmd.status !== 0) {
            throw new Error("UDPOffload.loadBpf: Error during BPF code loading: " +
                            "retval: " + tcLoadBpfCmd.status +
                            ", output: " + tcLoadBpfCmd.output);
        }
    }
    
    unloadBpf(ifName) {
        log.silly(`UDPOffload.unloadBpf: if: ${ifName}`);

        if(this.setup){
            // Unload BPF code with 'tc'
            const tcArgs = ["filter", "del", "dev", ifName, "ingress"];
            const tcLoadBpfCmd = child_process.spawnSync("/sbin/tc", tcArgs,
                                                         { encoding: "utf-8" });
            if (tcLoadBpfCmd.status !== 0) {
                throw new Error("UDPOffload.loadBpf: Error during BPF code unloading: " +
                                "retval: " + tcLoadBpfCmd.status +
                                ", output: " + tcLoadBpfCmd.output);
            }
        }
    }

    createBpfMaps() {
        log.silly("UDPOffload.createBpfMaps");

        // Connect maps
        this.redirectsMap = new bpf.RawMap(
            bpf.createMapRef(bpf.objGet(REDIRMAP_PATH), { transfer: true })
        );
        this.statisticsMap = new bpf.RawMap(
            bpf.createMapRef(bpf.objGet(STATMAP_PATH), { transfer: true })
        );
    }
   
    unlinkBpfMaps() {
        log.silly("UDPOffload.unlinkBpfMaps");
        const mapPaths = [REDIRMAP_PATH, STATMAP_PATH];
        mapPaths.forEach( (path) => {
            if (fs.existsSync(path)) {
                fs.unlinkSync(path);
            }
        });
    }

    setKernelParameters() {
        log.silly('UDPOffload.setKernelParameters');
        // Enable forwarding and localhost routing
        PROC_TARGETS.forEach( (fp) => {
            try{
                fs.writeFileSync(fp, "1");
            } catch (err) {
                throw new Error('UDPOffload.setKernelParameters: ' +
                                `Error setting sysctl ${fp}: ${err}`);
            }
        });
    }

    checkKernelParameters() {
        // check if forwarding and localhost routing enabled
        log.silly('UDPOffload.checkKernelParameters');
        
        PROC_TARGETS.forEach( (fp) => {
            let data;
            try {
                data = fs.readFileSync(fp);
            } catch (err) {
                throw new Error('UDPOffload.checkKernelParameters: ' +
                                `Could not read sysctl ${fp}: ${err}`);
            }
            if(data.toString().trim() !== '1'){
                throw new Error('UDPOffload.checkKernelParameters: ' +
                                `Wrong sysctl ${fp}: ${data}`);
            }
        });
        return true;
    }

    init() {
        log.silly(`UDPOffload.init: init: ${!!this.setup}, ifnames: ${this.ifNames}`);
        
        // Unlink globally pinned maps
        this.unlinkBpfMaps();

        // Prepare host kernel
        try{
            if(this.setup)
                this.setKernelParameters();
            else 
                this.checkKernelParameters();
        } catch (err) { throw err; };

        // Load BPF object on required interfaces
        for (const ifName of this.ifNames) {
            // try{
                this.loadBpf(ifName, BPF_OBJ_FILE);
            // } catch(err) { throw err; };
        }

        // Recreate maps
        this.createBpfMaps();
    }

    shutdown() {
        log.silly(`UDPOffload.shutdown`);
        
        // Unload BPF object on network interfaces
        for (const ifName of this.ifNames) {
            this.unloadBpf(ifName);
        }

        // Unlink BPF maps
        this.unlinkBpfMaps();
    }

    setOffload(inFlow, redirFlow, action, metrics=null) {
        // redirFlow may not be specified on a remove command
        log.info(`UDPOffload.setOffload: ${inFlow} =>`,
                  `${redirFlow ||  "<UNKNOWN>"}, action: ${action}`);

        const inFlowBuf = inFlow.toBuffer();
        switch (action) {
        case "create":
            // Register 5-tuple to statistics and redirects map
            const zeroStatBuf = Buffer.alloc(this.statisticsMap.ref.valueSize, 0);
            this.statisticsMap.set(inFlowBuf, zeroStatBuf);
            this.redirectsMap.set(inFlowBuf, redirFlow.toBuffer());
            // Register metrics
            if (metrics !== null) {
                inFlow.metrics = metrics;
            }
            // Store flow
            this.flows.add(inFlow);
            break;
        case "remove":
            // Delete flow from both redirects and statistics maps
            this.redirectsMap.delete(inFlowBuf);
            this.statisticsMap.delete(inFlowBuf);
            // Delete flow from local flow storage
            this.flows.delete(inFlow);
            break;
        default:
            throw new Error(`UDPOffload.setOffload: Invalid action ${action}`);
        }
    }

    getStat(inFlow) {
        log.silly(`UDPOffload.getStat: ${inFlow}`);

        const statBuf = this.statisticsMap.get(inFlow.toBuffer());
        const flowStat = new FlowStat().fromBuffer(statBuf);
        var ret = {};
        for (const metric of inFlow.metrics) {
            ret[metric] = flowStat[metric];
        }
        return ret;
    }

    dumpStat(){
        log.silly(`UDPOffload.dumpStat`);

        this.flows.forEach( (flow) => {
            let m = this.getStat(flow);
            console.log(`Src: ${flow}: ${m.pkts} pkts, ${m.bytes} bytes`);
        });
    }
}

module.exports.UDPOffload = UDPOffload;
module.exports.Flow = Flow;
module.exports.FlowStat = FlowStat;
