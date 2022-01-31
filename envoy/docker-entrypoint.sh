#!/bin/sh
set -e

echo "Generating envoy.yaml config file..."
cat /tmpl/envoy.yaml.tmpl | envsubst \$NODE_POD_UID,\$GRPC_SERVICE_NAME,\$GRPC_SERVICE_PORT,\$NG_CONTROL_LISTENER_PORT,\$NG_CONTROL_CLUSTER_ENDPOINT_ADDRESS,\$NG_CONTROL_CLUSTER_ENDPOINT_PORT > /etc/envoy.yaml

echo "Starting Envoy..."
echo /usr/local/bin/envoy -c /etc/envoy.yaml $LOG_LEVEL --drain-time-s $DRAIN_TIME --drain-strategy $DRAIN_STRATEGY #--parent-shutdown-time-s $(($DRAIN_TIME+$DRAIN_TIME))
/usr/local/bin/envoy -c /etc/envoy.yaml $LOG_LEVEL --drain-time-s $DRAIN_TIME --drain-strategy $DRAIN_STRATEGY #--parent-shutdown-time-s $DRAIN_TIME


#LOG_LEVEL with flag like: -l info AND/OR --component-log-level upstream:debug,config:trace
#DRAIN_TIME must be a number in sec
#DRAIN_STRATEGY must be gradual or immediate