
# io.l7mp.api.v1.Config
Full L7mp static and runtime configuration


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| admin | Y | io.l7mp.api.v1.Admin | &nbsp; | &nbsp; | &nbsp; |
| listeners | Y | array[] of io.l7mp.api.v1.Listener | A list of Listener objects. | &nbsp; | &nbsp; |
| clusters | Y | array[] of io.l7mp.api.v1.Cluster | A list of Cluster objects. | &nbsp; | &nbsp; |
| sessions | &nbsp; | array[] of io.l7mp.api.v1.Session | A list of Session objects. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.AdminRequest
Wrapper for addAdmin calls: contains only a single Admin object.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| admin | Y | io.l7mp.api.v1.Admin | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Admin
Static configuration


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| log_level | &nbsp; | string | Log verbosity, one of, from the most talkative, "silly", "verbose", "info", "notice", "warn", "error", and "silent" (not recommended). Default is "info". | &nbsp; | &nbsp; |
| log_file | &nbsp; | string | File to write log messages to. Default is "stderr". | &nbsp; | &nbsp; |
| access_log_path | &nbsp; | string | Access log (currently unimplemented). | &nbsp; | &nbsp; |
| strict | &nbsp; | boolean | Enable strict mode: validates all REST API calls against OpenAPI schema (default: false). | &nbsp; | &nbsp; |

# io.l7mp.api.v1.ListenerRequest
Wrapper for addListener calls: contains only a single Listener object


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| listener | Y | io.l7mp.api.v1.Listener | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Listener
A socket that listens for incoming connection requests, an abstraction for an "ingress port".


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | Y | string | Name (required). | &nbsp; | &nbsp; |
| spec | Y | object | Listener specification (required). | &nbsp; | &nbsp; |
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
A connected UDP listener that accepts UDP datagrams from a specified remote address-port pair. In connected mode, waits for the first packet from the specified remote IP/port pair and connects back. In unconnected mode (connect field not specified), waits for the first packet and uses the source IP/port in that packet as remote to which it connects back. In any case, subsequent packets will be accepted only from the same remote.
- protocol: UDP
- session ID: IP 5-tuple
- type: datagram
- mode: singleton



## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "UDP". | <ul><li>UDP</li></ul> | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |
| connect | &nbsp; | io.l7mp.api.v1.Parameter.AddressPortPair | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.ClusterRequest
Wrapper for addCluster calls: contains only a single Cluster object.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| cluster | Y | io.l7mp.api.v1.Cluster | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Cluster
A socket that originates connections to external services, an abstraction for an "egress port".


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | &nbsp; | string | &nbsp; | &nbsp; | &nbsp; |
| spec | Y | object | &nbsp; | &nbsp; | &nbsp; |
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
| protocol | Y | enum | The protocol, must be "Stdio". | <ul><li>Stdio</li></ul> | &nbsp; |

# io.l7mp.api.v1.EchoClusterSpec
A virtual cluster that echoes back everything it receives.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "Echo". | <ul><li>Echo</li></ul> | &nbsp; |

# io.l7mp.api.v1.LoggerClusterSpec
A virtual cluster that logs everything that passes through it to a log file.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| protocol | Y | enum | The protocol, must be "Logger". | <ul><li>Logger</li></ul> | &nbsp; |
| log_file | &nbsp; | string | The file to log to. Opened it mode "w" (create or truncate if exists). Default is '-' (stdout). | &nbsp; | &nbsp; |
| log_prefix | &nbsp; | string | Prefix log messages. Default is no prefix. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.EndPoint
A particular upstream backend that accepts connects through a Cluster.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | &nbsp; | string | Name (optional, a unique endpoint name will be assigned automatically if not specified.) | &nbsp; | &nbsp; |
| spec | Y | io.l7mp.api.v1.EndPointSpec | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.EndPointSpec
A generic endpoint specification.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| address | Y | io.l7mp.api.v1.Parameter.Address | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.RetryPolicy
Retry-timeout rules (not implemented).



# io.l7mp.api.v1.Route
The route to be assigned to a session in a math-action rule.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| listener | &nbsp; | string | The "source" of the route (optional). If specified, must be a string. | &nbsp; | &nbsp; |
| cluster | Y | undefined | The "destination" cluster of the route (required). Can be a string in which case it is the name of an existing cluster with the name given, or it can be an inline cluster definition in which case a new cluster will be added. | &nbsp; | &nbsp; |
| ingress | &nbsp; | array[] of  | The set of transforms to be applied in the "ingress" (upstream, from the listener to the cluster) direction (optional). | &nbsp; | &nbsp; |
| egress | &nbsp; | array[] of  | The set of transforms to be applied in the "eress" (downstream, from the cluster to the listener) direction (optional). | &nbsp; | &nbsp; |

# io.l7mp.api.v1.JSONPredicate
A complex filter specified as a JSON predicate, see https://tools.ietf.org/html/draft-snell-json-test-07



# io.l7mp.api.v1.Rewrite
Metadata rewrite rule. Find or create metadata at the specified path and set it to the specified value.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| path | Y | string | The JSON path to the metadata field to rewrite. Will be created if path does not exist. | &nbsp; | &nbsp; |
| value | Y | undefined | The value to rewrite the metadata field at the specified path. Can be a simple string or a JSON/YAML snippet. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Action
The "action" part of a math-action rule that assigns a route to the matched sessions.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| rewrite | &nbsp; | array[] of io.l7mp.api.v1.Rewrite | A list of rewrite rules. | &nbsp; | &nbsp; |
| route | Y | io.l7mp.api.v1.Route | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Rule
A math-action rule that defines the route of a connection through the L7mp pipeline. May contain a match and an action. If no match is specified, a wildcard match is automatically installed.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | &nbsp; | string | Name (optional). | &nbsp; | &nbsp; |
| match | &nbsp; | io.l7mp.api.v1.JSONPredicate | &nbsp; | &nbsp; | &nbsp; |
| action | Y | io.l7mp.api.v1.Action | &nbsp; | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Metadata
Metadata that describes a session's all known parameters, like ports and IP addresses, status, HTTP headers (if relevant), etc. In general, metadata are created by the listener and they can be modified/queried/matched in rules/actions.



# io.l7mp.api.v1.Session
An ongoing connection that is known by the proxy. A session is created by a listener receiving a new connection request and it is processed according to the match-action rules associated by the creating listener .


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| name | &nbsp; | string | Name. | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Status
General status info.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| message | Y | string | Message. | &nbsp; | &nbsp; |
| error | &nbsp; | undefined | Error (optional). | &nbsp; | &nbsp; |

# io.l7mp.api.v1.Parameter.AddressPortPair
A pair of a network layer (IP/IPv6) address/domain name and a transport layer port.


## Properties
| property | required | type | description | details | example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| address | Y | io.l7mp.api.v1.Parameter.Address | &nbsp; | &nbsp; | &nbsp; |
| port | Y | io.l7mp.api.v1.Parameter.Port | &nbsp; | &nbsp; | &nbsp; |
