# l7mp kernel offload

l7mp provides an experimental kernel offload feature to enhance performance. The offload builds upon the [tc-bpf](https://man7.org/linux/man-pages/man8/tc-bpf.8.html) Linux kernel mechanism. Below we show how to enable and use the kernel offload.

## Requirements

### Linux kernel

The offload requires a quite modern Linux kernel compiled with eBPF support. Current distros use new kernels and are built with eBPF support.

We tested the kernel offload on the following systems:

| Distribution | Kernel version |
| :---:        | :---:          |
| Ubuntu 20.04 | 5.4            |
| Debian 11    | 5.10           |
| Debian 10    | 4.19           |
| minikube     | 4.19           |

### Dependencies

**Build dependencies:**
- make
- clang and llvm
- kernel headers
- git
- [libbpf](https://github.com/libbpf/libbpf) (build script clones the upstream git repo)

**Runtime dependencies:**
- tc (part of iproute2 package)
- [node-bpf (>=1.3.0)](https://www.npmjs.com/package/bpf)


## Building

### Bare-metal l7mp

To kernel offload code needs to be compiled manually:

``` sh
make -C kernel-offload
```

The make process clones the libbpf library from the [upstream repo](https://github.com/libbpf/libbpf) and compiles the kernel offload to a bpf object.

### l7mp container

The l7mp [Dockerfile](/Dockerfile) can build l7mp container with kernel offload. Under the hood, a builder container build l7mp, compiles the node-bpf package from [sources](https://github.com/levaitamas/node_bpf/tree/musl) and the kernel offload object. Then, the compiled offload code and the l7mp installation with the node-bpf package is copied to the final l7mp image.

The command to build an l7mp container with kernel offload support:
```sh
sudo docker build -t l7mp .
```

## Usage

The kernel offload usage has two main stages: preparation and configuration. First, we show the preparations required for the kernel offload in various environments. Then, we show how to configure l7mp to use kernel offloading.

### Set capabilities

Deployments require `CAP_NET_ADMIN` and `CAP_SYS_ADMIN` capabilites to load the kernel offload object. Setting these capabilities differ by deployment types. Below we show the process for bare-metal, Docker, and Kubernetes deployments.

#### Bare-metal
[Setup capabilities](https://wiki.archlinux.org/title/capabilities) or use `sudo`.

#### Docker
Docker provides `--cap-add` arguments. To start an l7mp container, use a similar command:
```sh
sudo docker run --cap-add=NET_ADMIN --cap-add=SYS_ADMIN --privileged -i -t l7mp node l7mp-proxy.js -c <config_file> -l warn -s
```

#### Kubernetes
To enforce capabilities required for l7mp containers, set l7mp containers' `securityContext`:
```yaml
      containers:
      - name: l7mp
        securityContext:
          capabilities:
            add: ["NET_ADMIN", "SYS_ADMIN"]
          privileged: true
```

### Host configuration

#### Fix checksum calculation issues
We experience UDP checksum errors on traffic originating from localhost. This results packet drops causing service outage.

Fortunately, the bad checksum can be detected easily. For example, `tcpdump` shows bad UDP checksum on its output (e.g., `[bad udp cksum 0x1823 -> 0xe24a!]`):

```
$ sudo tcpdump -i any -neevvxX udp
tcpdump: data link type LINUX_SLL2
tcpdump: listening on any, link-type LINUX_SLL2 (Linux cooked v2), snapshot length 262144 bytes
11:04:44.239698 lo    In  ifindex 1 00:00:00:00:00:00 ethertype IPv4 (0x0800), length 51: (tos 0x0, ttl 64, id 61815, offset 0, flags [DF], proto UDP (17), length 31)
    127.0.0.1.1236 > 127.0.0.1.1235: [bad udp cksum 0xfe1e -> 0x8acb!] UDP, length 3
        0x0000:  4500 001f f177 4000 4011 4b54 7f00 0001  E....w@.@.KT....
        0x0010:  7f00 0001 04d4 04d3 000b fe1e 6363 0a    ............cc.
11:04:44.239904 ens3f0 Out ifindex 2 3c:fd:fe:ba:19:98 ethertype IPv4 (0x0800), length 51: (tos 0x0, ttl 64, id 61815, offset 0, flags [DF], proto UDP (17), length 31)
    10.0.2.3.37713 > 10.0.2.4.1234: [bad udp cksum 0x1823 -> 0xe24a!] UDP, length 3
        0x0000:  4500 001f f177 4000 4011 3150 0a00 0203  E....w@.@.1P....
        0x0010:  0a00 0204 9351 04d2 000b 1823 6363 0a    .....Q.....#cc.
^C
2 packets captured
4 packets received by filter
0 packets dropped by kernel
```

We tackle the bad UDP checksum issue by combining the following techniques.

**Disable checksum calculation in the application:** Socket option `SO_NO_CHECK` disables the checksum calculation for IPv4/UDP packets.

**Disable hardware checksum offloading:** The kernel offload might transmit packets from localhost to a network interface. During this transmit, the UDP checksum gets incrementally updated. Since the original checksum is bad, the incrementally-updated checksum is bad too. By disabling the hardware offload, we can force a full checksum recalculation.

To disable network interface hardware offloading, we use `ethtool`. This tool enables configuring parameters of network interfaces.

To disable checksum offloading on an interface, use the command:
```
sudo ethtool -K <interface_name> rx off tx off gso off
```

To check the current state of a network interface, use:
```
sudo ethtool --show-offload <interface_name>
```

### l7mp configuration

#### Enable kernel offload in l7mp configurations

To enable kernel offload,  l7mp configurations require the following offload specific lines:
```yaml
admin:
  offload: init
  offload_ifs: lo,eth0
```
The line `offload: init` tells l7mp to enable kernel offloading; `offload_ifs: lo,eth0` specifies the network interfaces on which the kernel offload is enabled (in this example,  `lo` and `eth0`). The interfaces can be specified via the CLI arg `-i`. To enable kernel offload on all interfaces, use `all`.

#### Example configuration

An example l7mp config:

```yaml
admin:
  log_level: warn
  log_file: stdout
  access_log_path: /tmp/admin_access.log
  offload: init
  offload_ifs: lo,ens3f0
listeners:
  - name: udp-listener
    spec: { protocol: UDP, port: 1235, connect: {address: "127.0.0.1", port: 1236} }
    rules:
      - action:
          route:
            destination:
              name: udp-sender
              spec: { protocol: "UDP", port: 1234 }
              endpoints:
                - spec: {address: "10.0.2.4"}
```

#### Expected l7mp output

If the kernel offload is successfully initiated, expect to see a similar output:
```
[...]
2021-10-25T08:56:15.464Z sill Session.pipe: Offloading 10.0.2.4:1234->10.0.2.3:37713[17] => 127.0.0.1:1235->127.0.0.1:1236[17]
2021-10-25T08:56:15.464Z info UDPOffload.setOffload: 10.0.2.4:1234->10.0.2.3:37713[17] => 127.0.0.1:1235->127.0.0.1:1236[17], action: create
2021-10-25T08:56:15.465Z sill Stage.set_event_handlers: Setting up event handlers for stage "udp-listener"/READY
2021-10-25T08:56:15.465Z sill Stage.set_event_handlers: Setting up event handlers for stage "udp-sender"/READY
2021-10-25T08:56:15.465Z sill Session.connected Session UDP:127.0.0.1:1236-0.0.0.0:1235-0:
2021-10-25T08:56:15.466Z info Session "UDP:127.0.0.1:1236-0.0.0.0:1235-0": successfully (re)connected, offloaded 2/2 pipes: { name: 'UDP:127.0.0.1:1236-0.0.0.0:1235-0', IP: { src_addr: '127.0.0.1', dst_addr: '0.0.0.0' }, UDP: { src_port: 1236, dst_port: 1235 } }
```
Last line shows all pipes are offloaded. Note, that this message requires loglevel `info`.

## Caveats
The l7mp kernel offload is still experimental with limitations. Some of these are:

* handles UDP traffic only
* requires workarounds for checksum on loopback
