# l7mp kernel offload

To enhanche performance, l7mp provides an experimental kernel offload feature. The offload builds upon the [tc-bpf](https://man7.org/linux/man-pages/man8/tc-bpf.8.html) Linux kernel mechanism.

## Requirements

### Linux kernel

The offload requires a fairly modern Linux kernel with eBPF support. Current distros use new kernels and are configured with eBPF support.

We tested the offload on the following systems:

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
- [libbpf](https://github.com/libbpf/libbpf) (build scripts clones the upstream git repo)

**Runtime dependencies:**
- tc (part of iproute2 package)
- [node-bpf (>=1.3.0)](https://www.npmjs.com/package/bpf)


## Building

We detail the build process for bare-metal deployments and for container deployments.

### Bare-metal l7mp

To kernel offload code needs to be compiled manually:

``` sh
make -C kernel-offload
```

The make process clones the libbpf library from the [upstream repo](https://github.com/libbpf/libbpf) and compiles the kernel offload to a bpf object.

### l7mp container

The l7mp [Dockerfile](/Dockerfile) handles the creation of l7mp container w/ kernel offload. It uses a builder container to compile the node-bpf package from [sources](https://github.com/levaitamas/node_bpf/tree/musl). The compiled offload code and the node-bpf package is then copied to the final l7mp image.

```sh
sudo docker build -t l7mp .
```

## Usage

The kernel offload usage has two main stages: preparation and offload configuration. First, we show the preparation steps required for using the kernel offload. After that, we configure l7mp with kernel offloading.

### Set capabilities

Deployments require `CAP_NET_ADMIN` and `CAP_SYS_ADMIN` capabilites to load the kernel offload object.

#### Bare-metal
Set up [capabilities](https://wiki.archlinux.org/title/capabilities) or use `sudo`.

#### Docker
You canstart an l7mp container with the following command:
```sh
sudo docker run --cap-add=NET_ADMIN --cap-add=SYS_ADMIN --privileged -i -t l7mp node l7mp-proxy.js -c <config_file> -l warn -s
```

#### Kubernetes
To enforce these capabilities for l7mp containers, set `securityContext` of l7mp containers as the follows:
```yaml
      containers:
      - name: l7mp
        securityContext:
          capabilities:
            add: ["NET_ADMIN", "SYS_ADMIN"]
          privileged: true
		...
```

### Host configuration

#### Fixing checksum calculation issues
We experience UDP checksum errors on traffic originating from localhost. We tackle this problem by combining the following mitigations.

**Disable checksum calculation in the application:** The socket option `SO_NO_CHECK` disables the checksum calculation for IPv4/UDP packets.

**Disable hardware checksum offloading:** The kernel offload moves packets originating from localhost to a network interface. During this transmit, the UDP checksum gets incrementally updated. Since the original checksum is wrong, the updated checksum will be wrong too. By disabling the hardware offload, we can force full checksum recalculation.

To disable network interface hardware offloading, we use `ethtool`. This tool enables configuring parameters of network interfaces. To disable checksum offloading on an interface we use the command `sudo ethtool -K <interface_name> rx off tx off gso off`. To check the current state, we use `sudo ethtool --show-offload <interface_name>`.

### l7mp configuration

#### Enabling kernel offload

The l7mp with kernel offload configurations containes offload specific lines, otherwise they are identical to your existing configuration:
```yaml
admin:
  offload: init
  offload_ifs: lo,eth0
```
The line `offload: init` tells l7mp to enable offloading; `offload_ifs: lo,eth0` specifies the network interfaces on which the kernel offload is enabled (in this case these are `lo` and `eth0`). The interfaces can be specified with the CLI arg `-i`. To enable kernel offload on all interfaces, use `all`.

#### Example kernel offload config

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

If the kernel offload is initiated successfully, expect to see a similar output:
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
The offload is still experimental with limitations. Some of these are:

* handles UDP traffic only
* workarounds for checksum handling on loopback devices are required
