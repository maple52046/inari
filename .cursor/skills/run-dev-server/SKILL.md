---
name: run-dev-server
description: >-
  Start the Inari development servers (Rust API and Vite SPA) in the background
  and confirm they became ready, reusing already-running instances instead of
  starting duplicates. Use when the user runs /run-dev-server or asks to start,
  restart, or check the dev server for local development.
disable-model-invocation: true
---

# run-dev-server — Cursor Entry

This is a thin Cursor wrapper. The canonical instructions live in
[`skills/run-dev-server/SKILL.md`](../../../skills/run-dev-server/SKILL.md)
(relative to the repository root). Read that file and follow it exactly; keep
this file as a thin reference so there is a single source of truth.

Invocation:

```
/run-dev-server [-p <num> | --port <num>] [-b <path> | --base-path <path>] [--api-only] [-h | --help]
```
