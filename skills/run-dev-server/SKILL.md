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
/run-dev-server [-p <num> | --port <num>] [-b <path> | --base-path <path>] [-h | --help]
```

| Option                            | Required | Description                                                             |
| --------------------------------- | -------- | ----------------------------------------------------------------------- |
| `-p <num>`, `--port <num>`        | No       | Port to bind. Default: `3000`.                                          |
| `-b <path>`, `--base-path <path>` | No       | URL prefix to mount the app under, e.g. `/dashboard`. Sets `BASE_PATH`. |
| `-h`, `--help`                    | No       | Print the help message below and stop. Do not start the server.         |

### Help message

When `-h` / `--help` is given, print exactly this and take no further action:

```
/run-dev-server [-p <num> | --port <num>] [-b <path> | --base-path <path>] [-h | --help]

  -p <num>, --port <num>        Port to bind (default: 3000)
  -b <path>, --base-path <path> URL prefix to mount the app under (default: none)
  -h, --help                    Show this help message

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

If one is already running on the target port, report its URLs and stop — unless
the requested base path differs from the one it was started with, which no
amount of reloading changes. In that case report the mismatch and ask before
restarting it.

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
npm run dev                              # default port, no prefix
npm run dev -- -p <num>                  # explicit port
BASE_PATH=<path> npm run dev             # mounted under a URL prefix
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

When a base path is in effect, append it to the reported URLs — the bare origin
404s, which otherwise reads as a broken server.

## Base path (URL prefix)

`BASE_PATH` mounts pages, Server Actions and `/_next` assets under a prefix.
Next.js resolves it while loading `next.config.ts`, which happens **after** the
dotenv files are read, so all three of these work and take precedence in this
order:

1. `-b` / `--base-path`, passed inline as `BASE_PATH=<path> npm run dev`.
2. `BASE_PATH` already exported in the environment.
3. `BASE_PATH` in `.env.local` (or `.env`).

Because the value is baked into the running server, changing it means
restarting: ask before killing a server this workflow did not start.

Verify with the prefix, not the origin:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:<port><base-path>/connect
```

A `404` on `<base-path>/connect` together with a `200` on `/connect` means the
prefix never reached the config — check for a stale server from a previous run
before changing anything else.

## Operational notes

- The dev script is `NODE_OPTIONS=--use-system-ca next dev`, so Node trusts the
  OS store; an internal CA installed there needs no extra flag. Env comes from
  `.env.local`; the startup banner's `- Environments:` line lists every dotenv
  file that was actually loaded.
- A weak or missing `SESSION_SECRET` fails at request time, not startup, so a
  clean `✓ Ready` does not prove the app is usable.
- `⚠ Fast Refresh had to perform a full reload due to a runtime error` right
  after an edit is usually a transient intermediate state, e.g. a symbol used
  before its import landed. Confirm a following `✓ Compiled` and a 2xx request
  before treating it as a real failure.
- Report the log's own compile/request lines when diagnosing; do not restart the
  server to "clear" a warning.
