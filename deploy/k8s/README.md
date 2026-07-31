# Deploying Inari to Kubernetes

Manifests for running the Inari S3 manager on Kubernetes. The runtime image is
pulled from the registry (`ghcr.io/maple52046/inari:<tag>`); do not transfer it
with `save`/`load`.

The image is a single static Rust binary with the web bundle embedded, on a
`scratch` base — around 10 MB, no shell, no package manager, no interpreter.

## Contents

| File                                                     | Purpose                                    |
| -------------------------------------------------------- | ------------------------------------------ |
| [`namespace.yaml`](namespace.yaml)                       | `inari` namespace                          |
| [`secret.example.yaml`](secret.example.yaml)             | Example `inari-env` Secret (env vars)      |
| [`configmap-ca.example.yaml`](configmap-ca.example.yaml) | Example `inari-ca` ConfigMap (internal CA) |
| [`deployment.yaml`](deployment.yaml)                     | Deployment (1 replica)                     |
| [`service.yaml`](service.yaml)                           | `ClusterIP` Service (default)              |
| [`service-nodeport.yaml`](service-nodeport.yaml)         | `NodePort` Service (port 32591)            |

## Configuration

The app is configured entirely through the `inari-env` Secret:

| Key                     | Required            | Notes                                                                                     |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`        | Yes                 | >= 32 chars; seals the credential cookie. The pod fails to start if missing or too short. |
| `DEFAULT_S3_ENDPOINT`   | No                  | Pre-filled endpoint on `/connect`.                                                        |
| `SESSION_COOKIE_SECURE` | Only for HTTP       | Defaults to `true`. Set to `false` for plaintext HTTP access (NodePort); see below.       |
| `BASE_PATH`             | Only under a prefix | URL prefix the app is mounted under, e.g. `/dashboard`. See [URL prefix](#url-prefix).    |

Configuration errors are start-up failures, not request-time surprises: a
missing `SESSION_SECRET` or an unreadable extra CA stops the process with the
reason named in the log, and the value is never echoed.

> **Login bounces back to `/connect` over HTTP?** The session cookie is `Secure`
> by default, and browsers silently drop `Secure` cookies on plaintext HTTP
> origins (except `localhost`), so every request looks unauthenticated. Either
> put TLS in front of the app (recommended) or set `SESSION_COOKIE_SECURE=false`
> in the Secret for HTTP-only access. Note that `false` transmits the sealed S3
> credentials over plaintext, so only use it on a trusted network.

## Probes

`/healthz` and `/readyz` are served at the **root**, outside any `BASE_PATH`, so
a prefixed deployment does not have to keep its probes in step with its mount
point. Neither touches S3, so a storage outage cannot restart-loop the pod.

## URL prefix

Setting `BASE_PATH` mounts the SPA and the API under that prefix, so an Ingress
can forward the prefixed path unchanged instead of rewriting it.

Nothing else has to follow. The prefix is resolved at start-up and applied three
ways: the router is mounted under it, the cookie path is scoped to it, and a
matching `<base href>` is injected into `index.html` so the bundle's relative
asset URLs resolve from the mount point. One image therefore serves any prefix,
with no rebuild, no writable filesystem, and no probe changes.

## Internal / corporate CA

The S3 endpoint may use a certificate signed by an internal CA. The image ships
only public roots, so the chain (issuing CA + root) is provided via the
`inari-ca` ConfigMap, mounted at `/etc/inari-ca`, with the Deployment setting
`INARI_EXTRA_CA_CERTS=/etc/inari-ca/ca.crt`.

That certificate is added to the platform roots rather than replacing them, so
public endpoints keep working. Mounting a CA over the image's bundle instead
would silently break every public endpoint.

An unreadable or malformed file fails start-up rather than surfacing later as a
confusing TLS error on every request. Never disable TLS verification instead.

## Quick start (example, ClusterIP)

```bash
kubectl apply -f namespace.yaml

# Create the real Secret from your env file (preferred over the example):
kubectl -n inari create secret generic inari-env --from-env-file=../../.env

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

Then open `http://<node-host>:32591`. Because this is plaintext HTTP, set
`SESSION_COOKIE_SECURE=false` in the `inari-env` Secret and restart the pod;
otherwise the `Secure` session cookie is dropped and login bounces back to
`/connect` (see the warning under [Configuration](#configuration)).

Mutating requests are rejected when their `Origin` is neither the request's own
host nor the configured development origin. Behind a reverse proxy this means
the proxy must preserve the `Host` header, which `proxy_set_header Host $host`
does.

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

## Resources and hardening

The manifest already runs the pod as non-root (`65532`) with a read-only root
filesystem and every capability dropped. The server writes nothing: the web
bundle is inside the binary and no state is kept on disk.

Requests and limits are sized from measurement rather than guesswork. The
process idles near 14 MiB and stays flat through exhaustive bucket scans,
because listings are paginated and the cleanup scan keeps only the candidates
it will return. Raising the limit should follow a recorded analysis, not a
stuck deploy.
