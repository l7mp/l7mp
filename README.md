[![Build Status](https://travis-ci.org/l7mp/l7mp.svg?branch=master)](https://travis-ci.org/l7mp/l7mp)
[![Coverage Status](https://coveralls.io/repos/github/l7mp/l7mp/badge.svg?branch=master)](https://coveralls.io/github/l7mp/l7mp?branch=master)

<img src="./logo.svg" width="20%"></img>

# l7mp: A L7 Multiprotocol Proxy and Service Mesh

*[L7mp is currently under construction, with many advertised features untested, not working as promised, or completely missing.]*

L7mp is a Layer-7, multiprotocol service proxy and a service mesh framework. The emphasis is on *multiprotocol* support, which lets l7mp to handle lots of transport- and application-layer network protocols natively not just the usual TCP/HTTP, and transparently convert between different protocol encapsulations. The intention is for l7mp to serve as an incubator project to prototype the main service mesh features that are indispensable to support network-intensive legacy/non-HTTP applications seamlessly in Kubernetes.

The distribution contains an *l7mp proxy* component, a programmable proxy that can stitch an arbitrary number of application-level traffic streams together into an end-to-end stream in a protocol-agnostic manner (e.g., you can pipe a UNIX domain socket to a WebSocket stream and vice versa), and a *service mesh* component, in the form of a Kubernetes operator, which can manage a legion of l7mp gateway and sidecar proxy instances seamlessly to enforce a rich set of high-level traffic management and observability policies throughout an entire cluster.


## The l7mp data plane

The data plane of the l7mp framework is comprised by a set of l7mp proxy instances. The l7mp proxy supports multiple deployment models; e.g., it can be deployed as an ingress gateway to feed traffic with exotic protocol encapsulations into a Kuberntes cluster, or as a sidecar proxy to expose a legacy UDP/SCTP application to a Kuberntes cluster using a cloud-native protocol.

The l7mp proxy is modeled after [Envoy](https://github.com/envoyproxy/envoy), in that it uses similar abstractions (Listeners, Clusters, etc.), but in contrast to Envoy that is mostly HTTP/TCP-centric, l7mp is optimized for persistent, long-lived UDP-based media and tunneling protocol streams. The l7mp proxy features an extended routing API, which allows to transparently pipe application streams across diverse protocol encapsulations, with automatic and transparent protocol transformation, native support for datagram- and byte-streams, stream multiplexing and demultiplexing, encapsulation/decapsulation, etc.

Considering the strong emphasis on multiprotocol support, the l7mp proxy may actually be closer in nature to `socat(1)` than to Envoy, but it is dynamically configurable via a REST API in contrast to `socat(1)` which is a static CLI tool (in turn `socat` it is much more feature-complete).

The l7mp proxy is written in Javascript/Node.js. This way, it is much simpler and easier to extend than Envoy or `socat`, but at the same time it is also much slower. It does not have to be that way though; an XDP/ebpf-based proxy-acceleration framework is under construction that would enable l7mp to run at hundreds of thousands of packets per second speed.


## The l7mp control plane

The l7mp distribution contains a Kubernetes operator that makes it possible to deploy and configure multiple instances of l7mp as sidecar proxies and service/API gateways, in a framework that can be best described as a multiprotocol service mesh. The operator is currently under construction, more details to follow soon.

# The l7mp proxy

## Installation

### Standalone installation

Use the below to install the l7mp proxy from the [official l7mp distribution at npm.js](https://npmjs.org).

```sh
npm install l7mp --save
npm test
```

At least Node.js v14 is required.


### Docker installation

Pull the official image by `docker pull l7mp/l7mp:latest` or use the enclosed Dockerfile to deploy the l7mp proxy. 


### Deploy into Kubernetes

Use the below configuration to deploy l7mp as an ingress gateway in your Kubernetes cluster.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: l7mp-ingress-gw
  labels:
    app: l7mp-ingress-gw
spec:
  selector:
    matchLabels:
      app: l7mp-ingress-gw
  template:
    metadata:
      labels:
        app: l7mp-ingress-gw
    spec:
      volumes:
        - name: l7mp-ingress-gw-config
          configMap:
            name: l7mp-ingress-gw
      containers:
      - name: l7mp
        image: l7mp/l7mp:latest
        imagePullPolicy: IfNotPresent
        command: [ "node" ]
        args: [ "l7mp-proxy.js", "-c", "config/l7mp-ingress-gw.yaml", "-s", "-l", "info" ]
        ports:
        - containerPort: 1234
        volumeMounts:
          - name: l7mp-ingress-gw-config
            mountPath: /app/config
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet

---

# Controller listening on 1234
apiVersion: v1
kind: ConfigMap
metadata:
  name: l7mp-ingress-gw
data:
  l7mp-ingress-gw.yaml: |
    admin:
      log_level: info
      log_file: stdout
      access_log_path: /tmp/admin_access.log
    listeners:
      - name: controller-listener
        spec: { protocol: HTTP, port: 1234 }
        rules:
          - action:
              route:
                cluster:
                  spec: { protocol: L7mpController }
```

## Usage example


### Run

The below usage examples assume that the l7mp proxy is deployed in standalone mode and it is available on the `localhost`.

Run l7mp locally with a [sample](config/l7mp-minimal.yaml) static configuration.

```sh
node l7mp-proxy.js -c config/l7mp-minimal.yaml -l warn -s
```

Configuration is accepted either in YAML format (if the extension is `.yaml`) or JSON (otherwise). Command line arguments override static configuration parameters.


### Query configuration

The sample configuration will fire up a HTTP listener on port 1234 and route it to the l7mp controller that serves the l7mp REST API. This API can be used to query or configure the proxy on the fly; e.g., the below will dump the full configuration in JSON format:

```sh
curl http://localhost:1234/api/v1/config
```

For a list of all REST API endpoints, see the [l7mp OpenAPI specs](https://l7mp.io/openapi).


### Manage sessions

On top of the static configuration, the response contains a list of `sessions`, enumerating the set of active (connected) streams inside l7mp. You can list the live sessions explicitly as follows:

```sh
curl http://localhost:1234/api/v1/sessions
```

You should see only a single HTTP session: this session was created by the l7mp proxy to route the REST API query from the HTTP listener to the controller endpoint and this session happens to be active when the session list request is issued.

You can also delete any session (suppose its name is `session-name`) via the below REST API call.

```sh
curl -iX DELETE http://localhost:1234/api/v1/sessions/<session-name>
```


### Add a new cluster

Add a new WebSocket *cluster* named `ws-cluster` that will connect to an upstream WebSocket service with a single *endpoint* at `localhost:16000`.

```sh
curl -iX POST --header 'Content-Type:text/x-yaml' --data-binary @- <<EOF  http://localhost:1234/api/v1/clusters
cluster:
  name: ws-cluster
  spec: { protocol: "WebSocket", port: 16000 }
  endpoints:
    - spec: { address:  "127.0.0.1" }
EOF
```

Note that the REST API accepts both JSON and YAML configs (YAML will be converted to JSON internally). If multiple endpoints are added, l7mp will load-balance among these; e.g., the below will distribute connections across 3 upstream endpoints in proportion 3:1:1 and also implement sticky sessions, by applying consistent hashing on the source IP address of each connection.

```sh
curl -iX POST --header 'Content-Type:text/x-yaml' --data-binary @- <<EOF  http://localhost:1234/api/v1/clusters
cluster:
  name: ws-cluster-with-sticky-sessions
  spec: { protocol: "WebSocket", port: 16000 }
  endpoints:
    - spec: { address:  "127.0.0.1" }
      weight: 3
    - spec: { address:  "127.0.0.2" }
    - spec: { address:  "127.0.0.3" }
  loadbalancer:
    policy: "ConsistentHash"
    key: "IP/src_addr"
EOF
```


### Add a new listener and a route

Now add a new UDP *listener* called `udp-listener` at port 15000 that will accept connections from an IP address but only with source port 15001, and *route* the received connections to the above cluster (which, recall, we named as `ws-cluster`).

```sh
curl -iX POST --header 'Content-Type:text/x-yaml' --data-binary @- <<EOF  http://localhost:1234/api/v1/listeners
listener:
  name: udp-listener
  spec: { protocol: UDP, port: 15000, connect: {port: 15001} }
  rules:
    - action:
        route:
          destination: ws-cluster
          ingress:
            - spec: { protocol: Logger }
          retry: {retry_on: always, num_retries: 3, timeout: 2000}
EOF
```

There is an important quirk here. The `route` spec in the above REST API call specifies a new cluster (the one with the protocol `Logger`), but this specification is embedded into the route definition. Here, `Logger` is a special *transform* cluster that will instruct l7mp to log all traffic arriving from the stream's source (the UDP listener) to the destination (the WebSocket cluster) to the standard output. Of course, we could have added this cluster in a separate REST API call as well:

```sh
curl -iX POST --header 'Content-Type:text/x-yaml' --data-binary @- <<EOF  http://localhost:1234/api/v1/clusters
cluster:
  name: logger-cluster
  spec: { protocol: "Logger" }
EOF
```

And then we could let the route to simply refer to this cluster by name:

```sh
curl -iX POST --header 'Content-Type:text/x-yaml' --data-binary @- <<EOF  http://localhost:1234/api/v1/listeners
listener:
  name: udp-listener-with-no-embedded-cluster-def
  spec: { protocol: UDP, port: 15000, connect: {port: 15001} }
  rules:
    - action:
        route:
          destination: ws-cluster
          ingress:
            - logger-cluster
          retry: {retry_on: always, num_retries: 3, timeout: 2000}
EOF
```

This flexibility of l7mp to accept explicit and implicit (embedded) configurations is available in essentially all REST API calls, and it greatly simplifies the use of the API.


### Routing

On session creation, l7mp will demultiplex the bidirectional stream received at the listener into two uni-directional streams: the *ingress stream* (in the direction from the source/listener to the destination/cluster) will be routed through the `Logger` transform cluster. Theoretically, a transform cluster is free to apply any modification it wants to the traffic passing through it, it can be local (built into the l7mp datapath, like `Logger`) or remote (e.g., another WebSocket cluster), the only requirement is that the cluster endpoint listen at the specified address on the specified port and send the modified traffic back to l7mp. For now, the `Logger` cluster just dumps the content of the stream without transforming it in any ways, but you get the point. The returned stream is then piped to the cluster `ws-cluster`. In the *egress direction* (from the destination/cluster back to the source/listener), no transformation occurs as the egress chain spec is missing.

The ingress and the egress routes are specified and handled separately. Both routes can contain a list of any number of transform clusters that will be chained sequentially, automatically performing transparent protocol and payload conversion along the way. Note that datagram boundaries are preserved during transformation whenever possible, and when not (i.e., piping a UDP stream to a TCP cluster will lose segmentation), l7mp issues a warning.

The above should yield the routes:

    ingress: udp-listener -> logger-cluster -> ws-cluster
    egress:  ws-cluster -> udp-listener


### Retries and timeouts

Route specifications may contain a `retry` spec, in order to describe what to do when one of the connected endpoints fail. By the above spec, l7mp will automatically retry the connection at most 3 times both on connection setup errors and disconnect events on already established connections, waiting each time 2000 ms for the stream to be successfully re-established.


### Test the connection

To complete the connection, fire up a `socat(1)` sender (don't forget to bind the sender to 15001, otherwise l7mp, which connects back to this port, will not accept the connection):

```sh
socat - udp:localhost:15000,sourceport=15001
```

Then [start](https://github.com/vi/websocat) a `websocat` receiver:

```sh
websocat -Eb ws-l:127.0.0.1:16000 -
```

What you type in the sender should now appear at the receiver verbatim, and the l7mp proxy should report everything that passes from the sender to the receiver on the standard output. Note that in the reverse direction, i.e., from the receiver to the sender, nothing will be logged, since the `Logger` was added to the *ingress route* only but not to the *egress route*.


### Clean up

Provided that the new session is named `session-name` (l7mp automatically assigns a unique name to each session, you can check this by issuing a GET request to the API endpoint `/api/v1/sessions`), you can delete this session as follows:

```sh
curl -iX DELETE http://localhost:1234/api/v1/sessions/<session-name>
```

In addition, use the below to remove the `udp-listener` and `ws-cluster`:

```sh
curl -iX DELETE http://localhost:1234/api/v1/listeners/udp-listener
curl -iX DELETE http://localhost:1234/api/v1/clusters/ws-cluster
```

Note however that this will delete *only* the named listener and the cluster even though, as mentioned above, these objects may contain several *embedded* objects; e.g., `udp-listener` contains and implicit *rulelist* (a match-action table) with a single match-all *rule*, plus a *route* and an embedded *cluster* spec ("Logger"), and these will not be removed by the above call. 

You can use the below `recursive` version of the delete operations to delete all the embedded sub-objects of an object, but bear in mind that this will remove *everything* that was implciitly defined by `udp-listener` and `ws-cluster` and this includes *all* the sessions emitted by the listener and *all* the sessions routed via the cluster. 

```sh
curl -iX DELETE http://localhost:1234/api/v1/listeners/udp-listener?recursive=true
curl -iX DELETE http://localhost:1234/api/v1/clusters/ws-cluster?recursive=true
```

You can avoid this by not using embedded defs or, if this is too inconvenient, explicitly naming all embedded objects and then using the specific APIs (the RuleList API, Rule API, etc.) to clean up each object selectively.

### Status

Below is a summary of the protocols supported by l7mp and the current status of the implementations.

| Type      | Protocol         | Session ID               | Type            | Role  | Mode             | Re/Lb   | Status  |
| :-------: | :--------------: | :----------------------: | :-------------: | :---: | :--------------: | :-----: | :-----: |
| Remote    | UDP              | IP 5-tuple               | datagram-stream | l/c   | singleton/server | yes/yes | Full    |
|           | TCP              | IP 5-tuple               | byte-stream     | l/c   | server           | yes/yes | Full    |
|           | HTTP             | IP 5-tuple               | byte-stream     | l     | server           | yes/yes | Partial |
|           | WebSocket        | IP 5-tuple + HTTP        | datagram-stream | l/c   | server           | yes/yes | Full    |
|           | JSONSocket       | IP 5-tuple + JSON header | datagram-stream | l/c   | server           | yes/yes | Full    |
|           | SCTP             | IP 5-tuple               | datagram-stream | l/c   | server           | yes/yes | TODO    |
|           | AF\_PACKET       | file desc                | datagram-stream | l/c   | singleton        | no/no   | TODO    |
| Local     | STDIO-fork       | N/A                      | byte-stream     | c     | singleton        | no/no   | Full    |
|           | UNIX/stream      | file desc/path           | byte-stream     | l/c   | server           | yes/yes | Full    |
|           | UNIX/dgram       | file desc/path           | datagram-stream | l/c   | singleton        | no/no   | TODO    |
|           | PIPE             | file desc/path           | byte-stream     | l/c   | singleton        | no/no   | TODO    |
| Transform | Stdio            | N/A                      | byte-stream     | c     | singleton        | yes/no  | Full    |
|           | Echo             | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | Discard          | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | Logger           | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | JSONENcap        | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | JSONDecap        | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |

The standard protocols, like TCP, HTTP/1.1 and HTTP/2 (although only listener/server side at the moment), WebSocket, and Unix Domain Socket (of the byte-stream type, see below) are fully supported, and for plain UDP there are two modes available: in the "UDP singleton mode" l7mp acts as a "connected" UDP server that is statically tied/connected to a downstream remote IP/port pair, while in "UDP server mode" l7mp emits a new "connected" UDP session for each packet received with a new IP 5-tuple. In addition, JSONSocket is a very simple "UDP equivalent of WebSocket" that allows to enrich a plain UDP stream with arbitrary JSON encoded metadata; see the spec [here](doc/jsonsocket-spec.org). Finally, SCTP is a reliable message transport protocol widely used in telco applications and AF\_PACKET would allow to send and receive raw L2/Ethernet or L3/IP packets on a stream; currently adding proper support for these protocols is a TODO.

Furthermore, there is a set of custom pseudo-protocols included in the l7mp proxy to simplify debugging and troubleshooting: the "Stdio" protocol makes it possible to pipe a stream to the l7mp proxy's stdin/stdout, the "Echo" protocol implements a simple Echo server behavior which writes back everything it reads to the input stream, "Discard" simply blackholes everyting it receives, and finally "Logger" is like the Echo protocol but it also writes everything that goes through it to a file or to the standard output.  Finally, there are a couple of additional protocols (currently unimplemented) to further improve the usability of l7mp (see the equivalents in `socat(1)`): "STDIO-fork" is a protocol for communicating with a forked process through STDIO/STDOUT and PIPE uses standard UNIX pipes to do the same.

There are two *types* of streams supported by L7mp: a "byte-stream" (like TCP or Unix Domain Sockets in SOCK_STREAM mode) is a bidirectional stream that ignores segmentation/message boundaries, while "datagram-stream" is the same but it prefers segmentation/message boundaries whenever possible (e.g., UDP or WebSocket). The l7mp proxy warns if a datagram-stream type stream is routed to a byte-stream protocol, because this would lead to a loss of message segmentation. In addition, protocols may support any or both of the following two modes: a "singleton" mode protocol accepts only a single connection (e.g., a fully connected UDP listener will emit only a single session) while a "server" mode listener may accept multiple client connections, emitting a separate session for each connection received  (e.g., a TCP or a HTTP listener).

A protocol is marked with a flag `l` if it has a listener implementation in l7mp, acting as a server-side protocol "plug" that listens to incoming connections and emits new sessions, and with flag `c` if it implements the cluster side, i.e., the client-side of the protocol that can route a connection to an upstream service and load-balance across a set of remote endpoints, `Re` means that the protocol supports *retries* and `Lb` indicates that *load-balancing* support is also available for the protocol.


# The l7mp service mesh

The l7mp service mesh operator for Kubernetes is currently under construction, more details to follow soon.


# License

Copyright 2019-2020 by its authors. Some rights reserved. See AUTHORS.

MIT License
