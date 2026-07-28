---
name: run-dev-server
description: >-
  Start the Inari Next.js dev server in the background and confirm it is ready,
  reusing an already-running instance instead of starting a duplicate. Use when
  the user runs /run-dev-server or asks to start, restart, or check the dev
  server for local development.
disable-model-invocation: true
---

# run-dev-server — Cursor Entry

This is a thin Cursor wrapper. The canonical instructions live in
[`skills/run-dev-server/SKILL.md`](../../../skills/run-dev-server/SKILL.md)
(relative to the repository root). Read that file and follow it exactly; keep
this file as a thin reference so there is a single source of truth.

Invocation:

```
/run-dev-server [-p <num> | --port <num>] [-h | --help]
```
