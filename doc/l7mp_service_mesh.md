---
title: "The l7mp service mesh"
tags: 
 - jekyll
 - github
order: 4 
description: "The l7mp service mesh: Basic concepts"
---

## Concepts 

### VirtualService

VirtualServices describe abstract services that listen on a specified 
server-side socket address. A VirtualService is either backed by a proper 
Kubernetes service, which provides the list of endpoints/pods the 
VirtualService referes to, or map to endpoints/pods using standard Kubernetes 
label matching (e.g., “deploy this VirtualService to all pods labeled with 
`app:worker`). A VirtualService then specifies the basic network parameters 
clients can use to reach the service (protocol and port) and it can add 
additional behavior to the service, like request routing, rewriting, etc.

If a VirtualService contains an in-line ruleset then traffic received on 
the corresponding listener will be forwarded based on the route in the 
matching rule’s action. Such “proxy-type” VirtualServices must run a sidecar; 
it is an error to deploy a proxy VirtualService to a naked Kubernetes service. 
Otherwise, the VirtualService is a stub that works in a request-response 
config; such VirtualServices are used e.g., to wrap naked Kubernetes services.

A VirtualService consists of 4 parts: 
1. A selector defining the corresponding pods, 
2. A listener specification for creating a server-side socket to receive 
   inbound connection requests, 
3. A rule-list (optional) comprising a list of match-action rules, with each 
   match condition specified as a JSONPredicate query on connection metadata and 
   an action that describes what to do with the connection (rewrite rule or route) 
   if the corresponding condition matches, and 
4. Further options (optional).

See these sections in the code below: 

``` yaml
apiVersion: l7mp.io/v1
kind: VirtualService
metadata:
  name: ...
  namespace: default
spec: 
  selector: 
    ...
  listener:
    name: ... (optional)
    spec:
      <protocol>:
        port: .. 
    rules:
      - match: ... (optional)
        action: ... 
      ...
```

A rule with an empty match is a catch-all rule that always matches. The rule-list 
is evaluated when the listener socket emits a new connection request (i.e., at 
connection-setup time) sequentially, and the action of the fist matching rule 
is applied. Currently there is no API for adding/deleting individual rules.

The Kubernetes control plane operator should automatically generate an 
(identically named) VirtualService for each naked Kubernetes 
service. The VirtualService should contain the `protocol` and `port` keys from the 
Kubernetes service spec, and nothing else. This could be done on-demand (when a 
service appears in a route target), or for all Kubernetes services by 
default on creation. Contrariwise, a VirtualService must be manually specified for 
each pod/deployment/service/etc. that runs a sidecar proxy, otherwise, the sidecar 
would not know what to do with the received traffic; no automatic VirtualService 
is generated for such services. The operator keeps record of VirtualServices 
backed by naked Kubernetes services and never generates sidecar config for 
such services.

### Route

Routes can be specified either inline in a VirtualService match-action rule in 
which case the Route is unnamed for the control plane (the proxy still generates 
a unique name but it is not exposed through to control plane) and share fate with 
the VirtualService, or separately with a unique name, in which case multiple 
VirtualServices and/or match-action rules can reuse the same Route.

A Route consists of a destination specification (`destination`), pointing to the 
service “sink” that will eventually consume the traffic of the connection, an 
ingress chain (`ingress`) that appoints the list of “transformers” or middlepoint 
services that will process the traffic of the connection in the inbound direction, 
that is, from the listener socket that emitted the connection request (the “source”) 
towards the destination, and an egress chain (`egress`) that specifies middlepoints 
in the reverse direction, from the destination to the source. The `destination` is 
mandatory, but the `ingress` and the `egress` are optional, and each entry is an inline 
or named Target object. Note that the ingress and egress chains may differ 
(stream mux/demux).

Example for a Route definition:

``` yaml
apiVersion: l7mp.io/v1
kind: Route
metadata:
  name: ...
  namespace: default
spec:
  destination: <cluster-name> 
  retry:
    retry_on: always 
    num_retries: 3
    timeout: 2000
```

### Target

Target objects specify the client-side settings for a connection (the upstream 
“cluster” as per `l7mp` and Envoy), i.e., load-balancing rules, local connection parameters 
(e.g., local bind address and port). In addition, Targets also specify the endpoints 
the client should connect to, either via referring to a VirtualService under the 
`linkedVirtualService` key or inline, statically. Targets appear as the entries in 
the ingress/egress chains and as the destination in Route objects.

Targets can either be specified explicitly with a unique name, which allows multiple 
VirtualServices/Routes to refer to the same Target spec, or inline in the `destination` 
spec or `ingress` or `egress` list entries without a name.

If a `destination` spec or `ingress` or `egress` list entry consists of a single string, 
then the following rules apply:
1. The string is assumed to be the name of a Target (which can add client-side 
   parameters, like load-balancing rules or bind address and port).
2. If no named Target with that name exists, then the string is assumed to be a proper 
   VirtualService name, in which case an identically named Target is automatically 
   created with the server-side connection parameters (protocol and port) and the 
   endpoint IPs taken from that VirtualService.
3. If a VirtualService with the given name does not exist either, then the string is 
   assumed to be the name of a naked Kubernetes service and an empty VirtualService is 
   automatically generated, taking the server-side connection parameters (protocol and 
   port) from the Kubernetes service spec. This will then allow the auto-generation of 
   the corresponding Target as per point (2) above (see an example later).
4. If a naked Kubernetes service does no exist either, return an error.

If, on the other hand, the a `destination` or an `ingress` or `egress` list entry is an object, 
then it is assumed to be a fully specified unnamed in-line Target specification.

If a Target refers to a VirtualService (under the key `linkedVirtualService=`), then the 
Kubernetes control plane operator will generate the list of endpoint/pod IP addresses for 
the dataplane from that VirtualService (i.e., “all pod IPs in the deployment of the `worker` 
service” or “all IPs of pods labeled `app:worker`”). More precisely, using 
linkedVirtualService is the same as appending the spec.selector of the linked VirtualService 
to spec.cluster.endpoints of the Target and copying the spec.listener of the linked 
VirtualService to spec.cluster.spec.spec of the Target. This allows the sidecar proxy to 
implement its own load-balancing policy independently from the default Kubernetes 
load-balancing mechanism. Otherwise, the Target lists a fixed set of endpoints statically 
(this is useful to call external services or to expose, e.g., a UNIX domain socket server 
via a remote access protocol like WebSocket or UDP, see below). The endpoint address in 
this case may be any proper domain name; e.g., specifying `kube-dns` domain name of a 
Kubernetes service as an endpoint address will fall back to standard Kubernetes 
load-balancing for the Target.

Example for a Target defination: 

``` yaml
apiVersion: l7mp.io/v1
kind: Target
metadata:
  name: ...
  namespace: default
spec:
  selector:
    ...
  cluster:
    spec:
      protocol: ...
        port: ...
      ...
    loadbalancer:
      policy: ...
      ...
    endpoints:
      - selector:
          ...
```

### Racap & Essentials

The API specifies 3 CRDs:

- VirtualService: wrap server-side sockets
- Route: discribe the way of connections should be routed across the cluster
- Target: add client-side behavior

<!--- Each object should have a short name (e.g., `vsvc-name`) and a fully-specified 
name (like, e.g., `vsvc-name.namespace.virtualservice.cluster.local`). If an 
object refers to another object with a short name then that object is assumed 
to be in the same namespace. To refer to an object in another namespace, 
use the fully specified name. -->

It is assumed that the ingress gateway and the sidecar proxies are provided 
by `l7mp` (“Layer-7 Multiprotocol Proxy”). The default `l7mp` API port is `TCP:1234`. 
The operator should warn on clashing port definitions.

Deploying the gateways and sidecar injection occur manually (we may eventually 
implement support to ease this). In addition, the sidecar doesn’t capture 
inbound/outbound connections to/from the wrapped app (in contrast to Istio), 
so the app needs to be aware that it should talk to a sidecar proxy instead of 
the external world. 

It is not mandatory to inject each Kubernetes service with a sidecar proxy; a 
plain Kubernetes service with no sidecars is called a “naked” service. For 
naked services the endpoints/pods are supposed to support the inbound 
connection protocol natively (i.e., without `l7mp` doing local protocol conversion) 
and server-side features will be unavailable (e.g., monitoring). The Kubernetes 
controller can identify the gateways and sidecars it needs to manage (i.e., 
for non-naked Kuernetes services, etc.).


## Reference

<img src="../assets/images/under-construction.png" alt="Under construction" width="50">

## Tasks

<img src="../assets/images/under-construction.png" alt="Under construction" width="50">


