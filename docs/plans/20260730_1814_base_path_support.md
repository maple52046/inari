# Base Path (URL Prefix) Support

## Purpose

Record the long-term plan for serving the whole Inari application under a URL
prefix such as `/dashboard`, so a reverse proxy can forward the prefixed path
straight through without rewriting it, and so a single container image can be
mounted at any prefix.

## Source Scope

Consolidated from the plan manuscripts under `docs/plans/manuscripts/`:

| Manuscript              | Topic                          |
| ----------------------- | ------------------------------ |
| `20260730-base-path.md` | Base path (URL prefix) support |

One manuscript processed. No conflicting decisions were found between sources.

## Consolidated Background

Inari is a Next.js App Router application built with `output: "standalone"` and
deployed as a distroless container image. Reaching it through a reverse proxy at
a sub-path required every page, Server Action and static asset to live under
that prefix.

Next.js provides `basePath` for exactly this, but it is a **build-time** value:
it is inlined into the client bundles and, with standalone output, serialized
into the generated `server.js`. This was confirmed directly in the repository —
`.next/standalone/server.js` embeds the whole resolved config as a literal,
including `"basePath":""`. Consequently a prefix cannot simply be read from the
environment when the server starts, which is what a single reusable image would
need.

The application's shape made the rest of the work small: it has no `/api/*`
route handlers and no client-side `fetch`; every backend call is a Server
Action. Next.js already applies `basePath` to `<Link>`, `redirect()`, Server
Action endpoints and `/_next/*` asset URLs, and `usePathname()` returns the path
with the prefix stripped.

## Confirmed Decisions

1. **Hybrid injection.** `next.config.ts` reads `BASE_PATH` at build time. The
   Docker build instead bakes a placeholder, and the container entrypoint
   rewrites that placeholder to the real prefix at start-up. One image therefore
   serves any prefix, while a local build can still hard-wire one.
2. **An explicit build-time `BASE_PATH` wins over the deferral flag**, producing
   an image locked to a single prefix. This is the supported path for
   deployments that need a read-only root filesystem.
3. **Cookies are scoped to the prefix.** Both the sealed session cookie and the
   download-preference cookie use `path=<base path>`, so two deployments on the
   same host under different prefixes cannot clobber each other's session.
4. **The rewrite tolerates flight chunk boundaries.** Prerendered HTML splits
   the payload across `self.__next_f.push` calls at arbitrary byte offsets, so a
   plain substring replace is not sufficient.

## Architecture and Design Principles

- **Pure logic inward, environment glue outward.** The canonical normalization
  lives in `src/lib/base_path.ts` as pure, unit-tested functions
  (`BASE_PATH_PLACEHOLDER`, `normalizeBasePath`) and is imported by
  `next.config.ts`.
- **A dedicated env-reading module.** `src/infrastructure/base_path.ts` exposes
  `getBasePath` and `getCookiePath` over the inlined `NEXT_PUBLIC_BASE_PATH`. It
  is deliberately separate from `infrastructure/config.ts` so that client
  components importing it do not pull secret-reading code into the browser
  bundle.
- **The entrypoint cannot share TypeScript.** `docker/base_path.mjs` is plain
  ESM because it runs in a distroless image before any TypeScript build output
  is usable. It duplicates `normalizeBasePath` and adds `applyBasePath`, which
  walks the build output and replaces the placeholder. A `.mjs` test
  cross-checks the duplicate against the TypeScript implementation so the two
  cannot drift.
- **Substitution happens before the server module loads.** `docker/start.mjs`
  runs `applyBasePath` before importing `server.js`, for the same reason it
  already sets `HOSTNAME` there: the config is read at module evaluation.

## Functional Scope

In scope:

- Serving pages, Server Actions and `/_next/*` assets under a configurable
  prefix.
- A single container image usable at any prefix, chosen at container start.
- An alternative build-time lock for read-only filesystem deployments.
- Prefix-scoped session and download-preference cookies.
- Documentation across `.env.example`, `README.md` and `deploy/k8s/`.

Out of scope: see [Non-goals](#non-goals).

## Constraints and Rules

- `basePath` is inlined at build time and cannot be changed by restarting alone
  without the placeholder substitution.
- The substitution rewrites `/app/.next` in place, so the container filesystem
  **must be writable**. `readOnlyRootFilesystem: true` is incompatible with a
  runtime `BASE_PATH`; use a build-time `BASE_PATH` instead.
- Kubernetes readiness and liveness probe paths **must carry the prefix**, or
  every probe 404s and the pod restart-loops.
- The chunk-boundary handling depends on the exact script tag Next.js emits. A
  CSP nonce, or a change to that markup in a future release, would silently
  reintroduce a split placeholder in prerendered pages.
- Files are rewritten via latin1 decoding so every byte round-trips; a file
  without the placeholder is never written.

## Data Model and Format Notes

- **Normalized prefix.** A leading slash is added, trailing slashes are
  stripped, and unset / empty / `/` all normalize to `""`, meaning "mounted at
  the root". Values containing whitespace, `?` or `#` are rejected outright
  rather than allowed to break every route silently.
- **Placeholder.** `/__inari_base_path__`, chosen to be a valid `basePath` and
  not to collide with any real deployment prefix.
- **Rewrite targets.** `server.js` plus everything under `.next` in the runtime
  image — roughly 5 MB, so the start-up cost is negligible.

## CLI / API / Config Notes

| Variable                | Set by     | Purpose                                                                                                                                                             |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASE_PATH`             | Operator   | The prefix, e.g. `/dashboard`. Empty or unset means the root.                                                                                                       |
| `DEFER_BASE_PATH`       | Dockerfile | Build-only. When true and no build-time `BASE_PATH` is given, bakes the placeholder.                                                                                |
| `NEXT_PUBLIC_BASE_PATH` | Derived    | Published via the `env` key in `next.config.ts` so the prefix is inlined into both bundles, where the entrypoint's rewrite can reach it. Never set by the operator. |

Local development and non-Docker builds must pass `BASE_PATH` to **both**
`npm run build` and `npm run start`, and the two must agree. Setting it in
`.env.local` also works: Next.js reads the dotenv files before loading
`next.config.ts`.

The `/run-dev-server` skill exposes this as `-b` / `--base-path`.

## Implementation Plan

All items below are complete.

1. `src/lib/base_path.ts` plus unit tests.
2. `src/infrastructure/base_path.ts`.
3. `next.config.ts` — resolve `basePath` and publish `NEXT_PUBLIC_BASE_PATH`.
4. Cookie paths in `src/adapters/session/iron_session_store.ts` and
   `src/components/s3/object_browser.tsx`.
5. `docker/base_path.mjs`, `docker/start.mjs`, `docker/base_path.test.mjs`, and
   a widened Vitest include pattern.
6. `Dockerfile` — `ARG BASE_PATH`, `ENV DEFER_BASE_PATH`, copy the new module.
7. Docs: `.env.example`, `README.md`, `deploy/k8s/README.md`, and the k8s probe
   paths.

### Verification performed

- Unit tests covering normalization (cross-checked against the `.mjs`
  duplicate), the rewrite on a temporary tree, the split-across-chunks case,
  non-UTF-8 bytes, and idempotency.
- One placeholder image run twice: with `BASE_PATH=/dashboard` it serves
  `/dashboard/connect` with 200, redirects `/dashboard` and `/dashboard/buckets`
  to `/dashboard/connect`, and 404s `/connect`; with no `BASE_PATH` the same
  image serves `/connect` with 200 and 404s `/dashboard/connect`.
- Every `/_next` reference in the prefixed HTML carries the prefix; CSS and font
  URLs return 200; no placeholder remnant survives in either mode.
- Server Actions: `POST /dashboard/connect` with a `Next-Action` header returns
  200 with a flight payload, while the same POST to `/connect` returns 404.
- `usePathname()` returns `/connect` under the `/dashboard` mount, confirming
  the prefix is stripped and the nav active check needs no change.
- Session and download cookie `path` resolve to `/dashboard` in the built
  bundle.

## Non-goals

- Changing the prefix without restarting the process.
- Serving the same process at several prefixes at once.

## Open Questions

None recorded. The sources contain no unresolved decisions.

## Future Work

- Watch for a Next.js release that changes how the flight payload is emitted
  into prerendered HTML (for example adding a CSP nonce to those script tags),
  which would break the chunk-boundary handling in `docker/base_path.mjs`.
- Consider a `--base-path` option on the `build-image` skill for producing an
  image with the prefix locked at build time, which is what a read-only root
  filesystem requires.
