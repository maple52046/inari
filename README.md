# Inari

Manage S3-compatible object storage.

Inari is a standalone web service for managing S3-compatible object storage. It
is built on the standard S3 API so it is not tied to one provider; MinIO-specific
capabilities are reserved for future plugin extensions.

The server is Rust + Axum and the frontend is a React SPA, compiled together into
a **single executable**: production needs no Node.js, no npm, and no container
runtime.

**Every S3 operation runs on the server.** The browser never holds an access key
and never calls the S3 API with credentials.

> Also available in [繁體中文](README.zh-TW.md).

## Features

- Connection details live in a sealed cookie session only the server can
  decrypt. Secrets never reach the browser's `localStorage`.
- List buckets, prefixes and objects.
- Object browser with prefix navigation, pagination, size and date filters,
  sorting, multi-select and batch delete.
- Object move and rename, across buckets too; sources over 5 GiB switch to a
  multipart copy automatically.
- Cleanup Planner (`/cleanup`) scans for cleanup candidates across buckets,
  ranks them by `lastModified ASC, size DESC, bucket ASC, key ASC`, estimates
  what they would free, and deletes them grouped per bucket once confirmed.
- The bucket page (`/buckets`) estimates bucket and object usage from an S3 list
  scan and shows each bucket's share as a pie chart. By default a scan is always
  started by hand and its result lives in `sessionStorage`, so closing the tab
  discards it.
- An optional **shared capacity index** (`INARI_CAPACITY_INDEX=shared`): the
  server maintains one capacity index for every session using a read-only
  scanner key. Figures are there on arrival, anything past its freshness
  threshold is served immediately and re-measured behind the response, and a
  delete or move re-scans the paths it affected. See
  [shared capacity index](#shared-capacity-index).
- Dark theme by default, with light and system modes.
- Responsive UI with lucide icons.

## Tech stack

### Server

- Rust + [Axum](https://github.com/tokio-rs/axum)
- AWS SDK for Rust (`aws-sdk-s3`)
- `rustls` + `rustls-native-certs` (uses the OS trust store; no OpenSSL
  dependency)
- Session cookie sealed with AES-256-GCM, keyed by HKDF from `SESSION_SECRET`
- `ts-rs` generates the TypeScript wire types from the Rust types, so the two
  sides of the boundary cannot drift

### Web

- React 19 + TypeScript strict mode
- Chakra UI v3 (`@chakra-ui/react`, `@emotion/react`)
- React Router
- `next-themes` for light/dark colour mode
- Vite
- Vitest

## Architecture

The project follows the Clean Architecture dependency rule: dependencies point
inwards only.

```text
server/src/
  domain/          # entities, value objects, port traits; no I/O
  application/     # use cases, depending only on domain and its ports
  adapters/        # s3 / session / http, implementing the ports
  infrastructure/  # config, runtime, embedded assets
  main.rs          # composition root

web/src/
  api/             # the only place that talks to the server (incl. date revival)
  app/             # routes, session context, pages
  components/      # UI components
  domain/          # shared types
  lib/             # pure utilities
  theme/           # Chakra design tokens
```

The frontend reaches the server only through `web/src/api` and never touches an
S3 SDK directly.

## Local development

Requirements:

- Rust 1.96+
- Node.js 24+
- Optional: [`just`](https://github.com/casey/just), `watchexec`

Create a local environment file:

```bash
cp .env.example .env
```

Set at least `SESSION_SECRET` (32 characters or more).

Start it:

```bash
just dev          # Rust API + Vite, with HMR
```

Open <http://localhost:5173>. Vite proxies `/api` to the Rust server, so the
browser sees a single origin and the session cookie behaves exactly as it will
in production.

Without `just`:

```bash
cd server && cargo run          # API, :3000 by default
cd web && npm run dev           # SPA, :5173
```

A debug build reads the frontend from `web/dist` per request, so rebuilding the
frontend does not require restarting the server.

### Internal CA / TLS

The server verifies S3 endpoint certificates against the OS trust store. For an
internal corporate CA, installing it into the system store is enough:

```bash
sudo cp your-ca.pem /usr/local/share/ca-certificates/your-ca.crt
sudo update-ca-certificates
```

To trust a single PEM without touching the system store, point
`INARI_EXTRA_CA_CERTS` at it. That certificate is **added** to the platform
roots rather than replacing them, so public endpoints keep working. A missing or
malformed file fails at start-up rather than surfacing as a cryptic TLS error on
every request.

The `/connect` page also offers to skip TLS verification, but that gives up the
connection's identity guarantee and should be a last resort.

## Commands

```bash
just dev          # API + Vite dev server
just test         # cargo test + vitest
just lint         # cargo fmt/clippy + eslint + tsc
just build        # debug build, both sides
just release      # production build, frontend embedded in the binary
just bindings     # regenerate web/src/api/types.ts
just minio-up     # start a throwaway MinIO on :9100
```

## Production build

```bash
just release
```

The result is a single executable with the frontend embedded:

```bash
cd server && SESSION_SECRET=<at-least-32-characters> ./target/release/inari-server
```

Idle RSS is around 14 MiB and stays flat through an exhaustive bucket scan:
listings are always paginated, and the cleanup scan keeps only the candidates it
will return.

## Docker image

A multi-stage build whose final stage is `scratch`, holding only the binary and
a CA bundle (about 10 MB):

```bash
ts=$(date +%Y%m%d-%H%M%S)
docker build --build-arg VERSION="$ts" -t "ghcr.io/maple52046/inari:$ts" .
```

Run it:

```bash
docker run -d -p 3000:3000 \
  -e SESSION_SECRET=<at-least-32-characters> \
  -e DEFAULT_S3_ENDPOINT=https://s3.example.com \
  "ghcr.io/maple52046/inari:$ts"
```

To trust an internal CA, mount the PEM and point at it. The certificate is
**added** to the public bundle inside the image rather than replacing it, so
public endpoints still work:

```bash
-v /path/to/ca.crt:/etc/inari-ca/ca.crt:ro \
-e INARI_EXTRA_CA_CERTS=/etc/inari-ca/ca.crt
```

The container needs no write access and runs happily with
`readOnlyRootFilesystem: true` and a non-root user.

## Debian / Ubuntu package

Without a container, the `.deb` is the recommended route:

```bash
just deb                                        # builds dist/inari_<version>_<arch>.deb
sudo apt install ./dist/inari_<version>_amd64.deb
```

It installs the binary at `/usr/bin/inari-server`, the configuration at
`/etc/inari/config.env` (a dpkg conffile, so an upgrade will not overwrite your
edits), a systemd unit, and an `/etc/inari/secret.env` generated at install time
and unique to that host.

**The service does not start on install**, because no endpoint is configured
yet. The flow is:

```bash
sudo vi /etc/inari/config.env         # at minimum, set DEFAULT_S3_ENDPOINT
sudo systemctl enable --now inari
systemctl status inari && curl -sf localhost:3000/healthz
```

It binds `127.0.0.1:3000` and speaks plain HTTP, so a TLS-terminating reverse
proxy belongs in front of it. The package deliberately does not configure one;
see [`deploy/nginx.example.conf`](deploy/nginx.example.conf) for an example.

`apt remove` stops the service and keeps `/etc/inari`; `apt purge` also removes
the configuration and the generated secret. Details in
[`debian/README.Debian`](debian/README.Debian).

## Kubernetes

Manifests and notes are in [`deploy/k8s/`](deploy/k8s/). A quick deployment:

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl -n inari create secret generic inari-env --from-env-file=.env
kubectl -n inari create configmap inari-ca --from-file=ca.crt=/path/to/ca.crt
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service-nodeport.yaml
kubectl -n inari rollout status deploy/inari
```

## Environment variables

| Name                               | Required | Description                                                            |
| ---------------------------------- | -------- | ---------------------------------------------------------------------- |
| `SESSION_SECRET`                   | Yes      | Secret sealing the session cookie; at least 32 characters.             |
| `HOST` / `PORT`                    | No       | Bind address; defaults to `0.0.0.0:3000`.                              |
| `INARI_ENV`                        | No       | `development` relaxes the cookie Secure default and allows the Vite origin. |
| `DEFAULT_S3_ENDPOINT`              | No       | Endpoint to connect to.                                                |
| `DEFAULT_S3_REGION`                | No       | Region to sign with; defaults to `us-east-1`.                          |
| `DEFAULT_S3_FORCE_PATH_STYLE`      | No       | Path-style addressing; defaults to `true`.                             |
| `DEFAULT_S3_SKIP_TLS_VERIFICATION` | No       | Skip certificate verification; defaults to `false`.                    |
| `INARI_LOCK_CONNECTION`            | No       | Pin the target above so users supply only credentials; enforced server-side. |
| `BASE_PATH`                        | No       | URL prefix the whole app is mounted under, e.g. `/dashboard`.          |
| `SESSION_COOKIE_SECURE`            | No       | Overrides the cookie's `Secure` attribute.                             |
| `INARI_EXTRA_CA_CERTS`             | No       | Path to an extra CA PEM, added on top of the OS trust store.           |
| `INARI_WORKER_THREADS`             | No       | Tokio worker count; unset runs the single-threaded runtime.            |
| `INARI_REQUEST_BODY_LIMIT`         | No       | Largest accepted request body; defaults to 1 MiB.                      |
| `RUST_LOG`                         | No       | Log filter, e.g. `inari_server=debug`.                                 |
| `INARI_CAPACITY_INDEX`             | No       | `off` (default) or `shared`; see [shared capacity index](#shared-capacity-index). |
| `INARI_SCANNER_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | No | Scanner credentials, required by `shared`. Each accepts a `_FILE` variant. |

The remaining `INARI_CAPACITY_*` ceilings are documented in
[`.env.example`](.env.example).

## URL prefix (base path)

With `BASE_PATH` set, both the SPA and the API move under that prefix, so a
reverse proxy can forward the prefixed path unchanged with no rewriting. A full
example is in [`deploy/nginx.example.conf`](deploy/nginx.example.conf):

```nginx
location /dashboard/ {
    # No trailing "/": that would strip the prefix and 404 everything.
    proxy_pass http://127.0.0.1:3000;

    # Required: mutating requests compare Origin against Host. Forwarding
    # nginx's own upstream host makes every POST fail with 403. Use $http_host
    # rather than $host so the port is preserved.
    proxy_set_header Host $http_host;

    # Required: usage and cleanup scans can run for minutes, and nginx's
    # 60-second default cuts them off as a 504.
    proxy_read_timeout 600s;
}
```

Inari does not read `X-Forwarded-*` and never builds an absolute URL pointing at
itself, so "HTTPS in front, HTTP behind" needs no extra signalling. But **keep
the cookie's `Secure` attribute on**: what decides it is the browser's
connection, not nginx's connection to Inari.

The prefix is applied **at start-up**: the router is mounted under it, the cookie
path is scoped to it, and a matching `<base href>` is injected into `index.html`
so the bundle's relative asset URLs resolve from the mount point. **One build
therefore serves any prefix**, with no recompilation and no rewriting of build
output at start-up.

Health probes deliberately stay at the root, outside the prefix:

```bash
curl http://localhost:3000/healthz   # liveness, does not call S3
curl http://localhost:3000/readyz    # readiness
```

## Two deployment modes

The project originally set out to manage several S3 backends, which is why
`/connect` lets a user type in the connection target. That is convenient for
internal development, or for someone who clones and builds it against their own
storage. On a publicly reachable host it is something else: anyone who can open
the connect screen can direct the server to any address it can reach and read
the outcome — including hosts inside your network.

Hence two modes, separated by a single flag.

### Flexible mode (default)

`DEFAULT_S3_*` are merely the connect screen's starting values, and a user may
change them. Suitable for internal development and self-built deployments.

### Pinned mode (recommended for production)

```bash
DEFAULT_S3_ENDPOINT=https://minio.internal
DEFAULT_S3_REGION=eu-west-2
INARI_LOCK_CONNECTION=true
```

The operator decides the target outright and **users supply only an access key
and secret**. The connect screen collapses to two fields, the endpoint is shown
read-only, and the Advanced settings section disappears.

**The enforcement is server-side.** Endpoint, region, force path style and skip
TLS verification are each rejected with a 400 if they disagree with the
configuration, so bypassing the hidden fields with curl achieves nothing. Hiding
the fields is presentation; the constraint lives in the backend. This matters
most for `skipTlsVerification`: the operator decided certificates are verified,
so a user must not be able to turn that off for their own session.

### Guard rails

`INARI_LOCK_CONNECTION` has to appear together with `DEFAULT_S3_ENDPOINT` or
start-up fails, rather than quietly pinning the deployment to an example
address. A misspelled flag value such as `ture` is also a start-up failure and
is never read as "off" — a safety switch that silently fails open because of a
typo is the worst failure mode available.

## Shared capacity index

Off by default. Once enabled, the server maintains one prefix capacity index
shared across sessions, replacing the "every browser tab scans and caches for
itself" model.

The precondition is structural rather than a matter of policy:
`INARI_CAPACITY_INDEX=shared` **requires** `INARI_LOCK_CONNECTION=true`. A
scanner key authenticates against exactly one backend, so if users can point the
server at an arbitrary endpoint, a shared index has no coherent definition.
Start-up fails when the two disagree.

How it works:

- **The index** is an in-memory prefix tree where each node holds its own
  subtree's total, so a rollup at any level is a single lookup. It is a
  rebuildable cache rather than a source of truth: a restart simply rescans, so
  no writable volume is needed.
- **Refresh is demand-driven.** Reading a location past its freshness threshold
  returns the stored figures at once and queues a re-measurement behind the
  response, which the frontend polls for. That narrows the background sweep's
  job to warming the index and keeping it warm.
- **A delete or move** re-scans the smallest path containing the change rather
  than adjusting totals arithmetically — a batch delete's response does not
  carry sizes, so arithmetic would mean trusting a figure the caller supplied.
- **The cost ceiling** is `INARI_CAPACITY_SCAN_RATE`, in LIST requests per
  second. It is the only limit that still holds when the backend's size is
  unknown. The tree has depth and node ceilings of its own; reaching them costs
  resolution, not accuracy — the location is still measured exactly, it simply
  is not broken down further.

Security trade-offs:

- The scanner key **must be list-only** (`s3:ListBucket` and
  `s3:ListAllMyBuckets`) and **must not** be granted `s3:GetObject`. A
  compromised server then leaks key names and sizes, not object contents.
- This overturns the original property that the server holds no credentials of
  its own. The scanner credentials have their own type, distinct from a
  session's `S3Connection`, so they cannot be misused to serve a user's request.
- The API filters visible buckets **in the handler**, using the caller's own
  credentials, not in a React component — the browser can call the API directly,
  so a component hiding rows is no boundary at all.
- Bucket-level filtering cannot see prefix-scoped IAM policies. Where a
  deployment uses them, enable `INARI_CAPACITY_VERIFY_PREFIX_ACCESS` and the
  prefix is probed with the caller's credentials before it is answered.

### Scanner key policy

The scanner calls exactly two S3 actions: `ListBuckets`, to decide which buckets
to walk, and `ListObjectsV2`, to measure them. So it needs only those two, and a
wildcard covers every bucket, meaning a new bucket never requires revisiting the
policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ScanEveryBucket",
      "Effect": "Allow",
      "Action": ["s3:ListAllMyBuckets", "s3:ListBucket"],
      "Resource": "arn:aws:s3:::*"
    },
    {
      "Sid": "NeverReadContent",
      "Effect": "Deny",
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::*/*"
    }
  ]
}
```

The second statement is deliberate. Simply not granting `s3:GetObject` would be
enough, but an explicit Deny makes "the scanner can never read object contents"
a property nobody can overturn later by adding this key to another group or
policy — in IAM, Deny beats any Allow.

One easy trap: `s3:ListBucket`'s resource is the **bucket** ARN
(`arn:aws:s3:::*`), not the object ARN (`arn:aws:s3:::*/*`). Writing the latter
raises no error; it simply makes every scan come back `AccessDenied`.

Every setting is documented in [`.env.example`](.env.example).

## Security notes

- S3 secrets live only in the sealed cookie session (`HttpOnly`,
  `SameSite=Lax`, encrypted with a key derived from `SESSION_SECRET`). They are
  written to no database and to no browser-readable storage.
- Every S3 operation runs on the server; the browser only receives results
  through the JSON API.
- Mutating requests check `Origin`, which together with `SameSite=Lax` blocks
  cross-site submission.
- `.env` is git-ignored. Do not commit real secrets.
- Error responses carry only a stable code and a safe message; SDK detail goes
  to the logs alone.
- Delete actions always require confirmation and typing `DELETE`.
- The Cleanup Planner produces candidates and an estimate of what they would
  free; it never deletes on its own.
- Usage and Cleanup are both based on standard S3 list scans, so they may
  exclude provider-specific overhead, object versions, delete markers and
  incomplete multipart uploads.

## License

MIT. See [`LICENSE`](LICENSE).
