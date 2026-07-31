---
name: build-deb
description: >-
  Build the Inari Debian package, which installs the binary, the configuration,
  and the systemd unit. Use when the user runs /build-deb or asks to produce a
  .deb, package Inari for Debian or Ubuntu, or prepare an apt-installable
  artefact. Container images are handled by build-image; a bare binary by
  build-binary.
disable-model-invocation: true
---

# build-deb — Cursor Entry

This is a thin Cursor wrapper. The canonical instructions live in
[`skills/build-deb/SKILL.md`](../../../skills/build-deb/SKILL.md)
(relative to the repository root). Read that file and follow it exactly; keep
this file as a thin reference so there is a single source of truth.

Invocation:

```
/build-deb [arch] [--version <v>] [--skip-binary] [-h | --help]
```
