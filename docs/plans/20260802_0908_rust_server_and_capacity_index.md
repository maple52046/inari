# Rust Server and the Shared Capacity Index

## 1. Purpose

Record the two decisions that reshaped Inari's server: replacing the Node.js /
Next.js server with a single Rust binary, and then giving that binary a
server-side shared capacity index for storage usage figures.

They are consolidated together because the second only became possible, and only
makes sense, because of the first. The rewrite deliberately left the adapter and
application boundaries clean "so a cache decorator can be added later without
touching handlers"; the capacity index is that later, and it slotted in behind a
port exactly as the rewrite anticipated.

## 2. Source Scope

| Manuscript                        | Date       | Topic                                    |
| --------------------------------- | ---------- | ---------------------------------------- |
| `20260731-rust-axum-rewrite.md`   | 2026-07-31 | Next.js server replaced by Rust + Axum   |
| `20260801-server-capacity-index.md` | 2026-08-01 | Server-side shared capacity index        |

Both are superseded by this document. Where they disagree, the later manuscript
wins (section 4, "Superseded decisions").

## 3. Consolidated Background

Inari is an S3-compatible object storage dashboard. Its one load-bearing
property, preserved through both changes, is:

> S3 operations run on the server, not in the browser. The server completes the
> operation and the frontend displays the result.

Credentials therefore live only in an encrypted server-side session cookie; the
browser never holds an access key and never speaks to the S3 API with one.

**The rewrite** was driven by operations rather than by rendering: no Node.js in
production, one binary, and a resident set small enough that the dashboard does
not compete with MinIO on the same VM. Server-side HTML rendering was not the
requirement and was dropped, because Chakra UI v3 relies on Emotion, a runtime
CSS-in-JS engine: style props like `<Box display={{ base: "none", md: "block" }}>`
have no build-time output, so "Rust renders the HTML" and "keep the React +
Chakra frontend" were mutually exclusive. The frontend was the part worth
keeping.

**The capacity index** was driven by the cost profile of usage figures. Every
usage number came from an exhaustive list scan whose result lived only in one
browser tab's `sessionStorage`. Every user paid for every scan, every reload
threw the answer away, and folder sizes in the object browser required a live
walk each time.

## 4. Confirmed Decisions

### Carried from the rewrite

- **Keep the React + Chakra frontend.** Components, theme, dialogs, tables, and
  charts carried over as-is. Server-side HTML rendering dropped. Askama, HTMX,
  and any Rust HTML rendering are explicitly out; the only HTML Rust emits is
  `index.html`, and only to inject the base path.
- **Rust serves a JSON API plus the static bundle.** One binary, one port.
- **Credentials stay bring-your-own.** `/connect`, the encrypted session cookie,
  and `/settings` disconnect are kept.
- **Full feature parity**: browse, download, delete, move/rename including
  multipart copy, cleanup planner, usage scanning with charts, folder sizes,
  `BASE_PATH`, light/dark.
- **Download modes unchanged.** `direct` stays a browser-to-S3 URL, `presigned`
  stays server-signed. No streaming proxy; object bytes never touch the server.
- **Both artifacts**: static binary plus a distroless image, plus a systemd unit.
- **Layout**: `server/` for the Rust crate, `web/` for the Vite frontend.

### Added by the capacity index

- **An in-memory prefix aggregate tree, not SQLite.** Each node holds its own
  subtree's total, so a rollup for any location is one lookup and a change
  propagates in a walk proportional to depth. Restart-rescan was accepted as the
  cost, which removes SQLite's only decisive advantage while avoiding a writable
  volume the deployment does not otherwise need.
- **`shared` mode structurally requires `INARI_LOCK_CONNECTION=true`.** A scanner
  key authenticates against exactly one backend, so an index it builds is only
  meaningful when every session is pinned to that backend. Start-up fails when
  the two disagree.
- **The feature is off by default**, so the open-source default deployment
  behaves exactly as it did before.
- **One coordinator, four triggers**: a stale read, a mutation, the manual
  button, and the sweeper. All share deduplication, priority, and the rate
  ceiling.
- **Refresh is demand-driven first.** Reading a stale scope serves it at once and
  refreshes behind the response. The sweeper warms the index rather than
  guaranteeing freshness.
- **Mutations trigger a targeted rescan, not delta arithmetic.** A batch delete
  reports which keys went, not how large they were, so subtracting would mean
  trusting a size the caller supplied.
- **The mutation hook lives in the use cases**, not the handlers, so the compiler
  enforces that every mutation path maintains the index.
- **Updates reach the client by polling, not server-sent events**, with the
  response shaped so SSE could replace the transport later.
- **`off` mode keeps the browser's `sessionStorage` cache**, so the default
  deployment does not regress to rescanning on every reload.

### Superseded decisions

The rewrite manuscript stated that "the browser keeps its `sessionStorage` cache.
No server-side cache is introduced", and listed a persistent folder-size cache
and background scanners as out of scope. The capacity index manuscript
introduces exactly those, and is the later and more explicit decision, so it
wins.

This is a clean supersession rather than a reversal: the rewrite anticipated it
in the same breath, keeping the adapter and application boundaries clean
specifically so a cache could be added later without touching handlers. It was,
and nothing in the handler layer had to change to accommodate it.

## 5. Architecture and Design Principles

Both plans follow [`docs/standards/architecture.md`](../standards/architecture.md):
dependencies point inward, and cross-layer work goes through ports implemented in
outer layers and wired at the composition root.

```text
Browser        React + Chakra UI SPA
                     │  fetch /api/*  (cookie-authenticated)
Server         Rust + Axum
               ├── /api/*   JSON API, session, all S3 operations
               └── /*       embedded SPA assets + index.html
                     │  aws-sdk-s3
Storage        MinIO / S3
```

```text
server/src/
├── main.rs                     # composition root; the only place modes are chosen
├── domain/                     # no I/O, no runtime, no SDK
│   ├── capacity.rs             # CapacityScope, CapacityTree, measurements, limits
│   ├── cleanup.rs, models.rs, object_path.rs, errors.rs
│   └── ports.rs                # ObjectStorage, CapacityIndex, Clock, ScanPacer
├── application/                # one module per use case; depends only on ports
├── adapters/
│   ├── s3/                     # aws-sdk-s3 implementation of ObjectStorage
│   ├── capacity/               # in-memory tree, scanner, sweeper, pacer, queue
│   ├── session/                # encrypted-cookie SessionStore
│   └── http/                   # axum router, handlers, DTOs, error mapping
└── infrastructure/             # config, clock, embedded assets, runtime
```

Load-bearing design choices:

- **Two shared HTTP clients, per-request S3 clients.** Credentials are per
  session and `skipTlsVerification` is per connection, so one shared SDK client
  is impossible. Two `HttpClient`s are built at start-up (one verifying TLS
  against the system trust store, one skipping) and a per-request
  `aws_sdk_s3::Client` is constructed on top of the matching one. Pooling lives
  in the shared client, so construction is nearly free and no key material is
  retained in a server-side map.
- **The capacity tree stores prefixes only.** Objects never become nodes, which
  is what keeps the tree's size proportional to the number of distinct folders
  rather than to the number of stored objects.
- **The scan queue is pure state.** Deduplication, ancestor coverage, and
  priority live in the application layer with no lock, timer, or runtime; the
  adapter that drives it owns those.
- **`CapacityIndex` is a synchronous port.** That is what keeps an async runtime
  out of the use cases that maintain the index, and what lets a delete return
  without waiting on the re-measurement it triggers.

## 6. Functional Scope

Delivered by the rewrite: bucket list, object browser with prefix navigation,
pagination, filter, sort, multi-select, detail drawer, delete, move/rename across
buckets including the over-5-GiB multipart copy path, both download modes, the
cleanup planner, usage scanning with charts, folder sizes, `BASE_PATH`, and
light/dark theming.

Added by the capacity index, in `shared` mode only:

- Figures present on arrival, shared across sessions, surviving a reload.
- Arbitrary-depth prefix rollup, so folder sizes in the object browser become a
  lookup instead of a live walk.
- Automatic refresh of anything read while stale, served stale-first.
- Targeted re-measurement after a delete, a move, or a cleanup deletion.
- A retained manual scan, which now queues work rather than performing it inline.
- A background sweeper that warms a cold index and keeps visited scopes warm.

## 7. Constraints and Rules

### Invariants

- **Totals are exact at every level the tree represents. Exceeding a ceiling
  costs resolution, never accuracy.** A node that stops subdividing still holds
  the correct total for everything beneath it.
- **`scannedAt` means "the last time this subtree was walked in full".** A
  descendant rescan corrects ancestor totals but does not advance ancestor
  timestamps; doing so would make the whole tree look freshly measured and
  suppress the refreshes staleness exists to trigger.
- **"Not measured" must stay distinguishable from "zero"** in the API and the UI.
  A location can carry a non-zero total while unmeasured, because a scan below it
  propagates upwards; the figure is then a lower bound.
- **Filtering happens in the HTTP handler, never in a React component.** A
  component that hides rows is not a boundary: the browser can call the API
  directly.

### Security

- The scanner key **must be list-only**: `s3:ListBucket` and
  `s3:ListAllMyBuckets`, and **not** `s3:GetObject`. A compromise then leaks key
  names and sizes rather than object contents. An explicit `Deny` on
  `s3:GetObject` makes this structural rather than merely ungranted.
- The scanner credentials get their own type, not `S3Connection`, so they cannot
  be handed to a request-scoped client by mistake. They accept a `_FILE` variant
  so a Kubernetes Secret can be mounted rather than inlined.
- Bucket-level filtering cannot see prefix-scoped IAM policies. Deployments using
  them enable `INARI_CAPACITY_VERIFY_PREFIX_ACCESS`, which probes the prefix with
  the caller's own credentials before answering.
- `SameSite=Lax` plus a JSON content type blocks cross-site form posts; an
  `Origin` check on mutating routes is defence in depth. Request IDs, security
  headers, a baseline CSP, `no-store` on session responses, a request body limit,
  S3 operation timeouts, and a graceful shutdown timeout are all in place.
- The session cookie is `inari_session`, sealed with AES-256-GCM using a key
  derived from `SESSION_SECRET` via HKDF-SHA256. `iron-session`'s format is not
  reproduced.

### Bounded work

- All scanning shares one ceiling expressed in **LIST requests per second**. A
  limit in objects or minutes would be wrong at some scale; requests per second
  bounds the load itself regardless of how large the backend turns out to be.
- The tree is capped by depth and by node count. Exceeding the node budget lowers
  the effective depth and collapses the deepest level, and the depth is not
  raised again, so the tree cannot oscillate around the ceiling.
- The scan queue has a maximum pending size; past it the newest request is
  dropped, since the next read of that scope will ask again.
- `scan_prefix_usage` carries a fan-out cap with a truncation flag.
  `scan_cleanup` uses a `BinaryHeap` of size `maxResults` rather than collecting
  every match, giving identical results in O(k) memory.
- Start-up never blocks on a scan.

### Operational

- Every configuration inconsistency is a hard start-up failure, never a warning:
  an index that silently fails to start would leave the dashboard showing figures
  that never refresh.
- A whole-bucket walk is never treated as a targeted refresh, whoever asked for
  it, so it waits behind anything narrower.

## 8. Data Model and Format Notes

- **`CapacityScope`** identifies a location: a bucket, optionally narrowed to a
  prefix. The prefix is empty for a whole bucket and otherwise always carries a
  trailing delimiter, so `photos/2024` and `photos/2024/` resolve to one node.
- **The tree** is nodes of `{ total_size, object_count, scanned_at, subdivided,
  children }`, with buckets one level below an unnamed root. Memory follows the
  number of distinct prefixes, typically one to ten percent of the object count.
- **A measurement** is built incrementally during a walk, so a scan holds the
  prefix aggregates rather than the keys it walked.
- **Timestamps travel as RFC 3339 strings** because JSON has no date type. The
  API client revives them into `Date` before any component sees them. This was
  called out in the rewrite as a silent, pervasive failure if missed, and is
  covered by a dedicated test.
- **TypeScript wire types are generated from the Rust domain** with `ts-rs` into
  `web/src/api/types.ts`, so the two sides of the boundary cannot drift.
- **Four states must remain distinguishable** in the capacity response: never
  measured, measured and current, measured but stale, and measured but not broken
  down further.

## 9. CLI / API / Config Notes

### API

Session and health: `POST /api/session`, `POST /api/session/test`,
`GET /api/session`, `DELETE /api/session`, `GET /healthz`, `GET /readyz`.
`GET /api/session` also reports `capacityIndex`, so a deployment with the index
off pays no extra request to discover that the per-tab cache is its only source
of figures.

Storage: `GET /api/buckets`, `GET /api/buckets/{bucket}/objects`,
`POST /api/buckets/{bucket}/objects/delete`,
`POST /api/buckets/{bucket}/objects/presign`, `POST /api/objects/move` (not
nested, because a move crosses buckets), `POST /api/buckets/{bucket}/usage`,
`POST /api/buckets/{bucket}/prefix-usage`, `POST /api/cleanup/scan`,
`POST /api/cleanup/delete`.

Capacity: `GET /api/capacity?bucket=&prefix=` returns totals, children, and the
freshness judgement, and queues a refresh for anything stale as a side effect.
`POST /api/capacity/scan` queues a refresh and returns at once.

Errors use one JSON shape carrying a stable code mapped from `StorageErrorKind`.
Any endpoint answering `401` sends the SPA to `/connect`.

### Configuration

Existing: `SESSION_SECRET`, `INARI_ENV`, `PORT`, `HOST`, `BASE_PATH`,
`DEFAULT_S3_ENDPOINT` and its region / path-style / TLS companions,
`INARI_LOCK_CONNECTION`, `SESSION_COOKIE_SECURE`, `INARI_DEV_ORIGIN`,
`INARI_WORKER_THREADS`, `INARI_REQUEST_BODY_LIMIT`, `INARI_EXTRA_CA_CERTS`.

Capacity index, all defaulted to be safe on a backend far larger than expected:

| Variable                                | Default | Purpose                                     |
| --------------------------------------- | ------- | ------------------------------------------- |
| `INARI_CAPACITY_INDEX`                  | `off`   | `off` or `shared`                           |
| `INARI_SCANNER_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | —       | Scanner credentials; `_FILE` variants accepted |
| `INARI_CAPACITY_INDEX_TTL`              | 5m      | Freshness threshold                         |
| `INARI_CAPACITY_AUTOSCAN`               | true    | Whether the sweeper runs                    |
| `INARI_CAPACITY_AUTOSCAN_INTERVAL`      | 15m     | Gap measured from the **end** of a pass     |
| `INARI_CAPACITY_SCAN_RATE`              | 10      | LIST requests per second, all scanning      |
| `INARI_CAPACITY_MAX_DEPTH`              | 6       | Prefix depth ceiling                        |
| `INARI_CAPACITY_MAX_NODES`              | 100000  | Node ceiling, roughly 20 MB                 |
| `INARI_CAPACITY_BUCKETS` / `..._EXCLUDE_BUCKETS` | unset   | Coverage allowlist and denylist    |
| `INARI_CAPACITY_VERIFY_PREFIX_ACCESS`   | false   | Probe the prefix with the caller's key      |

Start-up fails when: the mode is `shared` without `INARI_LOCK_CONNECTION=true`;
`shared` without scanner credentials; scanner credentials present while the mode
is `off`; a bucket named in both the allowlist and the denylist; a duration of
zero; a depth beyond the recursion-safe ceiling.

### Development

`just dev` starts Vite on `:5173` and the Rust API together, with Vite proxying
`/api` so the browser sees one origin and the session cookie behaves exactly as
in production. `just run-api`, `just dev-web`, `just test`, `just lint`,
`just build`, and `just release` round out the set. `watchexec` watches `.rs` and
`Cargo.toml` only, so a `.env` change requires a restart. Development never
embeds assets; only `just release` runs the Vite production build and embeds it.

## 10. Implementation Plan

### The rewrite, in eight phases

1. Rust skeleton: Cargo project, Axum router, `AppState`, config loader, tracing,
   unified JSON errors, graceful shutdown, health endpoints, base path.
2. Storage adapter and session: `ObjectStorage` port, the `aws-sdk-s3` adapter
   with two shared HTTP clients, encrypted-cookie session, `ts-rs` wired in.
3. Remaining API, including bounded `scan_cleanup` and the over-5-GiB copy path.
4. SPA shell: Vite project, components moved untouched, `@font-face` replacing
   `next/font`, `emotion_cache_provider` deleted, router, route guard, API client
   with date revival.
5. Wire the features: convert the ten server-action call sites and verify each
   feature end to end.
6. Parity and cleanup: page-by-page comparison including narrow viewport and the
   loading, empty, and error states that used to come from server rendering.
7. Release and validation: LTO release profile, distroless image, systemd unit,
   first CI pipeline, resource tests on a production-spec VM.
8. Cutover: parallel run, switch the image and proxy upstream, delete the Next.js
   tree. Rollback is a proxy or image revert.

The frontend migration was scoped as small on purpose: 21 Next.js import sites
across 5,264 lines, kept cheap by having the new API client export functions with
the same names and result shapes as the server actions they replaced, so ten of
those files changed by import path only. `src/app/` was the part genuinely
rewritten.

### The capacity index, in five phases

1. **Index core**: domain types, the `CapacityIndex` and `Clock` ports, the tree
   with its ceilings, the no-op implementation, config and start-up validation,
   the scanner client, the read endpoint with filtering, and the frontend seam.
2. **Demand-driven refresh**: the coordinator with single-flight, two priority
   tiers, and the rate limiter; TTL and stale-while-revalidate; client polling.
3. **Mutation hook**: `mark_dirty` on the three mutation use cases, the pure
   result-to-scopes functions, coalescing, and the root guard.
4. **Sweeper**: the paced background pass, coverage lists, per-pass logging.
5. **Prefix access probe**, behind its flag and off by default.

Ordered so the read path is proven before anything starts scanning on its own,
and so each phase is independently shippable. All five are implemented, unit
tested, and verified against a live S3-compatible backend: cold-index fill,
arbitrary-depth rollup, prefix normalisation, TTL-driven refresh with
autoscan off, rate limiting observable at one request per second, and the
authorisation boundaries.

## 11. Non-goals

- Historical capacity trends over time. The index holds a current snapshot only;
  this is the change that would justify SQLite and a persistent volume.
- Persistence across restart.
- More than one replica. The index is per-process.
- A per-session server-side index using the user's own credentials, for unlocked
  deployments.
- Accounting for object versions, delete markers, incomplete multipart uploads,
  or provider overhead. Usage figures are best-effort estimates from list scans.
- Detecting writes made by other tools against the same backend; those are
  invisible until the next sweep, and the TTL is the convergence mechanism.
- From the rewrite and still standing: Redis, Memcached, global search, bucket
  indexing, a new permission system, new object operations, Prometheus metrics,
  and any redesign of the UI.

## 12. Open Questions

- **Whether the sweeper earns its keep.** Demand-driven refresh may cover
  everything in practice, leaving the sweeper useful only for warming a cold
  index after a restart. If the logs show it mostly rescanning scopes nobody
  reads, its default should change from on to warm-up-only.
- **Whether SSE becomes worth it.** Only if users ask to watch progress on long
  scans. The response shape already anticipates the switch.
- **Multi-user visibility filtering is unverified in practice.** Testing proved
  that a session cannot read a bucket it cannot list, but not that two keys with
  different permissions see correspondingly different responses. That needs a
  second key.
- **Mutation-triggered rescan is unverified against live data**, because
  verifying it means deleting or moving a real object.

## 13. Future Work

- A SQLite-backed `CapacityIndex`, if capacity history or a backend too large to
  rescan on restart ever becomes a requirement. Because the index sits behind a
  port, that is a second adapter and touches nothing inward.
- Raising `INARI_CAPACITY_MAX_NODES` where the per-pass log reports the depth
  having been reduced, which is the signal that resolution is being lost.
- Retiring the `off`-mode `sessionStorage` path if the shared index ever becomes
  the only supported mode.
- The musl static build, with the GNU target as the documented fallback should
  the SDK or TLS stack object.
