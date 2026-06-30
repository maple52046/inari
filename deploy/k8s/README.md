# Deploying Inari to Kubernetes

Manifests for running the Inari S3 manager on Kubernetes. The runtime image is
pulled from the registry (`ghcr.io/maple52046/inari:<tag>`); do not transfer it
with `save`/`load`.

## Contents

| File | Purpose |
| --- | --- |
| [`namespace.yaml`](namespace.yaml) | `inari` namespace |
| [`secret.example.yaml`](secret.example.yaml) | Example `inari-env` Secret (env vars) |
| [`configmap-ca.example.yaml`](configmap-ca.example.yaml) | Example `inari-ca` ConfigMap (internal CA) |
| [`deployment.yaml`](deployment.yaml) | Deployment (1 replica) |
| [`service.yaml`](service.yaml) | `ClusterIP` Service (default) |
| [`service-nodeport.yaml`](service-nodeport.yaml) | `NodePort` Service (port 32591) |

## Configuration

The app is configured entirely through the `inari-env` Secret:

| Key | Required | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | >= 32 chars; seals the credential cookie. The app fails fast if missing. |
| `DEFAULT_S3_ENDPOINT` | No | Pre-filled endpoint on `/connect`. |
| `SERVER_ACTIONS_ALLOWED_ORIGINS` | Only behind a proxy | Comma-separated hosts whose Origin differs from the forwarded Host. |

`ALLOWED_DEV_ORIGINS` is a dev-only setting and is ignored in the production
image.

### Internal / corporate CA

The S3 endpoint may use a certificate signed by an internal CA. The distroless
runtime ships only public CAs, so the chain (issuing CA + root) is provided via
the `inari-ca` ConfigMap, mounted at `/etc/inari-ca/ca.crt`, and the Deployment
sets `NODE_EXTRA_CA_CERTS=/etc/inari-ca/ca.crt`. Without this Node fails with
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Never disable TLS verification instead.

## Quick start (example, ClusterIP)

```bash
kubectl apply -f namespace.yaml

# Create the real Secret from your env file (preferred over the example):
kubectl -n inari create secret generic inari-env --from-env-file=../../.env.local

# Create the CA ConfigMap from your CA file:
kubectl -n inari create configmap inari-ca \
  --from-file=ca.crt=/usr/local/share/ca-certificates/your-ca.crt

kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

kubectl -n inari rollout status deploy/inari
```

Reach a `ClusterIP` service via port-forward:

```bash
kubectl -n inari port-forward svc/inari 8080:80
# open http://localhost:8080
```

## NodePort

To expose on a fixed node port instead of `ClusterIP`:

```bash
kubectl apply -f service-nodeport.yaml   # nodePort 32591
```

Then open `http://<node-host>:32591`. If you reach the app through a reverse
proxy and Server Actions return 403, add the exact browser origin host to
`SERVER_ACTIONS_ALLOWED_ORIGINS` in the Secret and restart the pod.

## Private image (pull secret)

If `ghcr.io/maple52046/inari` is private, create a pull secret and reference it:

```bash
kubectl -n inari create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<user> --docker-password=<token>
```

Then add to the Deployment pod spec:

```yaml
spec:
  template:
    spec:
      imagePullSecrets:
        - name: ghcr-pull
```

## Updating the image

Bump `spec.template.spec.containers[0].image` to the new tag and re-apply, or:

```bash
kubectl -n inari set image deploy/inari inari=ghcr.io/maple52046/inari:<new-tag>
kubectl -n inari rollout status deploy/inari
```

## Hardening notes

- The distroless image runs as root by default. To run as non-root, base the
  image on `gcr.io/distroless/nodejs24-debian12:nonroot` and add a pod
  `securityContext` with `runAsNonRoot: true`.
- Consider a `readOnlyRootFilesystem` with writable `emptyDir` mounts for
  `/tmp` and the Next cache if you tighten the container further.
