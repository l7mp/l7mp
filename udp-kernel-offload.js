"use strict";

const child_process = require("child_process");
const fs = require("fs");
const os = require("os");

const bpf = require("bpf");


const REDIRMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_redirects";
const STATMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_statistics";

const BPF_OBJ_FILE = "kernel-offload/udp_kernel_offload.o";

var redirMap;
var statisticsMap;

var statistics = {};


function Flow(src_ip4=0, src_port=0, dst_ip4=0, dst_port=0, proto=0) {
    this.src_ip4 = src_ip4;
    this.src_port = src_port;
    this.dst_ip4 = dst_ip4;
    this.dst_port = dst_port;
    this.proto = proto;
}

function FlowStat(pkts=0, bytes=0, timestamp_last=0) {
    this.pkts = BigInt(pkts);
    this.bytes = BigInt(bytes);
    this.timestamp_last = BigInt(timestamp_last);
}

function convertFlowToBuffer(flow, map, buf_size=16) {
    var buf = Buffer.alloc(buf_size);
    buf.writeUInt32BE(flow.src_ip4, 0);
    buf.writeUInt32BE(flow.dst_ip4, 4);
    buf.writeUInt16BE(flow.src_port, 8);
    buf.writeUInt16BE(flow.dst_port, 10);
    buf.writeUInt32LE(flow.proto, 12);
    return buf;
}

function convertBufferToFlow(buf) {
    var flow_ = new Flow(
        buf.readUInt32BE(0),  // src_ip4
        buf.readUInt32BE(4),  // dst_ip5
        buf.readUInt16BE(8),  // src_port
        buf.readUInt16BE(10), // dst_port
        buf.readUInt32LE(12)  // proto
    );
    return flow_;
}

function convertFlowStatToBuffer(flow_stat, buf_size=24) {
    var buf = Buffer.alloc(buf_size);
    buf.writeBigUInt64LE(BigInt(flow_stat.pkts), 0);
    buf.writeBigUInt64LE(BigInt(flow_stat.bytes), 8);
    buf.writeBigUInt64LE(BigInt(flow_stat.timestamp_last), 16);
    return buf;
}

function convertBufferToFlowStat(buf) {
    var flow_stat_ = new FlowStat(
        buf.readBigUInt64LE(0),  // pkts
        buf.readBigUInt64LE(8),  // bytes
        buf.readBigUInt64LE(16)  // timestamp_last
    );
    return flow_stat_;
}



function loadBpf(ifName, bpfObjFile="udp_kernel_offload.o") {
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

    // const redirectsMap = bpf.createMap({  // TODO
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

    // console.log(redirectsMap, "\nfd: ", redirectsMap.fd, "\n");
    // console.log(statisticsMap, "\nfd: ", statisticsMap.fd, "\n");


    //  Load BPF object on all interfaces
    for (const ifName of Object.keys(os.networkInterfaces())) {
        loadBpf(ifName, BPF_OBJ_FILE);
    }

    // Connect maps
    global.redirectsMap = new bpf.RawMap(
        bpf.createMapRef(bpf.objGet(REDIRMAP_PATH), { transfer: true })
    );
    global.statisticsMap = new bpf.RawMap(
        bpf.createMapRef(bpf.objGet(STATMAP_PATH), { transfer: true })
    );
}

function shutdownOffloadEngine() {
   for (const ifName of Object.keys(os.networkInterfaces())) {
        unloadBpf(ifName);
    }
    fs.unlinkSync(REDIRMAP_PATH);
    fs.unlinkSync(STATMAP_PATH);
}

function requestOffload(inFlow, redirFlow, action, metrics=null) {
    //  Action param: “create”, “remove”
    switch (action) {
    case "create":
        //  Register 5-tuple to statistics and redirects map
        const zeroStatBuf = Buffer.alloc(global.statisticsMap.ref.valueSize, 0);
        global.statisticsMap.set(convertFlowToBuffer(inFlow), zeroStatBuf);
        global.redirectsMap.set(convertFlowToBuffer(inFlow),
                                convertFlowToBuffer(redirFlow));
        break;
    case "remove":
        // Delete 5-tuple from both redirects and statistics maps
        global.redirectsMap.delete(convertFlowToBuffer(inFlow));
        global.statisticsMap.delete(convertFlowToBuffer(inFlow));
        break;
    default:
        throw new Error("Invalid action for requestOffload");
    }

    //  Store requested metrics
    // TODO
}

function getStat(inFlow) {
    //  Collect metrics:
    const statBuf = global.statisticsMap.get(convertFlowToBuffer(inFlow));
    statistics[inFlow] = convertBufferToFlowStat(statBuf);
    return statistics[inFlow];
}

module.exports = {
    initOffloadEngine,
    shutdownOffloadEngine,
    requestOffload,
    getStat
};
