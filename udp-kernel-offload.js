const bpf = require('bpf');


function flow(src_ip4=0, src_port=0, dst_ip4=0, dst_port=0, proto=0) {
    this.src_ip4 = src_ip4;   // uint32_t src_ip4;
    this.src_port = src_port; // uint16_t src_port;
    this.dst_ip4 = dst_ip4;   // uint32_t dst_ip4;
    this.dst_port = dst_port; // uint16_t dst_port;
    this.proto = proto;       // uint32_t proto;
}

function flow_stat(pkts=0, bytes=0, timestamp_last=0) {
    this.pkts = BigInt(pkts);                     // uint64_t pkts;
    this.bytes = BigInt(bytes);	                  // uint64_t bytes;
    this.timestamp_last = BigInt(timestamp_last); // uint64_t timestamp_last;
}

function convert_flow_to_buffer(flow, map, buf_size=16) {
    var buf = Buffer.alloc(buf_size);
    buf.writeUInt32BE(flow.src_ip4, 0);
    buf.writeUInt32BE(flow.dst_ip4, 4);
    buf.writeUInt16BE(flow.src_port, 8);
    buf.writeUInt16BE(flow.dst_port, 10);
    buf.writeUInt32LE(flow.proto, 12);
    return buf;
}

function convert_buffer_to_flow(buf) {
    var flow_ = new flow(
	src_ip4 = buf.readUInt32BE(0),
	dst_ip4 = buf.readUInt32BE(4),
	src_port = buf.readUInt16BE(8),
	dst_port = buf.readUInt16BE(10),
	proto = buf.readUInt32LE(12),
    );
    return flow_;
}

function convert_flow_stat_to_buffer(flow_stat, buf_size=24) {
    var buf = Buffer.alloc(buf_size);
    buf.writeBigUInt64LE(BigInt(flow_stat.pkts), 0);
    buf.writeBigUInt64LE(BigInt(flow_stat.bytes), 8);
    buf.writeBigUInt64LE(BigInt(flow_stat.timestamp_last), 16);
    return buf;
}

function convert_buffer_to_flow_stat(buf) {
    var flow_stat_ = new flow_stat(
	pkts = buf.readBigUInt64LE(0),
	bytes = buf.readBigUInt64LE(8),
	timestamp_last = buf.readBigUInt64LE(16),
    );
    return flow_stat_;
}


///////////////////////////////////


// open maps
const REDIRMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_redirects"
const STATMAP_PATH = "/sys/fs/bpf/tc/globals/sidecar_statistics"

const redir_map_fd = bpf.objGet(REDIRMAP_PATH);
const stat_map_fd = bpf.objGet(STATMAP_PATH);

const redir_map = new bpf.RawMap(bpf.createMapRef(redir_map_fd, { transfer: true }));
const stat_map = new bpf.RawMap(bpf.createMapRef(stat_map_fd, { transfer: true }));

// write to maps
var flow_in = new flow(
    src_ip4 = 0,
    src_port = 0,
    dst_ip4 = 0xa000001,
    dst_port = 1234,
    proto = 17,
);
var flow_redir = new flow(
    src_ip4 = 0xa000001,
    src_port = 1235,
    dst_ip4 = 0x7f000001,
    dst_port = 1235,
    proto = 17,
);
redir_map.set(convert_flow_to_buffer(flow_in), convert_flow_to_buffer(flow_redir));

var flow_in2 = new flow(
    src_ip4 = 0,
    src_port = 0,
    dst_ip4 = 0x7f000001,
    dst_port = 1237,
    proto = 17,
);
var flow_redir2 = new flow(
    src_ip4 = 0xa000001,
    src_port = 1236,
    dst_ip4 = 0xa000002,
    dst_port = 1236,
    proto = 17,
);
redir_map.set(convert_flow_to_buffer(flow_in2), convert_flow_to_buffer(flow_redir2));


// read from maps
var stat_buf = stat_map.getPerCPU(convert_flow_to_buffer(flow_in));

var flow_stat_agg = new flow_stat();
for (var i = 0; i < stat_buf.length; i+=stat_map.ref.valueSize) {
    var stats = convert_buffer_to_flow_stat(stat_buf.slice(i, i+stat_map.ref.valueSize));
    flow_stat_agg.pkts += stats.pkts;
    flow_stat_agg.bytes += stats.bytes;
    if (stats.timestamp_last > flow_stat_agg.timestamp_last)
	flow_stat_agg.timestamp_last = stats.timestamp_last;
}

console.log(flow_stat_agg);
