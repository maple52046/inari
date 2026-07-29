# Merge Usage into the Bucket Views

Consolidated: 2026-07-29 23:33

## 1. Purpose

Record the plan behind folding the usage scanner into the bucket views: storage
figures sit with the buckets they describe on `/buckets`, and the separate
`/admin/usage` route and its navigation entry are retired.

## 2. Source Scope

Consolidated from one manuscript under `docs/plans/manuscripts/`:

- `20260729-merge-usage-into-buckets.md` — merging usage into the bucket homepage

## 3. Consolidated Background

Usage scanning previously occupied its own route at `/admin/usage`, reached from
the top navigation and from a deep link in the object browser. That put the
figures a page away from the buckets they described, and made the two screens
fetch the bucket list independently.

The scanner is expensive by nature, which shapes every decision here: it walks
every object in a bucket through a delimiter-free recursive listing at 1000 keys
per page, so a bucket with a million objects costs a thousand sequential list
calls. `/buckets` is also the product's effective landing page, because `/`
redirects to it. Those two facts together rule out anything that scans
automatically.

## 4. Confirmed Decisions

- **Scanning stays manual.** Visiting the page never triggers a scan.
- **Relocation only.** The bucket card grid is unchanged; the usage panel moves
  above it as a whole.
- **Results are cached in `sessionStorage`**, surviving client-side navigation
  and a page reload, and cleared when the tab closes. Nothing is cached on the
  server.
- **The un-scanned panel collapses to a single row.** Neither the empty state nor
  the estimate disclaimer renders until there are results.

## 5. Architecture and Design Principles

- **Cost dictates the interaction.** A scan is an explicit user action, never a
  side effect of arriving somewhere. No guard enforces this in code because none
  is needed: `UsagePanel.scan()` is only ever reached from a button's `onClick`.
  The constraint is written down precisely because the failure mode is someone
  later adding a convenience effect without knowing what it costs.
- **No server-side state.** The server holds nothing per user today; even the
  session is a sealed cookie. A usage cache on the server would be the product's
  first server-side state, and it brings two problems worth avoiding: tenant
  isolation, since `S3Connection` is identified by `endpoint` and `accessKeyId`
  and a cache keyed on bucket name alone would serve one user's figures to
  another who happens to own a bucket of the same name; and replica locality,
  since `deploy/k8s/deployment.yaml` runs a single replica, so process memory
  would work today and silently diverge on scale-out. That divergence is exactly
  what the sealed-cookie session was chosen to avoid.
- **Credential fields stay out of the browser.** `getPublicConnection()` exists
  to enforce that, and it is not widened for a cache key.
- **Estimates are qualified where they appear, and only there.**

## 6. Functional Scope

- The usage panel renders on `/buckets`, above the bucket card grid.
- `/admin/usage` and its navigation entry are removed.
- The object browser's scan link points at the bucket view.
- A single `listBuckets()` call feeds both the card grid and the panel's bucket
  list.
- Scan results persist for the lifetime of the browser tab.

## 7. Constraints and Rules

- **No scan may be triggered by rendering.** See section 5.
- **The cookie is unsuitable for the cache**: capped near 4KB and transmitted on
  every request to the origin.
- **Reading storage during render breaks hydration**, because `UsagePanel` is a
  client component that Next also renders on the server. State starts empty and
  is rehydrated after mount, at the cost of one extra render.
- **Malformed cached data must degrade to "no cache"** rather than break
  rendering.
- **A stamp mismatch must discard the cache entry.** This is what stops a
  previous connection's figures appearing after reconnecting elsewhere.
- **The estimate disclaimer may be conditional but not absent.** Making it
  conditional on having results does not weaken the contract in `scan_usage.ts`,
  which requires callers to present _the result_ as scan-based rather than
  authoritative: with no result there is nothing to qualify.

## 8. Data Model and Format Notes

- The cache lives under one `sessionStorage` key holding `scopes` and
  `scannedAt` only. `failures` and `progress` are deliberately excluded:
  re-showing a stale failure after a reload misleads, and progress is purely
  transient.
- `scannedAt` is a `Date`, which JSON cannot round-trip, so it is stored as an
  ISO string and parsed back.
- The payload is stamped with the connection's `endpoint` and the session's
  `createdAt`. The stamp deliberately avoids `accessKeyId`; `endpoint` is already
  published to client components and `createdAt` is already shown on the settings
  screen.

## 9. CLI / API / Config Notes

- No change to `scanUsage`, the scan logic, or `scanBucketAction`'s contract.
- No new environment variables or configuration.
- `deploy/k8s/deployment.yaml` runs a single replica; this is load-bearing for
  the decision to keep the cache off the server.

## 10. Implementation Plan

1. Move the usage scanning server action alongside the bucket route.
2. Render the usage panel on `/buckets` above the card grid, feeding it the
   bucket names from the listing the page already fetches.
3. Add the `sessionStorage` cache with its stamp, ISO date round-trip, and
   degrade-to-nothing behaviour on malformed data.
4. Collapse the un-scanned panel to its control row.
5. Delete the `/admin/usage` route and its navigation entry, and repoint the
   object browser's scan link.

Verification:

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test`,
  `npm run build`
- `rg 'admin/usage' src` returns nothing
- the panel sits above the card grid and shows only its control row until a scan
- no `scanBucketAction` call appears in the dev log on page load
- scan results survive navigation and reload with `scannedAt` unchanged, and are
  gone after the tab is closed
- reconnecting to a different endpoint does not show the previous figures
- no hydration warning after a reload

## 11. Non-goals

- No change to `scanUsage`, the scan logic, or `scanBucketAction`'s contract.
- No change to the pie chart or the `chart.1`-`chart.5` theme tokens.
- No server-side cache.
- No redirect preserving `/admin/usage` bookmarks. The only in-app deep link is
  updated, and this is a self-hosted internal tool.

## 12. Open Questions

- Re-submitting different credentials for the same endpoint **without
  disconnecting first** leaves `createdAt` unchanged, so the cache is not
  invalidated and stale figures remain visible. This was accepted rather than
  solved: it is the same person's own earlier scan in their own tab, and
  `scannedAt` is on screen to make it detectable. It would need revisiting if
  reconnecting without disconnecting becomes a common path.

## 13. Future Work

- A server-side cache, if usage figures ever need to be shared between a user's
  devices or between colleagues on the same credentials. That would require a
  connection-scoped key, a TTL, and a store that survives more than one replica.
