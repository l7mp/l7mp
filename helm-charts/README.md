# Install charts

```
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
helm repo add l7mp https://l7mp.io/charts
helm install l7mp/l7mp-ingress --generate-name 
```

The first command installs helm.  The second one adds the l7mp chart
repository.  Finally, the third one installs a helm _release_ into the
kubernetes cluster.

# Build charts

Hopefully, someday this will be automatic (issue #86), but for now you
can update the charts with:

```
helm package l7mp-operator l7mp-ingress
helm repo index .
cp ./index.yaml *.tgz ~/src/l7mp.io/charts
```

And then push the changes in the l7mp.io repo.

# Warning: Security hazard

This helm chart will (1) deploy the l7mp proxy in the host namespace of all your Kubernetes nodes
and (2) open up two HTTP ports (the controller port 1234 and the Prometheus scraping port 8080) for
unrestricted external access on each of your nodes. If your nodes are available externally, this
will allow unauthorized access to the ingress gateways of your cluster.

Before installing this helm chart, make sure that you filter port 1234 and 8080 on your cloud
cloud load-balancer. Use this chart only for testing, never deploy in production unless you know
the potential security implications.
