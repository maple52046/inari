---
name: deploy-k8s
description: >-
  Deploy the Inari app to Kubernetes and roll out image or config changes. Use
  when the user runs /deploy-k8s or asks to deploy Inari to k8s, apply the
  manifests, update the running image tag, restart the deployment, or edit the
  inari-env Secret. Building/pushing the image is handled by the build-image skill.
disable-model-invocation: true
---

# deploy-k8s

Deploy Inari to Kubernetes and roll out changes. Manifests and the full
reference live in [`deploy/k8s/`](../../deploy/k8s/) and
[`deploy/k8s/README.md`](../../deploy/k8s/README.md). Building/pushing the image
is a separate concern — see the `build-image` skill.

## Invocation

```
/deploy-k8s [--tag <tag>] [--namespace <ns>] [--first-time] [--restart]
```

| Option              | Required | Description                                                                                          |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `--tag <tag>`       | No       | Roll the Deployment to `ghcr.io/maple52046/inari:<tag>` via `kubectl set image`.                      |
| `--namespace <ns>`  | No       | Target namespace. Default: `inari`.                                                                   |
| `--first-time`      | No       | Run the initial install (namespace, Secret, CA ConfigMap, Deployment, Service).                       |
| `--restart`         | No       | `kubectl rollout restart` to pick up Secret/ConfigMap changes without a new image.                    |

## Safety first

- **Confirm the target cluster before mutating anything.** Run
  `kubectl config current-context` and show it to the user; a wrong context is
  the main risk. Do not switch contexts on your own.
- Never print or commit Secret values. Create Secrets from the user's local
  `.env.local`, not by echoing credentials.

## Workflow

```
- [ ] 1. Show current context + namespace; confirm target
- [ ] 2. Pick the path: first-time install / image roll / restart
- [ ] 3. Run the commands
- [ ] 4. Wait for rollout and report
```

### First-time install (`--first-time`)

```bash
kubectl apply -f deploy/k8s/namespace.yaml
# Secret from the user's local env file (preferred over the example manifest):
kubectl -n inari create secret generic inari-env --from-env-file=.env.local
# Internal CA for the S3 endpoint (adjust the source path):
kubectl -n inari create configmap inari-ca \
  --from-file=ca.crt=/usr/local/share/ca-certificates/your-ca.crt
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml            # or service-nodeport.yaml
kubectl -n inari rollout status deploy/inari
```

Choose `service-nodeport.yaml` instead of `service.yaml` when exposing on a
fixed node port (`http://<node>:32591`).

### Roll to a new image (`--tag`)

```bash
kubectl -n inari set image deploy/inari inari=ghcr.io/maple52046/inari:<tag>
kubectl -n inari rollout status deploy/inari
```

### Restart to pick up config changes (`--restart`)

```bash
kubectl -n inari rollout restart deploy/inari
kubectl -n inari rollout status deploy/inari
```

## HTTP access gotcha (SESSION_COOKIE_SECURE)

If the app is reached over **plaintext HTTP** (e.g. the NodePort service), the
`Secure` session cookie is dropped by the browser and login bounces straight
back to `/connect`. For HTTP-only access, set `SESSION_COOKIE_SECURE=false` in
the `inari-env` Secret and restart:

```bash
kubectl -n inari patch secret inari-env --type merge \
  -p '{"stringData":{"SESSION_COOKIE_SECURE":"false"}}'
kubectl -n inari rollout restart deploy/inari
```

Prefer terminating TLS in front of the app (keep the cookie `Secure`) for
anything beyond a trusted internal network — the cookie carries sealed S3
credentials.

## Report

State the context/namespace used, the action taken (install / image `<tag>` /
restart), and the final `rollout status` result.
