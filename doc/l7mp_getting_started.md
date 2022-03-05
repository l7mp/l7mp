---
title: Getting started
tags: 
 - jekyll
 - github
order: 2
description: Getting started with l7mp
---

# Getting started guide

There are two ways to deploy l7mp: for implementing complex use cases we recommend the "service mesh" setup, where a set of l7mp proxies are deployed at the perimeter to ingress traffic into the cluster and route it along the proper chain of microservices, while for experimentation with the l7mp proxy itself we recommend the "standalone" installation.

## Using the l7mp proxy in standalone mode

### Standalone installation

Use the below to install the l7mp proxy from the official l7mp distribution at [npm.js](https://npmjs.org).

``` sh
npm install l7mp --save
npm test
```

At least Node.js v14 is required.

### Docker installation

Pull the official image by `docker pull l7mp/l7mp:latest` or use the enclosed Dockerfile to deploy the l7mp proxy. 

### Deploy into Kubernetes

Use the below configuration to deploy l7mp as an ingress gateway in your Kubernetes cluster.

``` yaml
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

### Run

The below usage examples assume that the l7mp proxy is deployed in standalone mode and it is available on the `localhost`.

Run l7mp locally with a [sample](config/l7mp-minimal.yaml) static configuration.

``` sh
node l7mp-proxy.js -c config/l7mp-minimal.yaml -l warn -s
```

Configuration is accepted either in YAML format (if the extension is `.yaml`) or JSON (otherwise). Command line arguments override static configuration parameters.

### Query configuration

The sample configuration will fire up a HTTP listener on port 1234 and route it to the l7mp controller that serves the l7mp REST API. This API can be used to query or configure the proxy on the fly; e.g., the below will dump the full configuration in JSON format:

``` sh
curl http://localhost:1234/api/v1/config
```

For a list of all REST API endpoints, see the [l7mp OpenAPI specs](https://l7mp.io/openapi).

### Manage sessions

On top of the static configuration, the response contains a list of `sessions`, enumerating the set of active (connected) streams inside l7mp. You can list the live sessions explicitly as follows:

``` sh
curl http://localhost:1234/api/v1/sessions
```

You should see only a single HTTP session: this session was created by the l7mp proxy to route the REST API query from the HTTP listener to the controller endpoint and this session happens to be active when the session list request is issued.

You can also delete any session (suppose its name is `session-name`) via the below REST API call.

``` sh
curl -iX DELETE http://localhost:1234/api/v1/sessions/<session-name>
```

### Add a new cluster

Add a new WebSocket *cluster* named `ws-cluster` that will connect to an upstream WebSocket service with a single *endpoint* at `localhost:16000`.

``` sh
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

``` sh
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

``` sh
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

``` sh
socat - udp:localhost:15000,sourceport=15001
```

Then [start](https://github.com/vi/websocat) a `websocat` receiver:

``` sh
websocat -Eb ws-l:127.0.0.1:16000 -
```

What you type in the sender should now appear at the receiver verbatim, and the l7mp proxy should report everything that passes from the sender to the receiver on the standard output. Note that in the reverse direction, i.e., from the receiver to the sender, nothing will be logged, since the `Logger` was added to the *ingress route* only but not to the *egress route*.

### Clean up

Provided that the new session is named `session-name` (l7mp automatically assigns a unique name to each session, you can check this by issuing a GET request to the API endpoint `/api/v1/sessions`), you can delete this session as follows:

``` sh
curl -iX DELETE http://localhost:1234/api/v1/sessions/<session-name>
```

In addition, use the below to remove the `udp-listener` and `ws-cluster`:

``` sh
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

## Using the l7mp service mesh

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