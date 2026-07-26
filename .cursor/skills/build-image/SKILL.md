---
name: build-image
description: >-
  Build and push the Inari container image to the registry, working with either
  docker or nerdctl. Use when the user runs /build-image or asks to build, tag,
  or push the Inari image (e.g. to ghcr.io/maple52046/inari) before deploying.
disable-model-invocation: true
---

# build-image — Cursor Entry

This is a thin Cursor wrapper. The canonical instructions live in
[`skills/build-image/SKILL.md`](../../../skills/build-image/SKILL.md)
(relative to the repository root). Read that file and follow it exactly; keep
this file as a thin reference so there is a single source of truth.

Invocation:

```
/build-image [--engine docker|nerdctl] [--tag <tag>] [--repo <repo>] [--no-push] [--latest]
```
