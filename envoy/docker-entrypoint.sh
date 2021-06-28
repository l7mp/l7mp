#!/bin/sh
set -e

echo "Generating envoy.yaml config file..."
cat /tmpl/envoy.yaml.tmpl | envsubst \$NODE_POD_UID,\$GRPC_SERVICE_NAME,\$GRPC_SERVICE_PORT,\$NG_CONTROL_LISTENER_PORT,\$NG_CONTROL_CLUSTER_ENDPOINT_ADDRESS,\$NG_CONTROL_CLUSTER_ENDPOINT_PORT > /etc/envoy.yaml

echo "Starting Envoy..."
/usr/local/bin/envoy -c /etc/envoy.yaml -l info --drain-time-s 1