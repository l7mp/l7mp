#include <arpa/inet.h>
#include <bpf.h>
#include <errno.h>
#include <libbpf.h>
#include <linux/bpf.h>
#include <linux/unistd.h>
#include <netinet/ip.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define MAX(a,b) ((a) > (b) ? a : b)

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

static void print_usage(void) {
  printf("Usage: sidecar [...]\n");
  printf("       -v          Enable verbose mode\n");
  printf("       -h          Display this help\n");
  printf("       -s <sec>    Set time to wait before reading statistics\n");
}

int main(int argc, char *argv[]) {
  int opt;
  int ret = 0;
  bool verbose = false;
  int statistics_map_fd = -1;
  int redirects_map_fd = -1;
  char statistics_map_path[] = "/sys/fs/bpf/tc/globals/sidecar_statistics";
  char redirects_map_path[] = "/sys/fs/bpf/tc/globals/sidecar_redirects";
  int sleep_time = 0;
  int nr_cpus = libbpf_num_possible_cpus();
  if (nr_cpus < 0) {
    fprintf(stderr, "libbpf_num_possible_cpus error: %d\n", nr_cpus);
    return(1);
  }
  struct flow_stat flow_in_stats[nr_cpus];

  // manage cli args TODO
  while ((opt = getopt(argc, argv, "vhs:")) != -1) {
    switch (opt) {
      case 's':
        sleep_time = atoi(optarg);
        break;
      case 'v':
        verbose = true;
        break;
      default:
        print_usage();
        goto out;
    }
  }

  if (verbose) {
    printf("statistics_map_path: %s\n", statistics_map_path);
    printf("redirects_map_path: %s\n", redirects_map_path);
    printf("number of CPUs: %d\n", nr_cpus);
  }

  // open maps
  statistics_map_fd = bpf_obj_get(statistics_map_path);
  if (statistics_map_fd < 0) {
    fprintf(stderr, "bpf_obj_get(%s): %s(%d)\n", statistics_map_path,
            strerror(errno), errno);
    goto out;
  }

  redirects_map_fd = bpf_obj_get(redirects_map_path);
  if (redirects_map_fd < 0) {
    fprintf(stderr, "bpf_obj_get(%s): %s(%d)\n", redirects_map_path,
            strerror(errno), errno);
    goto out;
  }

  // write to maps
  struct flow_id flow_in = {
      .src_ip4 = 0x200000a,
      .src_port = htons(1234),
      .dst_ip4 = 0x100000a,
      .dst_port = htons(1234),
      .proto = IPPROTO_UDP,
  };

  struct flow_id flow_redir = {
      .src_ip4 = 0x100000a,
      .src_port = htons(1235),
      .dst_ip4 = 0x100007f,
      .dst_port = htons(1235),
      .proto = IPPROTO_UDP,
  };

  ret = bpf_map_update_elem(redirects_map_fd, &flow_in, &flow_redir, BPF_ANY);
  if (ret != 0) {
    fprintf(stderr, "bpf_map_update_elem error: %d", ret);
    goto out;
  }

  flow_in.src_ip4 = 0x100007f;  // src
  flow_in.src_port = htons(1237);
  flow_in.dst_ip4 = 0x100007f;
  flow_in.dst_port = htons(1237);
  flow_in.proto = IPPROTO_UDP;

  flow_redir.src_ip4 = 0x100000a;
  flow_redir.src_port = htons(1236);
  flow_redir.dst_ip4 = 0x200000a;
  flow_redir.dst_port = htons(1236);
  flow_redir.proto = IPPROTO_UDP;

  ret = bpf_map_update_elem(redirects_map_fd, &flow_in, &flow_redir, BPF_ANY);
  if (ret != 0) {
    fprintf(stderr, "bpf_map_update_elem error: %d", ret);
    goto out;
  }

  if (verbose) {
    printf("waiting for %d sec..\n", sleep_time);
  }
  sleep(sleep_time);

  // read from maps
  flow_in.src_ip4 = 0x200000a;
  flow_in.src_port = htons(1234);
  flow_in.dst_ip4 = 0x100000a;
  flow_in.dst_port = htons(1234);
  flow_in.proto = IPPROTO_UDP;

  ret = bpf_map_lookup_elem(statistics_map_fd, &flow_in, flow_in_stats);
  if (ret != 0) {
    fprintf(stderr, "bpf_lookup_elem error: %d", ret);
    goto out;
  }

  struct flow_stat flow_in_stats_agg = {0, 0, 0};
  for(int i=0; i < nr_cpus; i++) {
    flow_in_stats_agg.pkts += flow_in_stats[i].pkts;
    flow_in_stats_agg.bytes += flow_in_stats[i].bytes;
    flow_in_stats_agg.timestamp_last = MAX(flow_in_stats[i].timestamp_last,
					   flow_in_stats_agg.timestamp_last);
  }

  printf("%x:%d -> %x:%d stats: \n", flow_in.src_ip4,
	 ntohs(flow_in.src_port), flow_in.dst_ip4,
	 ntohs(flow_in.dst_port));

  printf(" pkts: %lu\n bytes: %lu\n last ts: %lu\n",
	 flow_in_stats_agg.bytes,
	 flow_in_stats_agg.pkts,
	 flow_in_stats_agg.timestamp_last);

out:
  // close open maps
  if (statistics_map_fd != -1) {
    close(statistics_map_fd);
  }

  if (redirects_map_fd != -1) {
    close(redirects_map_fd);
  }

  return ret;
}
