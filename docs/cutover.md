# Cutover: Next.js to the Rust server

The Rust server and the React SPA are complete and both stacks are still in the
tree, so they can run side by side. This is the sequence for switching over, and
for going back if the switch goes badly.

## State

| Piece | Status |
| --- | --- |
| Rust API, all endpoints | done, covered by unit and MinIO integration tests |
| React SPA on Vite | done, builds and embeds into the binary |
| Container image | done, `scratch`, about 10 MB |
| systemd unit | done, [`deploy/inari.service`](../deploy/inari.service) |
| Kubernetes manifest | updated for the new probes, limits, and CA mount |
| CI | added, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| UI parity review | **outstanding** — needs a person, see below |
| Removing the Next.js app | **outstanding** — gated on the parity review |

## 1. Parity review

This is the only step that needs a human, because it compares two rendered UIs.
Run both and work through
[`docs/ui-parity-checklist.md`](ui-parity-checklist.md).

```bash
npm run dev            # Next.js, :3000
just run-api           # Rust, :3000 by default -- set PORT to avoid the clash
PORT=3120 just run-api
```

Connect both to the same backend so the two are showing the same data.

The checklist ends with a list of intentional differences; anything else is a
bug worth filing before the switch.

## 2. Parallel run

Deploy the Rust image beside the existing one and point a second ingress or
NodePort at it. Watch for a few days of real use:

```bash
kubectl -n inari logs -f deploy/inari
kubectl -n inari top pod
```

Expect resident memory near 20 MiB and flat under load. A steadily climbing
figure means something accumulates per request and should be investigated
before the switch, not after.

## 3. Switch

```bash
ts=$(date +%Y%m%d-%H%M%S)
docker build --build-arg VERSION="$ts" -t "ghcr.io/maple52046/inari:$ts" .
docker push "ghcr.io/maple52046/inari:$ts"

kubectl -n inari set image deploy/inari "inari=ghcr.io/maple52046/inari:$ts"
kubectl -n inari rollout status deploy/inari
```

Two things change for users at the switch:

- **Everyone is signed out once.** The cookie is named `inari_session` rather
  than `s3m_session` and is sealed differently, so existing sessions are not
  readable. Users reconnect with the same credentials. The rename is deliberate:
  during a parallel run both servers share a cookie jar, and a shared name would
  have them overwriting each other's session.
- **The first paint waits for JavaScript.** There is no server rendering, so
  each page shows its skeleton while its data loads.

## 4. Rollback

Nothing to undo. The rewrite keeps no cache, creates no database, changes
nothing about the data in MinIO, and leaves no migration state.

```bash
kubectl -n inari rollout undo deploy/inari
```

Users sign in again on the way back, for the same cookie reason.

## 5. Remove the Next.js app

Only after the parity review passes and the switch has held.

```bash
git rm -r src public docker
git rm next.config.ts next-env.d.ts package.json package-lock.json \
       tsconfig.json vitest.config.ts eslint.config.mjs .prettierignore
rm -rf node_modules .next tsconfig.tsbuildinfo
```

Then drop the now-unused entries from [`.dockerignore`](../.dockerignore) — the
block at the end exists only to keep the old app out of the image while both
stacks share the tree.

What goes with it is worth naming, because it is the clearest measure of what
the rewrite bought:

- `docker/base_path.mjs` and `docker/start.mjs`, which rewrote the Next.js build
  output at container start-up so one image could serve any URL prefix. The Rust
  server injects a `<base href>` into `index.html` at request time instead, so
  the prefix costs one string substitution and the container filesystem can be
  read-only.
- `src/adapters`, `src/application`, `src/domain`, `src/infrastructure`: ported
  to Rust, with their tests as the specification.
- `src/app`: the only part genuinely rewritten, as SPA routes.
- `src/components`, `src/lib`, `src/theme`: moved to `web/`, essentially intact.
