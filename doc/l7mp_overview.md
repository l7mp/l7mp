---
title: Overview
tags: 
 - jekyll
 - github
order: 1
description: Overview of the basic concepts in l7mp
---

<img src="../assets/brand/logo.svg" alt="L7mp logo" width="150"/>

## What is l7mp?

*[L7mp is currently under construction, with many advertised features untested, not working as promised, or completely missing.]*

L7mp is an experimental Layer-7, multiprotocol service proxy and a service mesh framework. The emphasis is on multiprotocol support, which lets l7mp to handle lots of transport- and application-layer network protocols natively, not just the usual TCP/HTTP, and transparently convert between different protocol encapsulations. The intention for l7mp is to serve as an incubator project to prototype the main service mesh features that are indispensable to support network-intensive legacy/non-HTTP applications seamlessly in Kubernetes.

The distribution contains an l7mp proxy component and a service mesh operator for Kubernetes. 

The *l7mp proxy* is a programmable proxy very similar in nature to Envoy. The difference is that the l7mp proxy is purposely built from the bottom-up to support multiprotocol operations, in that it can stitch an arbitrary number of application-level traffic streams together into an end-to-end stream in a protocol-agnostic manner; e.g., you can pipe a UNIX domain socket to a WebSocket stream and vice versa and it should just work as expected. The proxy is written in a high-level language framework, node.js, which makes it particularly easy to extend: adding a new protocol to l7mp is a matter of implementing a custom listener and a cluster, usually about a hundred lines of Javascript code. Meanwhile, a tc/ebpf-based kernel acceleration service is in development to mitigate the Javascript performance tax.

The *l7mp service mesh* operator can be used to manage a legion of l7mp gateway and sidecar proxy instances seamlessly. It allows to enforce a rich set of high-level traffic management and observability policies throughout an entire cluster, enjoying the convenience of a high-level Kubernetes API, much akin to the Istio or the Service Mesh Interface API.

The l7mp framework is work-in-progress. This means that at any instance of time some features may not work as advertised or may not work at all, and some critical features, including the security API, are left for further development. Yet, l7mp is already capable enough to serve as a demonstrator to get a glimpse into the multiprotocol future of the service mesh concept.


### The l7mp data plane

The data plane of the l7mp framework is comprised by a set of l7mp proxy instances. The l7mp proxy supports multiple deployment models; e.g., it can be deployed as an ingress gateway to feed traffic with exotic protocol encapsulations into a Kuberntes cluster, or as a sidecar proxy to expose a legacy UDP/SCTP application to a Kuberntes cluster using a cloud-native protocol.

The l7mp proxy is modeled after [Envoy](https://github.com/envoyproxy/envoy), in that it uses similar abstractions (Listeners, Clusters, etc.), but in contrast to Envoy that is mostly HTTP/TCP-centric, l7mp is optimized for persistent, long-lived UDP-based media and tunneling protocol streams. The l7mp proxy features an extended routing API, which allows to transparently pipe application streams across diverse protocol encapsulations, with automatic and transparent protocol transformation, native support for datagram- and byte-streams, stream multiplexing and demultiplexing, encapsulation/decapsulation, etc.

Considering the strong emphasis on multiprotocol support, the l7mp proxy may actually be closer in nature to `socat(1)` than to Envoy, but it is dynamically configurable via a REST API in contrast to `socat(1)` which is a static CLI tool (in turn `socat` it is much more feature-complete).

The l7mp proxy is written in Javascript/Node.js. This way, it is much simpler and easier to extend than Envoy or `socat`, but at the same time it is also much slower. It does not have to be that way though; a tc/ebpf-based proxy-acceleration framework is under construction that would enable l7mp to run at hundreds of thousands of packets per second speed.


### The l7mp control plane

The l7mp distribution contains a Kubernetes operator that makes it possible to deploy and configure multiple instances of l7mp as sidecar proxies and service/API gateways, in a framework that can be best described as a multiprotocol service mesh. The operator uses the same high-level concepts as most service mesh frameworks (i.e., VirtualServices), but it contains a number of extensions (the Route and the Target custom resources) that allow the user to precisely control the way traffic is routed across the cluster.


## Deployment models

Currently there are two ways to deploy l7mp: either the l7mp proxy is deployed in a standalone mode (e.g., as a gateway or a sidecar proxy) in which case each distinct l7mp proxy instance needs to be configured (using a static config file of via the l7mp proxy REST API), or it is used in conjunction with the l7mp service mesh operator for Kubernetes, which makes it possible to manage possibly large numbers of l7mp proxy instances enjoying the convenience of a high-level Kubernetes API.


## Multiprotocol Support

The main feature l7mp intends to get right is multiprotocol support. While l7mp is optimized for persistent, long-lived UDP-based media and tunneling protocol streams, and hence the support for the usual HTTP protocol suite is incomplete as of now, it should already be pretty capable as a general purpose multiprotocol proxy and service mesh, supporting lots of built-in transport and application-layer protocols. Below is a summary of the protocols supported by l7mp and the current status of the implementations.

| Type      | Protocol         | Session ID               | Type            | Role  | Mode             | Re/Lb   | Status  |
| :-------: | :--------------: | :----------------------: | :-------------: | :---: | :--------------: | :-----: | :-----: |
| Remote    | UDP              | IP 5-tuple               | datagram-stream | l/c   | singleton/server | yes/yes | Stable  |
|           | TCP              | IP 5-tuple               | byte-stream     | l/c   | server           | yes/yes | Stable  |
|           | HTTP             | IP 5-tuple               | byte-stream     | l     | server           | yes/yes | Partial |
|           | WebSocket        | IP 5-tuple + HTTP        | datagram-stream | l/c   | server           | yes/yes | Stable  |
|           | JSONSocket       | IP 5-tuple + JSON header | datagram-stream | l/c   | server           | yes/yes | Stable  |
|           | SCTP             | IP 5-tuple               | datagram-stream | l/c   | server           | yes/yes | TODO    |
|           | AF\_PACKET       | file desc                | datagram-stream | l/c   | singleton        | no/no   | TODO    |
| Local     | STDIO-fork       | N/A                      | byte-stream     | c     | singleton        | no/no   | Stable  |
|           | UNIX/stream      | file desc/path           | byte-stream     | l/c   | server           | yes/yes | Stable  |
|           | UNIX/dgram       | file desc/path           | datagram-stream | l/c   | singleton        | no/no   | TODO    |
|           | PIPE             | file desc/path           | byte-stream     | l/c   | singleton        | no/no   | TODO    |
| Transform | Stdio            | N/A                      | byte-stream     | c     | singleton        | yes/no  | Stable  |
|           | Echo             | N/A                      | datagram-stream | c     | singleton        | yes/no  | Stable  |
|           | Discard          | N/A                      | datagram-stream | c     | singleton        | yes/no  | Stable  |
|           | Logger           | N/A                      | datagram-stream | c     | singleton        | yes/no  | Stable  |
|           | JSONENcap        | N/A                      | datagram-stream | c     | singleton        | yes/no  | Stable  |
|           | JSONDecap        | N/A                      | datagram-stream | c     | singleton        | yes/no  | Stable  |

The standard protocols, like TCP, HTTP/1.1 and HTTP/2 (although only listener/server side at the moment), WebSocket, and Unix Domain Socket (of the byte-stream type, see below) are fully supported, and for plain UDP there are two modes available: in the "UDP singleton mode" l7mp acts as a "connected" UDP server that is statically tied/connected to a downstream remote IP/port pair, while in "UDP server mode" l7mp emits a new "connected" UDP session for each packet received with a new IP 5-tuple. In addition, JSONSocket is a very simple "UDP equivalent of WebSocket" that allows to enrich a plain UDP stream with arbitrary JSON encoded metadata; see the spec [here](doc/jsonsocket-spec.org). Finally, SCTP is a reliable message transport protocol widely used in telco applications and AF\_PACKET would allow to send and receive raw L2/Ethernet or L3/IP packets on a stream; currently adding proper support for these protocols is a TODO.

Furthermore, there is a set of custom pseudo-protocols included in the l7mp proxy to simplify debugging and troubleshooting: the "Stdio" protocol makes it possible to pipe a stream to the l7mp proxy's stdin/stdout, the "Echo" protocol implements a simple Echo server behavior which writes back everything it reads to the input stream, "Discard" simply blackholes everyting it receives, and finally "Logger" is like the Echo protocol but it also writes everything that goes through it to a file or to the standard output.  Finally, there are a couple of additional protocols (currently unimplemented) to further improve the usability of l7mp (see the equivalents in `socat(1)`): "STDIO-fork" is a protocol for communicating with a forked process through STDIO/STDOUT and PIPE uses standard UNIX pipes to do the same.

There are two *types* of streams supported by L7mp: a "byte-stream" (like TCP or Unix Domain Sockets in SOCK_STREAM mode) is a bidirectional stream that ignores segmentation/message boundaries, while "datagram-stream" is the same but it prefers segmentation/message boundaries whenever possible (e.g., UDP or WebSocket). The l7mp proxy warns if a datagram-stream type stream is routed to a byte-stream protocol, because this would lead to a loss of message segmentation. In addition, protocols may support any or both of the following two modes: a "singleton" mode protocol accepts only a single connection (e.g., a fully connected UDP listener will emit only a single session) while a "server" mode listener may accept multiple client connections, emitting a separate session for each connection received  (e.g., a TCP or a HTTP listener).

A protocol is marked with a flag `l` if it has a listener implementation in l7mp, acting as a server-side protocol "plug" that listens to incoming connections from downstream peers and emits new sessions, and with flag `c` if it implements the cluster side, i.e., the client-side of the protocol that can route a connection to an upstream service and load-balance across a set of remote endpoints, `Re` means that the protocol supports *retries* and `Lb` indicates that *load-balancing* support is also available for the protocol.


## Features

### Traffic Management 

The traffic management features of l7mp allow fine-grained control over the way traffic flows through the cluster and chained through multiple microservices, load-balancing and session stickiness, ACLs, and resilience features like timeouts and retries. All this in a protocol-agnostic manner: you can route, say, a UDP stream through a series of upstream services exposed on, say, TCP, through UDP or Unix Domain Sockets or WebSocket, and things should just work out fine. 

| Feature                                         | Status       |
| :---------------------------------------------- | :-----:      |
| Rule-matching: JSONPredicate/JSONPointer        | Stable       |
| Traffic Control: label/content based routing    | Stable       |
| Multiple match-action tables (RuleLists)        | Stable       |
| Resilience features: timeouts, retries          | Stable       |
| Load-balancing: consistent hash or trivial      | Stable       |
| Canary deployments: through routing             | Stable       |
| Demultiplexing: separate ingress/egress streams | Stable       |
| Service chaining: ingress/egress routing        | Stable       |
| Traffic capture in sidecar                      | NONE/WONTFIX |

### Observability

L7mp comes with experimental Prometheus integration, which allows Prometheus to scrape the l7mp sidecar proxies and the gateways and surface useful counters and metrics. Note that Prometheus support is experimental for now, and it supports only a minimal set of metrics (basic ingress/egress counters and session traffic/byte-rate metrics). However, the toolchain is there and it should be easy to add additional metrics from here.

| Feature                                      | Status       |
| :---------------------                       | :----:       |
| Prometheus Integration                       | Experimental |
| Configurable logging                         | Experimental |
| Grafana Service Dashboard                    | TODO         |
| Distributed tracing: through session metrics | Experimental |

### Security and policy enforcement

Currently only ACLs are supported through the request routing API, in that match-action rules can be added to the l7mp VirtualService router in order to filter requests based on metadata. Encryption/decryption, authorization and authentication, and TLS/DTLS is to be added soon.

| Feature                      | Status |
| :---------------------       | :----: |
| TLS/DTLS support             | TODO   |
| Control plane authentication | TODO   |
| Authorization                | TODO   |
| Encryption/decryption        | TODO   |


## Contributing

Join the [l7mp slack](https://l7mp.slack.com) or send pull requests to the [l7mp github repo](https://github.com/l7mp/l7mp).
