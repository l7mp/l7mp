
# io.l7mp.api.v1.Config
Full L7mp static and runtime configuration


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| admin | Y | io.l7mp.api.v1.Admin | &nbsp; | &nbsp; | &nbsp; |
| listeners | Y | array[] of io.l7mp.api.v1.Listener | A list of Listener objects. | &nbsp; | &nbsp; |
| clusters | Y | array[] of io.l7mp.api.v1.Cluster | A list of Cluster objects. | &nbsp; | &nbsp; |
| sessions | &nbsp; | array[] of io.l7mp.api.v1.Session | A list of Session objects. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Admin
Static configuration


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| log_level | &nbsp; | string | Log verbosity, one of, from the most talkative, "silly", "verbose", "info", "notice", "warn", "error", and "silent" (not recommended). Default is "info". | &nbsp; | &nbsp; |
| log_file | &nbsp; | string | File to write log messages to. Default is "stderr". | &nbsp; | &nbsp; |
| access_log_path | &nbsp; | string | Access log (currently unimplemented). | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Listener
A socket that listens for incoming connection requests, an abstraction for an "ingress port".


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | Y | string | Name (required). | &nbsp; | &nbsp; |
| spec | Y | undefined | Listener specification (required). | &nbsp; | &nbsp; |
| rules | Y | array[] of io.l7mp.api.v1.Rule | A list of Rule objects (required). | &nbsp; | &nbsp; |

# io.l7mp.api.v1.HTTPListenerSpec
A HTTP server specification that accepts HTTP requests at a specified port.
- protocol: HTTP
- session ID: IP 5-tuple
- type: session
- mode: server



## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "HTTP". | <ul><li>HTTP</li></ul> | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |
| path | &nbsp; | string | HTTP URL to serve. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.WebSocketListenerSpec
A WebSocket server specification that accepts HTTP/WebSocket requests at a specified port.
- protocol: WebSocket
- session ID: IP 5-tuple
- type: datagram
- mode: server



## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "WebSocket". | <ul><li>WebSocket</li></ul> | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |
| path | &nbsp; | string | HTTP URL for to serve. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.UDPSingletonListenerSpec
A connected UDP listener that accepts UDP datagrams from a specified remote address-port pair.
- protocol: UDP
- session ID: IP 5-tuple
- type: datagram
- mode: singleton



## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "UDP". | <ul><li>UDP</li></ul> | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |
| connect | Y | io.l7mp.api.v1.Parameter.AddressPortPair | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Cluster
A socket that originates connections to external services, an abstraction for an "egress port".


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | Y | string | &nbsp; | &nbsp; | &nbsp; |
| spec | Y | undefined | &nbsp; | &nbsp; | &nbsp; |
| endpoints | &nbsp; | array[] of io.l7mp.api.v1.EndPoint | A list of EndPoint objects. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.WebSocketClusterSpec
A WebSocket cluster specification that forwards HTTP/WebSocket connections to an upstream cluster.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "WebSocket". | <ul><li>WebSocket</li></ul> | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.UDPSingletonClusterSpec
A UDP sender socket that forwards UDP connections to an upstream cluster, connecting to a well-defined remote address-port pair.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "UDP". | <ul><li>UDP</li></ul> | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |
| bind | &nbsp; | io.l7mp.api.v1.Parameter.AddressPortPair | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.L7mpControllerSpec
A virtual cluster that accepts L7mp controller REST API calls.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "L7mpController". | <ul><li>L7mpController</li></ul> | &nbsp; |

# io.l7mp.api.v1.StdioClusterSpec
A virtual cluster that writes the stream routed to it to the proxy standard output and pipes back standard input into the stream. Useful for debugging.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "stdio". | <ul><li>stdio</li></ul> | &nbsp; |

# io.l7mp.api.v1.Session
A socket that originates connections to external services, an abstraction for an "egress port".



# io.l7mp.api.v1.EndPoint
A particular upstream backend that accepts connects through a Cluster.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | &nbsp; | string | Name (optional, a unique endpoint name will be assigned automatically if not specified.) | &nbsp; | &nbsp; |
| spec | Y | undefined | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.WebSocketEndPointSpec
A WebSocket endpoint specification.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| address | Y | io.l7mp.api.v1.Parameter.Address | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.UDPSingletonEndPointSpec
A UDP endpoint specification.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| address | Y | io.l7mp.api.v1.Parameter.Address | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Route
The route to be assigned to a session in a math-action rule.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| cluster | Y | string | The "destination" cluster of the route (required). | &nbsp; | &nbsp; |
| ingress | &nbsp; | array[] of strings | The set of transforms to be applied in the "ingress" (upstream, from the listener to the cluster) direction (optional). | &nbsp; | &nbsp; |
| egress | &nbsp; | array[] of strings | The set of transforms to be applied in the "eress" (downstream, from the cluster to the listener) direction (optional). | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Match
The "filter" part of a math-action rule that filters on session metadata.



# io.l7mp.api.v1.Action
The "action" part of a math-action rule that assigns a route to the matched sessions.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| metadata | &nbsp; | object | JSON query for manipulating session metadata (optional). | &nbsp; | &nbsp; |
| route | Y | io.l7mp.api.v1.Route | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Rule
A math-action rule that defines the route of a connection through the L7mp pipeline.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| match | &nbsp; | io.l7mp.api.v1.Match | &nbsp; | &nbsp; | &nbsp; |
| action | Y | io.l7mp.api.v1.Action | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Status
General status info.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| status | &nbsp; | integer | Status code. | &nbsp; | &nbsp; |
| error | &nbsp; | string | Error. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Error
Error info.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| status | &nbsp; | integer | &nbsp; | &nbsp; | &nbsp; |
| err | &nbsp; | string | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Parameter.AddressPortPair
A pair of a network layer (IP/IPv6) address/domain name and a transport layer port.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| address | Y | io.l7mp.api.v1.Parameter.Address | &nbsp; | &nbsp; | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |
