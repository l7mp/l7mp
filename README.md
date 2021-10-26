[![Build Status](https://travis-ci.org/l7mp/l7mp.svg?branch=master)](https://travis-ci.org/l7mp/l7mp)
[![Coverage Status](https://coveralls.io/repos/github/l7mp/l7mp/badge.svg?branch=master)](https://coveralls.io/github/l7mp/l7mp?branch=master)

<img src="./logo.svg" width="20%"></img>

# l7mp: A L7 Multiprotocol Proxy and Service Mesh

*[L7mp is currently under construction, with many advertised features untested, not working as promised, or completely missing.]*

L7mp is an experimental Layer-7, multiprotocol service proxy and a service mesh framework. The emphasis is on multiprotocol support, which lets l7mp to handle lots of transport- and application-layer network protocols natively, not just the usual TCP/HTTP, and transparently convert between different protocol encapsulations. The intention for l7mp is to serve as an incubator project to prototype the main service mesh features that are indispensable to support network-intensive legacy/non-HTTP applications seamlessly in Kubernetes.

The distribution contains an l7mp proxy component and a service mesh operator for Kubernetes. 

The *l7mp proxy* is a programmable proxy very similar in nature to Envoy. The difference is that the l7mp proxy is purposely built from the bottom-up to support multiprotocol operations, in that it can stitch an arbitrary number of application-level traffic streams together into an end-to-end stream in a protocol-agnostic manner; e.g., you can pipe a UNIX domain socket to a WebSocket stream and vice versa and it should just work as expected. The proxy is written in a high-level language framework, node.js, which makes it particularly easy to extend: adding a new protocol to l7mp is a matter of implementing a custom listener and a cluster, usually about a hundred lines of Javascript code. Meanwhile, a tc/ebpf-based kernel acceleration service is in development to mitigate the Javascript performance tax.

The *l7mp service mesh* operator can be used to manage a legion of l7mp gateway and sidecar proxy instances seamlessly. It allows to enforce a rich set of high-level traffic management and observability policies throughout an entire cluster, enjoying the convenience of a high-level Kubernetes API, much akin to the Istio or the Service Mesh Interface API.

The l7mp framework is work-in-progress. This means that at any instance of time some features may not work as advertised or may not work at all, and some critical features, including the security API, are left for further development. Yet, l7mp is already capable enough to serve as a demonstrator to get a glimpse into the multiprotocol future of the service mesh concept.


## The l7mp data plane

The data plane of the l7mp framework is comprised by a set of l7mp proxy instances. The l7mp proxy supports multiple deployment models; e.g., it can be deployed as an ingress gateway to feed traffic with exotic protocol encapsulations into a Kuberntes cluster, or as a sidecar proxy to expose a legacy UDP/SCTP application to a Kuberntes cluster using a cloud-native protocol.

The l7mp proxy is modeled after [Envoy](https://github.com/envoyproxy/envoy), in that it uses similar abstractions (Listeners, Clusters, etc.), but in contrast to Envoy that is mostly HTTP/TCP-centric, l7mp is optimized for persistent, long-lived UDP-based media and tunneling protocol streams. The l7mp proxy features an extended routing API, which allows to transparently pipe application streams across diverse protocol encapsulations, with automatic and transparent protocol transformation, native support for datagram- and byte-streams, stream multiplexing and demultiplexing, encapsulation/decapsulation, etc.

Considering the strong emphasis on multiprotocol support, the l7mp proxy may actually be closer in nature to `socat(1)` than to Envoy, but it is dynamically configurable via a REST API in contrast to `socat(1)` which is a static CLI tool (in turn `socat` it is much more feature-complete).

The l7mp proxy is written in Javascript/Node.js. This way, it is much simpler and easier to extend than Envoy or `socat`, but at the same time it is also much slower. It does not have to be that way though; a tc/ebpf-based proxy-acceleration framework is under construction that would enable l7mp to run at hundreds of thousands of packets per second speed.


## The l7mp control plane

The l7mp distribution contains a Kubernetes operator that makes it possible to deploy and configure multiple instances of l7mp as sidecar proxies and service/API gateways, in a framework that can be best described as a multiprotocol service mesh. The operator uses the same high-level concepts as most service mesh frameworks (i.e., VirtualServices), but it contains a number of extensions (the Route and the Target custom resources) that allow the user to precisely control the way traffic is routed across the cluster.


## Deployment models

Currently there are two ways to deploy l7mp: either the l7mp proxy is deployed in a standalone mode (e.g., as a gateway or a sidecar proxy) in which case each distinct l7mp proxy instance needs to be configured (using a static config file of via the l7mp proxy REST API), or it is used in conjunction with the l7mp service mesh operator for Kubernetes, which makes it possible to manage possibly large numbers of l7mp proxy instances enjoying the convenience of a high-level Kubernetes API.

# The l7mp service mesh

In this short introduction we use Minikube to demonstrate the installation of the l7mp service mesh. Of course, using the below `helm` charts will make it possible to deploy l7mp in any Kubernetes cluster.

### Set up l7mp inside a Minikube cluster

First, install `kubectl` and `helm`:

- For installing `kubectl` and minikube please follow this guide: [Install Tools](https://kubernetes.io/docs/tasks/tools/)
- For installing `helm` please follow this guide: [Installing Helm](https://helm.sh/docs/intro/install/). Note that with Helm 2 the below commands may take a bit different form. 

Then, bootstrap your `minikube` cluster and deploy the `l7mp-ingress` helm chart.

``` sh
minikube start
helm repo add l7mp https://l7mp.io/charts
helm repo update
helm install l7mp l7mp/l7mp-ingress
```

**WARNING:** the `l7mp-ingress` chart will automatically (1) deploy the l7mp proxy in the host network namespace of all your Kubernetes nodes and (2) open up two HTTP ports (the controller port 1234 and the Prometheus scraping port 8080) for unrestricted external access on each of your nodes. If your nodes are available externally on these ports, this will allow unauthorized access to the ingress gateways of your cluster. Before installing this helm chart, make sure that you filter port 1234 and 8080 on your cloud load-balancer. Use this chart only for testing, never deploy in production unless you know the potential security implications.

This configuration will deploy the following components into the `default` namespace:
- `l7mp-ingress`: an l7mp proxy pod at each node (a `DaemonSet`) sharing the network namespace of the host (`hostNetwork=true`), plus a Kubernetes service called `l7mp-ingress`. The proxies make up the data-plane of the l7mp service mesh.
- `l7mp-operator`: a control plane pod that takes a high-level mesh configuration as a set of Kubernetes Custom Resource objects (i.e., VitualServices, Targets, etc.) as input and creates the appropriate data-plane configuration, i.e., a series of REST calls to the l7mp proxies, to map the high-level intent to the data plane.

In order to add the l7mp Prometheus toolchain into the `monitoring` namespace for automatically surfacing data-plane metrics from the l7mp proxies, install the `l7mp-prometheus` chart:

``` sh
helm install l7mp-prometheus l7mp/l7mp-prometheus
```

After the installation finishes, your Prometheus instance will be available on the NodePort 30900.

You can check the status of your l7mp deployment as usual:

``` sh
kubectl get pod,svc,vsvc,target,rule -o wide -n default -n monitoring
```

You should see an output like:

```
NAME                                      READY   STATUS    RESTARTS   AGE     IP              NODE       NOMINATED NODE   READINESS GATES
pod/alertmanager-alertmanager-0           2/2     Running   0          2m34s   172.17.0.8      minikube   <none>           <none>
pod/grafana-86b84774bb-7s7kq              1/1     Running   0          3m10s   172.17.0.5      minikube   <none>           <none>
pod/kube-state-metrics-7df77cbbd6-x27x5   3/3     Running   0          3m10s   172.17.0.4      minikube   <none>           <none>
pod/node-exporter-j59fj                   2/2     Running   0          3m10s   192.168.39.45   minikube   <none>           <none>
pod/prometheus-operator-9db5cb44b-hf7cq   1/1     Running   0          3m10s   172.17.0.6      minikube   <none>           <none>
pod/prometheus-prometheus-0               2/2     Running   1          2m33s   172.17.0.9      minikube   <none>           <none>
pod/prometheus-prometheus-1               2/2     Running   1          2m33s   172.17.0.10     minikube   <none>           <none>

NAME                            TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)                      AGE     SELECTOR
service/alertmanager            NodePort    10.102.201.47    <none>        9093:30903/TCP               3m10s   alertmanager=alertmanager
service/alertmanager-operated   ClusterIP   None             <none>        9093/TCP,9094/TCP,9094/UDP   2m34s   app=alertmanager
service/grafana                 NodePort    10.104.212.103   <none>        80:30901/TCP                 3m10s   app=grafana
service/kube-state-metrics      ClusterIP   None             <none>        8443/TCP,9443/TCP            3m10s   app.kubernetes.io/name=kube-state-metrics
service/node-exporter           ClusterIP   None             <none>        9100/TCP                     3m10s   app.kubernetes.io/name=node-exporter
service/prometheus              NodePort    10.104.58.199    <none>        9090:30900/TCP               3m10s   app=prometheus
service/prometheus-operated     ClusterIP   None             <none>        9090/TCP                     2m34s   app=prometheus
service/prometheus-operator     ClusterIP   None             <none>        8080/TCP                     3m10s   app.kubernetes.io/component=controller,app.kubernetes.io/name=prometheus-operator
```

You are ready to go! Enjoy using l7mp. 

### Query configuration and manage sessions

At any point in time you can directly read the configuration of the l7mp proxies using the l7mp REST API. By default, the l7mp proxy HTTP REST API port is opened at port 1234 *on all proxy pods*. This is extremely useful to check your mesh configuration for debuging purposes, but as mentioned above it also opens a considerable security hole if the port is reachable from outside your cluster. 

The below call returns the whole configuration of the ingress gateway l7mp proxy:

``` sh
curl http://$(minikube ip):1234/api/v1/config
```

To query the directory of active connections through the data plane and delete the session named `session-name`, you can use the below REST API calls:

``` sh
curl http://$(minikube ip):1234/api/v1/sessions
curl -iX DELETE http://$(minikube ip):1234/api/v1/sessions/<session-name>
```

### Usage example: 

Applying the below configuration will expose the `kube-dns` Kubernetes system DNS service through the l7mp ingress gateway on port 5053. Note that, depending on the type of DNS service deployed, the below may or may not work in your own cluster.

``` sh
kubectl apply -f - <<EOF
apiVersion: l7mp.io/v1
kind: VirtualService
metadata:
  name: kube-dns-vsvc
spec:
  selector:
    matchLabels:
      app: l7mp-ingress
  listener:
    spec:
      UDP:
        port: 5053
    rules:
      - action:
          route:
            destination:
              spec:
                UDP:
                  port: 53
              endpoints:
                - spec: { address:  "kube-dns.kube-system.svc.cluster.local" }
EOF
```

In an on itself, this configuration does not make anything fancier than exposing the `kube-dns` service using a NodePort. The additional features provided by l7mp, including routing, timeouts/retries, load-balancing and monitoring, can be enabled by customizing this VirtualService spec. For more information on the use of the l7mp service mesh, consult the Tasks section in the documentation.


### Test

Administer a DNS query to your Kubernetes cluster:

```
dig @$(minikube ip) +timeout=1 +notcp +short kube-dns.kube-system.svc.cluster.local -p 5053
10.96.0.10
```

The above call will send a DNS query to the minikube cluster, which the l7mp ingress gateway will properly route to the `kube-dns` service (after querying the same DNS service for the ClusterIP corresponding to `kube-dns`) and deliver the result back to the sender.

### Clean up

Delete the VirtualService we created above:

``` sh
kubectl delete virtualservice kube-dns-vsvc
```

To delete the entire l7mp service mesh, Simply delete with `helm`. Note that this will not remove the Custom Resource Definitions installed by the l7mp helm chart, you will need to do that manually:

``` sh
helm delete l7mp
```

# The l7mp proxy

## Installation

### Standalone installation

Use the below to install the l7mp proxy from the official l7mp distribution at [npm.js](https://npmjs.org).

```sh
npm install l7mp
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
cd node_modules/l7mp
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

### Multiprotocol Support

The main feature l7mp intends to get right is multiprotocol support. While l7mp is optimized for persistent, long-lived UDP-based media and tunneling protocol streams, and hence the support for the usual HTTP protocol suite is incomplete as of now, it should already be pretty capable as a general purpose multiprotocol proxy and service mesh, supporting lots of built-in transport and application-layer protocols. Below is a summary of the protocols supported by l7mp and the current status of the implementations.

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

A protocol is marked with a flag `l` if it has a listener implementation in l7mp, acting as a server-side protocol "plug" that listens to incoming connections from downstream peers and emits new sessions, and with flag `c` if it implements the cluster side, i.e., the client-side of the protocol that can route a connection to an upstream service and load-balance across a set of remote endpoints, `Re` means that the protocol supports *retries* and `Lb` indicates that *load-balancing* support is also available for the protocol.

## Kernel offload

To enhanche performance, l7mp provides an experimental kernel offload feature. The offload uses the tc-bpf Linux kernel mechanism and supports UDP traffic. We show the usage and details of the kernel offload is in its dedicated [documentation](kernel-offload/README.md).

# The l7mp service mesh

The l7mp service mesh operator for Kubernetes is currently under construction, more details to follow soon.


# License

Copyright 2019-2020 by its authors. Some rights reserved. See AUTHORS.

MIT License
