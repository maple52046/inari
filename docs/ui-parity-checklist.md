# UI Parity Checklist

Comparison list for the Rust + SPA rewrite against the Next.js version. Run both
side by side (Next.js on `:3000`, Rust on `:3120`) and work down the list.

The rewrite keeps the React components, the Chakra theme, and the design tokens
unchanged, so differences should be confined to data loading, routing, and the
states that used to arrive server-rendered. Those are the rows worth the most
attention.

## How to run both

```bash
npm run dev          # Next.js, :3000
just run-api         # Rust API + embedded SPA, :3120
just dev             # or: Rust API + Vite with HMR, :5173
```

## Routes

| Route | Next.js | Rust SPA | Checked |
| --- | --- | --- | --- |
| `/` redirects by session state | yes | yes | [ ] |
| `/connect` | yes | yes | [ ] |
| `/buckets` | yes | yes | [ ] |
| `/buckets/:bucket` | yes | yes | [ ] |
| `/buckets/:bucket?prefix=` | yes | yes | [ ] |
| `/settings` | yes | yes | [ ] |
| `/cleanup` | yes | yes | [ ] |
| Unmatched route shows "Page not found" | yes | yes | [ ] |
| Deep link while logged out lands on `/connect` | yes | yes | [ ] |
| Browser back and forward move between folders | yes | yes | [ ] |
| Refresh keeps the current bucket and prefix | yes | yes | [ ] |
| Document title per page (`X - Inari`) | yes | yes | [ ] |

## Connect

- [ ] Endpoint prefilled from `DEFAULT_S3_ENDPOINT`
- [ ] Per-field validation messages: endpoint, access key, secret
- [ ] "Test Connection" reports success without connecting
- [ ] Wrong credentials report "Credential is invalid or access denied"
- [ ] Unreachable endpoint reports "Cannot connect to S3 endpoint"
- [ ] Advanced settings expand: region, path style, skip TLS
- [ ] Connecting lands on `/buckets`

## Buckets

- [ ] Bucket cards match: name, creation date, share bar
- [ ] Bucket count line in the header
- [ ] Name filter
- [ ] Usage panel scans bucket by bucket with progress
- [ ] Pie chart appears after a scan, colours from the theme
- [ ] Scan results survive navigation within the tab (`sessionStorage`)
- [ ] Scan results are discarded after reconnecting elsewhere

## Object browser

- [ ] Table columns and order: name, size, last modified, storage class
- [ ] Storage-class column toggle
- [ ] Folder rows sort above objects
- [ ] Breadcrumbs, including copy `s3://` URI with the tick acknowledgement
- [ ] "Load more" appends the next page
- [ ] Filter applies across every loaded page, not just the last one
- [ ] Sort by name, size, and last modified, both directions
- [ ] Multi-select persists across loaded pages
- [ ] Selected count and combined size in the toolbar
- [ ] Object detail drawer
- [ ] "Measure folder sizes" fills the size column for folders
- [ ] Narrow viewport switches to the card list
- [ ] Empty prefix shows the empty state
- [ ] Unicode and space-bearing keys render and link correctly

## Mutations

- [ ] Delete one object, with confirmation
- [ ] Delete a selection, with per-key failures reported
- [ ] Rename a single object
- [ ] Move a selection into a folder
- [ ] Move across buckets via the destination picker
- [ ] Occupied destination is refused, nothing is overwritten
- [ ] An object over 5 GiB moves through the multipart path

## Downloads

- [ ] Direct mode links straight to the endpoint URL
- [ ] Presigned mode signs on demand and caches within the page
- [ ] Mode and expiry persist in the `s3m_download` cookie
- [ ] A Unicode filename downloads correctly

## Cleanup planner

- [ ] Scope selector: one bucket or all
- [ ] Filters: minimum size, older than, max results
- [ ] Candidates ranked oldest first, then largest
- [ ] Reason badges
- [ ] Summary counts
- [ ] Warnings for buckets that could not be scanned
- [ ] Deleting selected candidates, grouped per bucket

## Settings

- [ ] Theme selector: dark, light, system
- [ ] Connection details, with the access key masked
- [ ] Connected-since and last-used timestamps
- [ ] Provider plugins section
- [ ] About section with source link and licence
- [ ] Disconnect returns to `/connect`

## Cross-cutting

- [ ] Dark theme identical: background, surfaces, borders, brand colour
- [ ] Light theme identical
- [ ] No flash of the wrong theme on load
- [ ] Fonts identical: display, body, monospace
- [ ] Icons identical
- [ ] Toasts appear in the same position with the same styling
- [ ] Focus rings and keyboard navigation through the table and dialogs
- [ ] Loading states while data is in flight
- [ ] Browser console clean of unexpected errors

## Deployment

- [ ] Runs under `BASE_PATH=/dashboard`: links, assets, cookie path
- [ ] `GET /healthz` and `GET /readyz` answer at the root, outside the prefix

## Known intentional differences

These are deliberate and do not need a fix.

- **First paint waits for JavaScript.** Server rendering is gone, so each page
  shows its skeleton while its data loads. The Next.js version painted the
  shell on the server.
- **Connecting and disconnecting reload the document.** The session lives in a
  cookie only the server can read, so a full load is what proves the app picked
  up the change. The Server Action's `redirect` had the same effect.
- **Folder-size measurement can report truncation.** A location with more than
  10,000 direct children now stops recording new entries and says so; the old
  version had no cap. Totals stay accurate either way.
- **The cleanup scan holds only the candidates it will return.** Results are
  identical; memory no longer grows with the number of matches.
