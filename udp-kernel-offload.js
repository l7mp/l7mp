"use strict";

const child_process = require("child_process");
const fs = require("fs");
const os = require("os");

const bpf = require("bpf");


const REDIRMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_redirects";
const STATMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_statistics";

const BPF_OBJ_FILE = "kernel-offload/udp_kernel_offload.o";

var redirectsMap;
var statisticsMap;

var flows = new Set();

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


function loadBpf(ifName, bpfObjFile) {
    // Check if BPF object file exists
    if (!fs.existsSync(bpfObjFile)) {
        throw new Error("Error during checking BPF object. " +
                        "The object file '" + bpfObjFile + "' does not exist.");
    }

    // Load bpf object with 'tc'

    // Check if clsact is available..
    const qdiscInfoCmdArgs = ["qdisc", "list", "dev", ifName];
    const qdiscInfoCmd = child_process.spawnSync("tc", qdiscInfoCmdArgs,
                                                 { encoding: "utf-8" });
    const clsactIsLoaded = qdiscInfoCmd.stdout.includes("clsact");

    // ..Add clsact if not
    if (!clsactIsLoaded) {
        const qdiscAddCmdArgs = ["qdisc", "add", "dev", ifName, "clsact"];
        const qdiscAddCmd = child_process.spawnSync("tc", qdiscAddCmdArgs,
                                                    { encoding: "utf-8" });
        if (qdiscAddCmd.status !== 0) {
            throw new Error("Error during qdisc creation\n" +
                            "retval: " + qdiscAddCmd.status +
                            "\noutput:" + qdiscAddCmd.output);
        }
    }

    // Load BPF code to interface
    const command = (
        clsactIsLoaded ? "replace" : "add"
    );
    const tcArgs = ["filter", command, "dev", ifName, "ingress", "bpf",
                    "direct-action", "object-file", bpfObjFile,
                    "section", "classifier"];
    const tcLoadBpfCmd = child_process.spawnSync("tc", tcArgs,
                                                 { encoding: "utf-8" });
    if (tcLoadBpfCmd.status !== 0) {
        throw new Error("Error during BPF code loading\n" +
                        "retval: " + tcLoadBpfCmd.status +
                        "\noutput: " + tcLoadBpfCmd.output);
    }
}

function unloadBpf(ifName) {
    // Unload BPF code with 'tc'
    const tcArgs = ["filter", "del", "dev", ifName, "ingress"];
    const tcLoadBpfCmd = child_process.spawnSync("tc", tcArgs,
                                                 { encoding: "utf-8" });
    if (tcLoadBpfCmd.status !== 0) {
        throw new Error("Error during BPF code unloading\n" +
                        "retval: " + tcLoadBpfCmd.status +
                        "\noutput: " + tcLoadBpfCmd.output);
    }
}


function initOffloadEngine() {
    //  Create maps and objs

    // const redirectsMap = bpf.createMap({  // TODO?
    //     type: bpf.MapType.LRU_HASH,
    //     name: "sidecar_redirects",
    //     keySize: 16,
    //     valueSize: 16,
    //     maxEntries: 10240
    // });

    // const statisticsMap = bpf.createMap({
    //     type: bpf.MapType.LRU_HASH,
    //     name: "sidecar_statistics",
    //     keySize: 16,
    //     valueSize: 24,
    //     maxEntries: 10240
    // });

    //  Load BPF object on all interfaces
    for (const ifName of Object.keys(os.networkInterfaces())) {
        loadBpf(ifName, BPF_OBJ_FILE);
    }

    // Connect maps
    redirectsMap = new bpf.RawMap(
        bpf.createMapRef(bpf.objGet(REDIRMAP_PATH), { transfer: true })
    );
    statisticsMap = new bpf.RawMap(
        bpf.createMapRef(bpf.objGet(STATMAP_PATH), { transfer: true })
    );
}

function shutdownOffloadEngine() {
    // unload BPF object on network interfaces
    for (const ifName of Object.keys(os.networkInterfaces())) {
        unloadBpf(ifName);
    }
    // unlink BPF maps
    fs.unlinkSync(REDIRMAP_PATH);
    fs.unlinkSync(STATMAP_PATH);
}

function requestOffload(inFlow, redirFlow, action, metrics=null) {
    const inFlowBuf = inFlow.toBuffer();
    //  Action param: “create”, “remove”
    switch (action) {
    case "create":
        //  Register 5-tuple to statistics and redirects map
        const zeroStatBuf = Buffer.alloc(statisticsMap.ref.valueSize, 0);
        statisticsMap.set(inFlowBuf, zeroStatBuf);
        redirectsMap.set(inFlowBuf, redirFlow.toBuffer());
        //  Register metrics
        if (metrics !== null) {
            inFlow.metrics = metrics;
        }
        // Store flow
        flows.add(inFlow);
        break;
    case "remove":
        // Delete 5-tuple from both redirects and statistics maps
        redirectsMap.delete(inFlowBuf);
        statisticsMap.delete(infFlowBuf);
        // Delete flow from local flow storage
        flows.delete(inFlow);
        break;
    default:
        throw new Error("Invalid action for requestOffload");
    }
}

function getStat(inFlow) {
    const statBuf = statisticsMap.get(inFlow.toBuffer());
    const flowStat = new FlowStat().fromBuffer(statBuf);
    var ret = {};
    for (const metric of inFlow.metrics) {
        ret[metric] = flowStat[metric];
    }
    return ret;
}


module.exports = {
    Flow,
    FlowStat,
    initOffloadEngine,
    shutdownOffloadEngine,
    requestOffload,
    getStat,
};
