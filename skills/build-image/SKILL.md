---
name: build-image
description: >-
  Build and push the Inari container image to the registry, working with either
  docker or nerdctl. Use when the user runs /build-image or asks to build, tag,
  or push the Inari image (e.g. to ghcr.io/maple52046/inari) before deploying.
disable-model-invocation: true
---

# build-image

Build the Inari distroless image from the repo `Dockerfile` and push it to the
registry. Engine-agnostic: works with **docker** or **nerdctl** (same
build/push CLI surface). Deployment is a separate concern — see the
`deploy-k8s` skill.

## Invocation

```
/build-image [--engine docker|nerdctl] [--tag <tag>] [--repo <repo>] [--no-push] [--latest]
```

| Option            | Required | Description                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------------- |
| `--engine <name>` | No       | Force `docker` or `nerdctl`. Default: auto-detect (docker first, then nerdctl).               |
| `--tag <tag>`     | No       | Image tag. Default: `date +%Y%m%d-%H%M%S`. The tag is also passed as the `VERSION` build-arg. |
| `--repo <repo>`   | No       | Image repo. Default: `ghcr.io/maple52046/inari`.                                              |
| `--no-push`       | No       | Build only; skip the push.                                                                    |
| `--latest`        | No       | Additionally tag and push `:latest`.                                                          |

Env overrides: `CONTAINER_ENGINE`, `IMAGE_REPO`.

## Workflow

```
- [ ] 1. Confirm engine + registry auth
- [ ] 2. Build and push via the helper script
- [ ] 3. Report the exact image ref and the deploy hint
```

### 1. Confirm engine and registry auth

- Decide the engine: honor `--engine`; otherwise the script auto-detects
  (`docker`, then `nerdctl`).
- Pushing to `ghcr.io` needs a prior login for the chosen engine, e.g.
  `docker login ghcr.io` or `nerdctl login ghcr.io`. If the push fails with an
  auth error, tell the user to log in; do not attempt to store credentials.

### 2. Build and push

Run the helper script (it computes the timestamp tag, builds with the correct
build context and `VERSION` build-arg, then pushes):

```bash
skills/build-image/scripts/build_push.sh [options]
```

The options mirror the invocation flags above. Examples:

```bash
# Default: auto-detect engine, timestamp tag, build + push
skills/build-image/scripts/build_push.sh

# Force nerdctl, build only (no push)
skills/build-image/scripts/build_push.sh --engine nerdctl --no-push

# Pin a tag and also push :latest
skills/build-image/scripts/build_push.sh --tag 20260725-110000 --latest
```

### 3. Report

Report the full image reference that was built/pushed (`<repo>:<tag>`) and the
follow-up deploy command the script prints:
`kubectl -n inari set image deploy/inari inari=<repo>:<tag>` (or hand off to the
`deploy-k8s` skill).

## Engine notes

- **docker**: no extra setup beyond `docker login`.
- **nerdctl**: `nerdctl build` requires a running BuildKit (`buildkitd`); if it
  errors with a BuildKit/daemon message, the user must start BuildKit first.
  Pushing to a remote registry is namespace-independent, so no `--namespace` is
  needed for this workflow.
- The CLI surface used here (`build --build-arg -t`, `push`) is identical across
  both engines, so no other differences apply.
