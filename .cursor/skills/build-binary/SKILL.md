---
name: build-binary
description: >-
  Build a distributable Inari server binary for a target OS and architecture,
  with the web bundle embedded. Use when the user runs /build-binary or asks to
  build, cross-compile, or produce a standalone Inari executable for release or
  for a systemd deployment. Container images are handled by the build-image
  skill.
disable-model-invocation: true
---

# build-binary — Cursor Entry

This is a thin Cursor wrapper. The canonical instructions live in
[`skills/build-binary/SKILL.md`](../../../skills/build-binary/SKILL.md)
(relative to the repository root). Read that file and follow it exactly; keep
this file as a thin reference so there is a single source of truth.

Invocation:

```
/build-binary [os] [arch] [--engine docker|nerdctl] [--out <dir>] [-h | --help]
```
