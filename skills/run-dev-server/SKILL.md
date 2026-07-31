---
name: run-dev-server
description: >-
  Start the Inari development servers (Rust API and Vite SPA) in the background
  and confirm they became ready, reusing already-running instances instead of
  starting duplicates. Use when the user runs /run-dev-server or asks to start,
  restart, or check the dev server for local development.
disable-model-invocation: true
---

# run-dev-server

Start the two development processes and report their URLs.

The app is a Rust API serving an embedded React SPA. In development the two run
separately: Vite serves the frontend with hot module replacement and proxies
`/api` to the Rust server, so the browser stays on one origin and the session
cookie behaves exactly as it will in production.

## Invocation

```
/run-dev-server [-p <num> | --port <num>] [-b <path> | --base-path <path>] [--api-only] [-h | --help]
```

| Option                            | Required | Description                                                             |
| --------------------------------- | -------- | ----------------------------------------------------------------------- |
| `-p <num>`, `--port <num>`        | No       | Port for the Rust API. Default: `3000`.                                 |
| `-b <path>`, `--base-path <path>` | No       | URL prefix to mount the app under, e.g. `/dashboard`. Sets `BASE_PATH`. |
| `--api-only`                      | No       | Start only the Rust API, serving the last built bundle.                 |
| `-h`, `--help`                    | No       | Print the help message below and stop. Do not start anything.           |

### Help message

When `-h` / `--help` is given, print exactly this and take no further action:

```
/run-dev-server [-p <num> | --port <num>] [-b <path> | --base-path <path>] [--api-only] [-h | --help]

  -p <num>, --port <num>        Port for the Rust API (default: 3000)
  -b <path>, --base-path <path> URL prefix to mount the app under (default: none)
  --api-only                    Start only the API, serving the last built bundle
  -h, --help                    Show this help message

Starts the Inari development servers in the background and reports their URLs.
```

## Workflow

```
- [ ] 1. --help: print the help message and stop
- [ ] 2. Reuse already-running servers instead of starting duplicates
- [ ] 3. Confirm the target ports are free
- [ ] 4. Start in the background, outside the sandbox
- [ ] 5. Wait for the ready lines, then report the URLs
```

### 1. `--help`

Print the help message verbatim and stop.

### 2. Reuse running servers

Check existing terminal sessions for `cargo run`, `watchexec`, or `vite` before
starting another. **A session's log can be stale**: a finished run keeps its
output around with a footer recording its exit. Treat a server as running only
when the process is alive and the port is bound (step 3).

A running API picks up frontend rebuilds on its own in debug builds, which read
the bundle from `web/dist` at request time rather than embedding it. Only a
`BASE_PATH` change requires a restart, because the prefix is resolved once at
start-up.

### 3. Confirm the ports are free

```bash
ss -ltnp | grep -E ':(<port>|5173)\b' || echo "(free)"
pgrep -af "inari-server|vite" || echo "(none)"
```

Port bound by something else → report it and ask before touching it. Do not kill
processes this workflow did not start without asking.

### 4. Start them

```bash
just dev                                  # API + Vite together
just dev-api                              # API only, rebuilding on change
just run-api                              # API only, no file watcher
BASE_PATH=<path> PORT=<num> just run-api  # mounted under a URL prefix
```

Two requirements:

- **Background it immediately** (`block_until_ms: 0`); neither process exits.
- **Run outside the sandbox** (`required_permissions: ["all"]`). The app reaches
  an internal S3 endpoint, which the sandbox's network allowlist blocks, so a
  sandboxed server starts but fails every storage request.

`just dev` needs `watchexec`; without it use `just run-api` and `just dev-web`
in separate terminals.

### 5. Confirm readiness and report

Wait for `inari server listening` from the API and `ready in` from Vite.

Report the Vite URL as the one to open — it is the origin with hot reloading.
The API's own URL serves the last built bundle, which is what to use when
checking production behaviour.

When a base path is in effect, append it to the API URL; the bare origin 404s,
which otherwise reads as a broken server.

## Base path (URL prefix)

`BASE_PATH` is resolved at start-up and applied three ways: the router is
mounted under it, the cookie path is scoped to it, and a matching `<base href>`
is injected into `index.html` so the bundle's relative asset URLs resolve from
the mount point. One build therefore serves any prefix.

Verify with the prefix, not the origin:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:<port><base-path>/
```

Health probes deliberately stay at the root, outside the prefix:

```bash
curl -s http://localhost:<port>/healthz
```

## Operational notes

- Configuration comes from `.env` at the repository root, which the server loads
  when present. Environment variables already set always win, so an inline
  `PORT=` or `BASE_PATH=` overrides the file.
- A missing or too-short `SESSION_SECRET` fails at **start-up**, with the reason
  named and the value never echoed. A server that is listening has usable
  configuration.
- The API logs one line per request through `tower-http`. Raise detail with
  `RUST_LOG=inari_server=debug,tower_http=debug`.
- `just minio-up` starts a throwaway MinIO on `:9100` to connect against.
- Report the log's own lines when diagnosing; do not restart to "clear" a
  warning.
