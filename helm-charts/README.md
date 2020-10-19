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
