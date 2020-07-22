*[L7mp is currently under construction, with many advertised features untested, not working as promised, or completely missing.]*

L7mp is a Layer-7, multiprotocol service proxy and a service mesh framework. The emphasis is on *multiprotocol* support, which lets l7mp to handle lots of transport- and application-layer network protocols natively not just the usual TCP/HTTP, and transparently convert between different protocol encapsulations. The intention is for l7mp to serve as an incubator project to prototype the main service mesh features, in order to support network-intensive legacy/non-HTTP applications seamlessly in Kubernetes.

The distribution contains an *l7mp proxy* component, a programmable proxy that can stitch an arbitrary number of application-level traffic streams together into an end-to-end stream in a protocol-agnostic manner (e.g., you can pipe a UNIX domain socket to a WebSocket stream and vice versa), and a *service mesh* component, in the form of a Kubernetes operator, which can manage a legion of l7mp gateway and sidecar proxy instances seamlessly to enforce a rich set of high-level traffic management and observability policies throughout an entire cluster.


## The l7mp proxy

The l7mp proxy is modeled after [Envoy](https://github.com/envoyproxy/envoy), in that it uses similar abstractions (Listeners, Clusters, etc.), but in contrast to Envoy that is mostly HTTP/TCP-centric, l7mp is optimized for persistent, long-lived UDP-based media and tunneling protocol streams. The l7mp proxy features an extended routing API, which allows to transparently pipe application streams across diverse protocol encapsulations, with automatic and transparent protocol transformation, native support for datagram- and byte-streams, stream multiplexing and demultiplexing, encapsulation/decapsulation, etc.

Considering the strong emphasis on multiprotocol support, the l7mp proxy may actually be closer in nature to `socat(1)` than to Envoy, but it is dynamically configurable via a REST API in contrast to `socat(1)` which is a static CLI tool (in turn `socat` it is much more feature-complete).

The l7mp proxy is written in Javascript/Node.js. This way, it is much simpler and easier to extend than Envoy or `socat`, but at the same time it is also much slower. It does not have to be that way though; an XDP/ebpf-based proxy-acceleration framework is under construction that would enable l7mp to run at hundreds of thousands of packets per second speed.


## The l7mp service mesh

The l7mp distribution contains a Kubernetes operator that makes it possible to deploy and configure multiple instances of l7mp as sidecar proxies and service/API gateways, in a framework that can be best described as a multiprotocol service mesh. The operator is currently under construction, more details to follow soon.


# Installation

The below should eventually work fine, once l7mp gets open-sourced.

```sh
npm install l7mp --save
```

Until then, use the enclosed Dockerfile to deploy l7mp. At least Node.js v14 is required.


# Usage example


## Run

Run l7mp locally with a [sample](https://github.com/rg0now/l7mp/blob/master/config/l7mp-minimal.yaml) static configuration.

```sh
node l7mp-proxy.js -c config/l7mp-minimal.yaml -l warn -s
```

Configuration is accepted either in YAML format (if the extension is `.yaml`) or JSON (otherwise). Command line arguments override static configuration parameters.


## Query configuration

The sample configuration will fire up a HTTP listener at port 1234 and route it to the l7mp controller that serves the l7mp REST API. This API can be used to query or configure the proxy on the fly; e.g., the below will dump the full configuration in JSON format:

```sh
curl http://localhost:1234/api/v1/config
```


## Manage sessions

On top of the static configuration, the response contains a new `sessions` list that enumerates the set of active (connected) sessions in l7mp. You can list the live sessions explicitly as follows:

```sh
curl http://localhost:1234/api/v1/sessions
```

You should see only a single HTTP session: this session was created by the l7mp proxy to route the REST API query from the HTTP listener to the controller endpoint and this session happens to be active when the session list request is issued.

You can also delete any session (suppose its name is `session-name`) via the below REST API call.

```sh
curl -iX DELETE http://localhost:1234/api/v1/sessions/<session-name>
```


## Add a new cluster

Add a new WebSocket *cluster* named `ws-cluster` that will connect to a WebSocket server at `localhost:16000` and add an *endpoint* at `localhost:16000`.

```sh
curl -iX POST --header 'Content-Type:text/x-yaml' --data-binary @- <<EOF  http://localhost:1234/api/v1/clusters
cluster:
  name: ws-cluster
  spec: { protocol: "WebSocket", port: 16000 }
  endpoints:
    - spec: { address:  "127.0.0.1" }
EOF
```

Note that the REST API accepts both JSON and YAML configs (YAML will be converted to JSON internally). If multiple endpoints are added, l7mp will load-balance among these.


## Add a new listener and a route

Now add a new UDP *listener* called `udp-listener` at port 15000 that will accept connections with source port 15001 and *route* the received connections to the above cluster (named `ws-cluster`).

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
  name: udp-listener
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


## Routing

On session creation, l7mp will demultiplex the bidirectional stream received at the listener into two uni-directional streams: the *ingress stream* (in the direction from the source/listener to the destination/cluster) will be routed through the `Logger` transform cluster. Theoretically, a transform cluster is free to apply any modification it wants to the traffic passing through it, it can be local (built into the l7mp datapath, like `Logger`) or remote (e.g., another WebSocket cluster), the only requirement is that the cluster endpoint listen at the specified address on the specified port and send the modified traffic back to l7mp. For now, the `Logger` cluster just dumps the content of the stream without transforming it in any ways, but you get the point. The returned stream is then piped to the cluster `ws-cluster`. In the *egress direction* (from the destination/cluster back to the source/listener), no transformation occurs as the egress chain spec is missing.

The ingress and the egress routes are specified and handled separately. Both routes can contain a list of any number of transform clusters that will be chained sequentially, automatically performing transparent protocol and payload conversion along the way. Note that datagram boundaries are preserved during transformation whenever possible, and when it is not (i.e., piping a UDP stream to a TCP cluster will lose segmentation), l7mp issues a warning.

The above should yield the routes:

    ingress: udp-listener -> logger-cluster -> ws-cluster
    egress:  ws-cluster -> udp-listener


## Retries and timeouts

Route specifications can contain a `retry` spec, in order to describe what to do when one of the connected clusters fail. By the above spec, l7mp will automatically retry the connection at most 3 times both on connection setup errors and disconnect events on already established connections, waiting each time 2000 ms for the stream to be successfully re-established.


## Test the connection

To complete the connection, fire up a `socat(1)` sender (don't forget to bind the sender to 15001, otherwise l7mp, which connects back to this port, will not accept the connection):

```sh
socat - udp:localhost:15000,sourceport=15001
```

Then, [start](https://github.com/vi/websocat) a `websocat` receiver:

```sh
websocat -Eb ws-l:127.0.0.1:16000 -
```

What you type in the sender should appear at the receiver verbatim, and the l7mp proxy should report everything that passes from the sender to the receiver on the standard output. Note that in the reverse direction, i.e., from the receiver to the sender, nothing will be logged, since the `Logger` was added to the *ingress route* only but not to the *egress route*.


## Clean up

Provided that the new session is named `session-name` (l7mp automatically assigns a unique name to each session, you can check this by issuing a GET request to the API endpoint `/api/v1/sessions`), you can delete the session, the cluster and the listener as follows:

```sh
curl -iX DELETE http://localhost:1234/api/v1/sessions/<session-name>
curl -iX DELETE http://localhost:1234/api/v1/listeners/user-1-2-l
curl -iX DELETE http://localhost:1234/api/v1/clusters/user-1-2-c
```

NB: the rulelist, rule, and the route created implicitly by the listener will not be removed by the above call, but this should make no harm.


# Protocol support

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
| Transform | INLINE/STDIO     | N/A                      | byte-stream     | c     | singleton        | yes/no  | Full    |
|           | INLINE/Echo      | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | INLINE/Discard   | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | INLINE/Logger    | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | INLINE/JSONENcap | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |
|           | INLINE/JSONDecap | N/A                      | datagram-stream | c     | singleton        | yes/no  | Full    |


## Protocols

-   UDP "singleton mode" is a "connected" UDP server, while UDP "server mode" is a listener-only protocol that emits a new session for each packet received with a new IP 5-tuple
-   STDIO-fork is a (transform-only) protocol for communicating with a forked process through STDIO/STDOUT
-   Inline/STDIO pipes the stream to the l7mp proxy stdin/stdout, stream reads from stdin and write to stdout (useful for debugging)
-   Inline/Echo is an Echo Cluster, writes back everything it reads (useful for debugging)
-   Inline/Discard is blackholes everyting it receives
-   Inline/Logger is like an Echo Cluster, but it also writes everything that goes through it to a file or to the standard output (useful for debugging)


## Session id

A unique name/descriptor for a session, generated dynamically by the protocol's listener.


## Type

-   byte-stream: segmentation/message boundaries not preserved
-   datagram-stream segmentation/message boundaries preserved

Note that streams can run on top of datagram protocols but not the other way around; l7mp warns when such a conversion is requested.


## Mode

-   server: listen+accept -> new session
-   singleton: can emit a single session only


## Role

-   listener (l): protocol supports listeners to emit sessions
-   cluster (c): protocol supports clusters to forward sessions to


## Re/Lb

-   Re: Retries support, Lb: load-balance support


# License

Copyright 2019-2020 by its authors. Some rights reserved. See AUTHORS.

MIT License
