---
title: "Routing and Protocol Conversion"
tags: 
 - Service Mesh
 - Task
 - Kubernetes
order: 5
description: "The first task with l7mp service mesh."
---

# Routing and Protocol Conversion

This task will show that, howe **l7mp** handle **Routing** and **Protocol Conversion**. 

## Before you begin

- You have to make sure that you have an installed minikube and you are able to 
  install the l7mp with helm. [here](./l7mp_getting_started)
- Make sure you are understand the basic conceps: `link to basic concepts`.

## About this task

This example demonstrates a simple UDP API gateway for video-game networking or 
IoT. The **worker** service is exposed to the outside world though `UDP:9001` through 
the **gateway**, with the added twist that inbound packets received from the 
Internet are processed through a **transcoder** service. This service, however, 
is reachable only via UNIX domain socket (UDS) that does not allow remote access, 
therefore the **transcoder** service will be exposed to the rest of the cluster on 
a remote access protocol `WebSocket:8888`, with the **l7mp** sidecar proxy doing proper 
protocol-conversion for the app (WS <-> UDS). (NB: Currently **l7mp** supports only 
byte-stream UDS so we will lose the original message framing at this point; 
proper datagram-stream UDS will be added later.)

<img src="../assets/images/rawConcept.svg" alt="Concept" class="center">

### Static configuration 

#### Transcoder

Add a `transcoder` deployment, identified by the label `app:transcoder` but with 
no backing Kubernetes service, which will implement the transcoding functionality. 
Each pod will contain two containers: a container for the transcoder process 
itself that accepts connections via UDS (can be an UDS echo server for testing) 
and another `l7mp` container that implements the sidecar.

To achieve this, you must first execute the following command, which will create a **Deployment** 
with two Pods containing 2-2 containers. One container will be the **l7mp as a sidecar** 
with a simple *Controller* configuration through which the l7mp operator will be able to configure 
the sidecar. The second container will be a **Unix Domain Socket** echo server with a simple `socat` 
command that reads from the `/tmp/uds-echo.sock` socket and writes back the transcoded messages 
there as follows: `Transcoded on <pod-name>: <message>`.

```
kubectl apply -f https://l7mp.io/tasks/task1/transcoder-deployment.yaml
```

Now that this is the case, you should somehow configure the **l7mp sidecar** to be able to convert 
incoming *WebSocket packets* to a *Unix Domain Socket* and write it to the `/tmp/uds-echo.sock` socket. 
The first step is to create a cluster on the transcoder objects. Therefore, you must first 
select the pods that have such a label and write a cluster in the sidecar that listens to and 
directs traffic to */tmp/uds-echo.sock*.

``` yaml
cat <<EOF | kubectl apply -f -
apiVersion: l7mp.io/v1
kind: Target
metadata:
  name: uds-cluster
spec:
  selector:
    matchExpressions:
      - key: app
        operator: In
        values:
        - transcoder
  cluster:
    spec:
      UnixDomainSocket:
        filename: "/tmp/uds-echo.sock" 
    endpoints:
      - spec:
          filename: "/tmp/uds-echo.sock" 
EOF
```

Secondly, the protocol conversion itself would need to be implemented by creating a *listener* 
object in the transcoder sidecar, which will listen WebSocket packets on port 8888 and 
redirect to the cluster you just created. Thus, the transcoder can only receive and transmit 
WebSocket traffic, but only UDS traffic within it.

``` yaml
cat <<EOF | kubectl apply -f -
apiVersion: l7mp.io/v1
kind: VirtualService
metadata:
  name: transcoder-vsvc
  namespace: default
spec:
  selector:
    matchExpressions:
      - key: app
        operator: In
        values:
        - transcoder
  listener:
    name: websocket
    spec:
      WebSocket:
        port: 8888
    rules:
      - action:
          route:
            destinationRef: /apis/l7mp.io/v1/namespaces/default/targets/uds-cluster
EOF
```

Fantastic! Now you can send and receive *WebSocket* messages from **transcoder**. 
But you cannot specify a *VirutalService/Listener* as destinatination only 
*Targets/Clusters*. So you have to create a cluster inside the **l7mp-ingress**
which can be addressed by the *Gateway VirtualService* at the end of this task.

``` yaml
cat <<EOF | kubectl apply -f -
apiVersion: l7mp.io/v1
kind: Target
metadata:
  name: ws-svc
  namespace: default
spec:
  selector:
    matchLabels:
      app: l7mp-ingress
  linkedVirtualService: /apis/l7mp.io/v1/namespaces/default/virtualservices/transcoder-vsvc
EOF
```

With the configuration above you can't use a specific loadbalancer it always use trivial, which 
will always route traffic to the first endpoint in the cluster. So if you want to specify for 
example a *ConsistentHash* loadbalanacer you should use the configuration below instead the 
previously described. 

``` yaml
cat <<EOF | kubectl apply -f -
apiVersion: l7mp.io/v1
kind: Target
metadata:
  name: websocket-cluster
spec:
  selector:
    matchExpressions:
      - key: app
        operator: In
        values:
        - l7mp-ingress
  cluster:
    spec:
      WebSocket:
        port: 8888
    loadbalancer:
      policy: ConsistentHash
    endpoints:
      - selector:
          matchLabels:
            app: transcoder
EOF
```

The loadbalancer will allow pods to be accessed randomly each time you connect. The 
randomness stems from not specifying a key for the *ConsistentHash* loadbalancer.

#### Worker

The next command will create a very similar deployment to the *transcoder*, the only 
difference being that there will be a **UDP echo server** here and not a UDS. This echo 
server will echo back packets from any address on *port 9999* in the following format: 
`Echo on <pod-name>: <message>`.

```
kubectl apply -f https://l7mp.io/tasks/task1/worker-deployment.yaml
```

Now you need to create a new cluster, but this time it will not be written to sidecar 
for the worker, but to the ingress gateway, for which you simply need to filter with this 
key value pair when selecting: app: `l7mp-ingress`.

``` yaml
cat <<EOF | kubectl apply -f -
apiVersion: l7mp.io/v1
kind: Target
metadata:
  name: udp-cluster
spec:
  selector:
    matchExpressions:
      - key: app
        operator: In
        values:
        - l7mp-ingress
  cluster:
    spec:
      UDP:
        port: 9999
    loadbalancer:
      policy: ConsistentHash
    endpoints:
      - selector: 
          matchLabels:
            app: worker
EOF
```

Please notice the *endpoints section*. There is no concrete address or configuration of an
endpoint only a selector. So if a pod has the `app: worker` label it will be an endpoint of 
the **udp-cluster**.  

#### Gateway

Finally, you only have to connect these services together with an other *Virtual Service*.
This will be the **gateway-vsvc**, which receive traffic from **l7mp-ingress** and first 
send to the transcoder and the result from transcoder to the worker and send back the 
traffic to the client.  

``` yaml
cat <<EOF | kubectl apply -f -
apiVersion: l7mp.io/v1
kind: VirtualService
metadata:
  name: gateway-vsvc
  namespace: default
spec:
  selector:
    matchLabels: 
      app: l7mp-ingress
  listener:
    spec:
      UDP:
        port: 9001
    rules:
      - action:
          route:
            destinationRef: /apis/l7mp.io/v1/namespaces/default/targets/udp-cluster
            ingress:
              - clusterRef: /apis/l7mp.io/v1/namespaces/default/targets/websocket-cluster
EOF
```

## Test

If everything is working you have to test it. (You can use other tool for testing.)

```
socat - udp4:$(minikube ip):9001
```

You have to see something like this if you send something. 

``` 
$ socat - udp4:$(minikube ip):9001 
This is a test!
Echo on worker-deployment-6bfdf5584c-97dgn: 
Transcoded on transcoder-deployment-6784fc494c-6t7l5: This is a test!
Hurray it's working! 
Echo on worker-deployment-6bfdf5584c-97dgn: 
Transcoded on transcoder-deployment-6784fc494c-6t7l5: Hurray it's working! 
```

## Cleanup

To remove this setup use the following command: 

```
curl -LO https://l7mp.io/tasks/task1/cleanup.sh
chmod u+x cleanup.sh
./cleanup.sh
```