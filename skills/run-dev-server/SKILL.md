---
name: run-dev-server
description: >-
  Start the Inari Next.js dev server in the background and confirm it is ready,
  reusing an already-running instance instead of starting a duplicate. Use when
  the user runs /run-dev-server or asks to start, restart, or check the dev
  server for local development.
disable-model-invocation: true
---

# run-dev-server

Start the Next.js dev server (`npm run dev`) in the background, verify it became
ready, and report its URLs.

## Invocation

```
/run-dev-server [-p <num> | --port <num>] [-h | --help]
```

| Option                     | Required | Description                                                     |
| -------------------------- | -------- | --------------------------------------------------------------- |
| `-p <num>`, `--port <num>` | No       | Port to bind. Default: `3000`.                                  |
| `-h`, `--help`             | No       | Print the help message below and stop. Do not start the server. |

### Help message

When `-h` / `--help` is given, print exactly this and take no further action:

```
/run-dev-server [-p <num> | --port <num>] [-h | --help]

  -p <num>, --port <num>   Port to bind (default: 3000)
  -h, --help               Show this help message

Starts the Inari Next.js dev server in the background and reports its URLs.
```

## Workflow

```
- [ ] 1. --help: print the help message and stop
- [ ] 2. Reuse an already-running dev server instead of starting a second one
- [ ] 3. Confirm the target port is free
- [ ] 4. Start the server in the background, outside the sandbox
- [ ] 5. Wait for the ready line, then report the URLs
```

### 1. `--help`

Print the help message verbatim and stop. Do not inspect processes or start
anything.

### 2. Reuse a running server

Check existing terminal sessions for a `npm run dev` command before starting
another. **A session's log can be stale**: a finished run keeps its output around
with a footer recording its exit. Treat a server as running only when the
process is alive and the port is bound (step 3), not because a log looks healthy.

If one is already running on the target port, report its URLs and stop.

### 3. Confirm the port is free

```bash
ss -ltnp | grep -E ':<port>\b' || echo "(free)"
pgrep -af "next-server|next dev" || echo "(none)"
```

- Port bound by something else → report it and ask before touching it.
- An orphan `next-server` that binds **no** port is a harmless leftover from an
  aborted run. Do not kill processes this workflow did not start without asking.

### 4. Start it

```bash
npm run dev                 # default port
npm run dev -- -p <num>     # explicit port
```

Two requirements:

- **Background it immediately** (`block_until_ms: 0`); the server does not exit.
- **Run outside the sandbox** (`required_permissions: ["all"]`). The app reaches
  an internal S3 endpoint, which the sandbox's network allowlist blocks, so a
  sandboxed server starts but fails every storage request.

### 5. Confirm readiness and report

Wait for output matching `Ready in|Error|EADDRINUSE`, then read the log and
report the `Local:` and `Network:` URLs plus the Next.js version. `EADDRINUSE`
means step 3 missed a listener; report it rather than retrying blindly.

## Operational notes

- The dev script is `NODE_OPTIONS=--use-system-ca next dev`, so Node trusts the
  OS store; an internal CA installed there needs no extra flag. Env comes from
  `.env.local`.
- A weak or missing `SESSION_SECRET` fails at request time, not startup, so a
  clean `✓ Ready` does not prove the app is usable.
- `⚠ Fast Refresh had to perform a full reload due to a runtime error` right
  after an edit is usually a transient intermediate state, e.g. a symbol used
  before its import landed. Confirm a following `✓ Compiled` and a 2xx request
  before treating it as a real failure.
- Report the log's own compile/request lines when diagnosing; do not restart the
  server to "clear" a warning.
