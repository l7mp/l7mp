#include <arpa/inet.h>
#include <linux/if_ether.h>
#include <linux/if_packet.h>
#include <linux/pkt_cls.h>
#include <linux/udp.h>
#include <stddef.h>
#include <stdint.h>

#include <asm/byteorder.h>
#include <bpf_helpers.h>
#include <linux/bpf.h>
#include <linux/ip.h>

#ifndef memcpy
#define memcpy(dest, src, n) __builtin_memcpy((dest), (src), (n))
#endif

#define SEC(NAME) __attribute__((section(NAME), used))

#define MAPSIZE 10240

struct flow_id {
	uint32_t src_ip4;
	uint32_t dst_ip4;
	uint16_t src_port;
	uint16_t dst_port;
	uint32_t proto;
} __attribute__((packed));

struct flow_stat {
	uint64_t pkts;
	uint64_t bytes;
	uint64_t timestamp_last;
} __attribute__((packed));

static __always_inline int ip_decrease_ttl(struct iphdr *iph)
{
	__u32 check = iph->check;
	check += __constant_htons(0x0100);
	iph->check = (__u16)(check + (check >= 0xFFFF));
	return --iph->ttl;
}

__attribute__((__always_inline__)) static inline __u16 csum_fold_helper(__u64 csum)
{
	int i;
#pragma unroll
	for (i = 0; i < 4; i++) {
		if (csum >> 16)
			csum = (csum & 0xffff) + (csum >> 16);
	}
	return ~csum;
}

__attribute__((__always_inline__)) static inline void ipv4_csum(void *data_start, int data_size,
								__u64 *csum)
{
	*csum = bpf_csum_diff(0, 0, data_start, data_size, *csum);
	*csum = csum_fold_helper(*csum);
}

__attribute__((__always_inline__)) static inline void update_csum(__u64 *csum, __be32 old_addr,
								  __be32 new_addr)
{
	// ~HC
	*csum = ~*csum;
	*csum = *csum & 0xffff;
	// + ~m
	__u32 tmp;
	tmp = ~old_addr;
	*csum += tmp;
	// + m
	*csum += new_addr;
	// then fold and complement result !
	*csum = csum_fold_helper(*csum);
}

__attribute__((__always_inline__)) static inline int update_udp_checksum(__u64 cs, int old_addr,
									 int new_addr)
{
	update_csum(&cs, old_addr, new_addr);
	return cs;
}

#define PIN_NONE 0
#define PIN_OBJECT_NS 1
#define PIN_GLOBAL_NS 2
struct bpf_elf_map {
	__u32 type;
	__u32 size_key;
	__u32 size_value;
	__u32 max_elem;
	__u32 flags;
	__u32 id;
	__u32 pinning;
};

struct bpf_elf_map SEC("maps") sidecar_redirects = {
	.type = BPF_MAP_TYPE_LRU_HASH,
	.size_key = sizeof(struct flow_id),
	.size_value = sizeof(struct flow_id),
	.max_elem = MAPSIZE,
	.pinning = PIN_GLOBAL_NS,
};

struct bpf_elf_map SEC("maps") sidecar_statistics = {
	.type = BPF_MAP_TYPE_LRU_HASH,
	.size_key = sizeof(struct flow_id),
	.size_value = sizeof(struct flow_stat),
	.max_elem = MAPSIZE,
	.pinning = PIN_GLOBAL_NS,
};

SEC("classifier")
int sidecar(struct __sk_buff *skb)
{
	void *data = (void *)(uintptr_t)skb->data;
	void *data_end = (void *)(uintptr_t)skb->data_end;
	const char zero_mac[6] = {0, 0, 0, 0, 0, 0};
	struct ethhdr *eth = data;
	struct iphdr *iphdr = (struct iphdr *)(eth + 1);
	struct udphdr *udphdr = (struct udphdr *)(iphdr + 1);
	struct bpf_fib_lookup fib_params = {};
	struct flow_id flow_in;	    // 5-tuple of incoming connections
	struct flow_id *flow_redir; // 5-tuple of redirected flow
	struct flow_stat *flow_in_stat;
	struct flow_stat flow_in_stat_new;
	int action = TC_ACT_OK;
	int rc;

	/* sanity check needed by the eBPF verifier */
	if ((void *)(udphdr + 1) > data_end) {
		return TC_ACT_OK;
	}

	/* skip non-IP packets */
	if (eth->h_proto != __constant_htons(ETH_P_IP)) {
		return TC_ACT_OK;
	}

	/* skip non-UDP packets */
	if (iphdr->protocol != IPPROTO_UDP) {
		return TC_ACT_OK;
	}

	/* Lookup flow in redirects-map */
	// step1: lookup fully-specified flow
	flow_in.proto = IPPROTO_UDP;
	flow_in.src_ip4 = iphdr->saddr;
	flow_in.src_port = udphdr->source;
	flow_in.dst_ip4 = iphdr->daddr;
	flow_in.dst_port = udphdr->dest;
	flow_redir = bpf_map_lookup_elem(&sidecar_redirects, &flow_in);
	if (!flow_redir) {
		// step2: lookup flow with no source info
		flow_in.src_ip4 = 0;
		flow_in.src_port = 0;
		flow_redir = bpf_map_lookup_elem(&sidecar_redirects, &flow_in);
		if (!flow_redir) {
			return TC_ACT_OK;
		}
	}

	/* Replace 5-tuple */
	iphdr->saddr = flow_redir->src_ip4;
	iphdr->daddr = flow_redir->dst_ip4;
	udphdr->source = flow_redir->src_port;
	udphdr->dest = flow_redir->dst_port;

	/* Update IPv4 checksum */
	iphdr->check = 0;
	__u64 csum = 0;
	ipv4_csum(iphdr, sizeof(*iphdr), &csum);
	iphdr->check = csum;

	/* Update UDP checksum */
	udphdr->check = update_udp_checksum(udphdr->check, flow_in.src_ip4, iphdr->saddr);
	udphdr->check = update_udp_checksum(udphdr->check, flow_in.dst_ip4, iphdr->daddr);
	if (udphdr->dest != flow_in.dst_port) {
		udphdr->check = update_udp_checksum(udphdr->check, flow_in.dst_port, udphdr->dest);
	}
	if (udphdr->source != flow_in.src_port) {
		udphdr->check = update_udp_checksum(udphdr->check, flow_in.src_port, udphdr->source);
	}

	/* Redirect */
	if (iphdr->daddr == 0x100007f) {
		/* ip_decrease_ttl(iphdr); */
		memcpy(eth->h_dest, &zero_mac, ETH_ALEN);
		memcpy(eth->h_source, &zero_mac, ETH_ALEN);
		action = bpf_skb_change_type(skb, PACKET_HOST);
		if (!action) {
			// FIXME hardcoded loopback dev idx
			action = bpf_redirect(1, BPF_F_INGRESS);
		}
	} else {
		fib_params.family = AF_INET;
		fib_params.tos = iphdr->tos;
		fib_params.l4_protocol = iphdr->protocol;
		fib_params.sport = 0;
		fib_params.dport = 0;
		fib_params.tot_len = __constant_ntohs(iphdr->tot_len);
		fib_params.ipv4_src = iphdr->saddr;
		fib_params.ipv4_dst = iphdr->daddr;

		fib_params.ifindex = skb->ingress_ifindex;

		rc = bpf_fib_lookup(skb, &fib_params, sizeof(fib_params), 0);

		switch (rc) {
		case BPF_FIB_LKUP_RET_SUCCESS: /* lookup successful */
			ip_decrease_ttl(iphdr);
			memcpy(eth->h_dest, fib_params.dmac, ETH_ALEN);
			memcpy(eth->h_source, fib_params.smac, ETH_ALEN);
			action = bpf_redirect(fib_params.ifindex, 0);
			break;
		case BPF_FIB_LKUP_RET_BLACKHOLE:   /* dest is blackholed; can be dropped */
		case BPF_FIB_LKUP_RET_UNREACHABLE: /* dest is unreachable; can be dropped */
		case BPF_FIB_LKUP_RET_PROHIBIT:	   /* dest not allowed; can be dropped */
			action = TC_ACT_SHOT;
			break;
		case BPF_FIB_LKUP_RET_NOT_FWDED:    /* packet is not forwarded */
		case BPF_FIB_LKUP_RET_FWD_DISABLED: /* fwding is not enabled on ingress */
		case BPF_FIB_LKUP_RET_UNSUPP_LWT:   /* fwd requires encapsulation */
		case BPF_FIB_LKUP_RET_NO_NEIGH:	    /* no neighbor entry for nh */
		case BPF_FIB_LKUP_RET_FRAG_NEEDED:  /* fragmentation required to fwd */
			break;
		}
	}
	/* Account sent packet */
	if ((action == TC_ACT_OK) || (action == TC_ACT_REDIRECT)) {
		flow_in_stat = bpf_map_lookup_elem(&sidecar_statistics, &flow_in);
		if (flow_in_stat) {
			flow_in_stat->pkts += 1;
			flow_in_stat->bytes += skb->len;
			flow_in_stat->timestamp_last = bpf_ktime_get_ns();
		} else {
			flow_in_stat_new.pkts = 1;
			flow_in_stat_new.bytes = skb->len;
			flow_in_stat_new.timestamp_last = bpf_ktime_get_ns();
			bpf_map_update_elem(&sidecar_statistics, &flow_in, &flow_in_stat_new, BPF_ANY);
		}
	}
	return action;
}

char _license[] SEC("license") = "GPL";
