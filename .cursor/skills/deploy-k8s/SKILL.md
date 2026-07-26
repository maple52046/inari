---
name: deploy-k8s
description: >-
  Deploy the Inari app to Kubernetes and roll out image or config changes. Use
  when the user runs /deploy-k8s or asks to deploy Inari to k8s, apply the
  manifests, update the running image tag, restart the deployment, or edit the
  inari-env Secret. Building/pushing the image is handled by the build-image skill.
disable-model-invocation: true
---

# deploy-k8s — Cursor Entry

This is a thin Cursor wrapper. The canonical instructions live in
[`skills/deploy-k8s/SKILL.md`](../../../skills/deploy-k8s/SKILL.md)
(relative to the repository root). Read that file and follow it exactly; keep
this file as a thin reference so there is a single source of truth.

Invocation:

```
/deploy-k8s [--tag <tag>] [--namespace <ns>] [--first-time] [--restart]
```
