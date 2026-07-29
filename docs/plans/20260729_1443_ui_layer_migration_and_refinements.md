# UI Layer Migration and Refinements

Consolidated: 2026-07-29 14:43

## 1. Purpose

Record the long-term plan behind the presentation layer's current shape: the
migration from hand-written Tailwind primitives to Chakra UI v3 with the existing
colour scheme preserved, the brand identity that now rests on typography and a
dedicated mark, and the two rounds of usability work on the bucket file browser
and the Cleanup Planner that preceded it.

## 2. Source Scope

Consolidated from three manuscripts under `docs/plans/manuscripts/`:

- `20260728-cleanup-default-filters.md` — Cleanup Planner default filters
- `20260728-file-browser-ui-refinements.md` — bucket file browser usability
- `20260729-chakra-ui-migration.md` — Chakra UI v3 migration and brand refresh

Where these overlap, the 2026-07-29 migration is authoritative: it replaced the
styling system the two earlier manuscripts were written against.

## 3. Consolidated Background

The product's UI began as hand-written primitives over Tailwind CSS v4, with a
bespoke set of oklch design tokens in `globals.css` and a cookie-backed theme
provider. Two rounds of refinement landed on top of that base: the Cleanup
Planner's filter defaults were retuned so a scan is useful before touching any
input, and the bucket file browser's link controls, per-row actions and
breadcrumbs were reworked for clarity.

The UI still read as unfinished, for reasons that were specific rather than
stylistic: no custom font was ever loaded, surfaces had borders but no elevation,
the logo was a generic icon from the icon library, page headings were hand-rolled
per page and had drifted, and there was effectively no motion. Those gaps drove
the migration to Chakra UI v3, which brought a component library with the
elevation, typography and motion vocabulary the hand-written layer lacked.

The migration deliberately withheld one lever: colour. The existing purple-blue
scheme was preserved exactly, so brand identity had to come from typography, a
dedicated mark, elevation and layout rhythm instead.

## 4. Confirmed Decisions

Confirmed with the user, in decision order:

- **UI library**: Chakra UI v3. Not shadcn/Radix, not a deeper hand-written
  design system.
- **Migration pace**: big bang. All 46 `.tsx` files converted and Tailwind removed
  in one pass, with no coexistence period.
- **Colour mode**: the official `next-themes` route with `attribute="class"`,
  replacing the bespoke cookie-based provider.
- **Colour**: the existing purple-blue scheme is carried over unchanged. No new
  hue is introduced.
- **Brand carriers**: typography, a dedicated SVG mark, elevation, layout rhythm.
- **Fonts**: Zen Kaku Gothic New for headings, Inter for body, JetBrains Mono for
  object keys.
- **Icons**: `lucide-react` stays for every functional icon. Bespoke SVG is
  limited to the logo.
- **Emotion SSR fix**: keep Turbopack and own a custom Emotion cache, rather than
  taking Chakra's documented `next dev --webpack` escape hatch.
- **File listings expand in full**: no inner vertical scroll; the page scrolls.

Earlier confirmed preferences that still hold:

- The product ships dark-first and says so on the settings screen.
- Cleanup Planner filter choices are not persisted across visits.
- The Storage Class column is hidden on every visit rather than remembered.

## 5. Architecture and Design Principles

- **The dependency rule is unaffected.** All of this work lives in the outermost
  layer. `src/theme/system.ts` is framework glue that no domain or application
  module imports, and nothing under `src/domain/`, `src/application/` or
  `src/adapters/` changed.
- **Preserve wrapper APIs, swap implementations.** `src/components/ui/` kept its
  module paths and prop shapes (`variant="destructive"`, `size="icon"`,
  `<Modal open onClose title footer>`, `useToast().notify()`) while the internals
  became Chakra components. With no component tests as a safety net, this kept the
  blast radius of a big-bang migration small.
- **Fix colour at the source, not at each consumer.** Chakra resolves `bg`, `fg`,
  `border`, their subtle/muted/emphasized variants, and even the elevation
  shadows through `{colors.gray.*}`. Overriding the `gray` and `red` palettes
  themselves — rather than each semantic token — keeps tokens the app never names
  explicitly on the project's cool-tinted neutral instead of Chakra's default
  grey.
- **Style objects are hoisted out of table rows.** Listings can run to hundreds of
  rows, so row styles are module constants and selection is expressed with a
  `data-selected` attribute plus a static `_selected` condition, rather than
  building a different style object per row.
- **Derive, do not duplicate, shared defaults.** `DEFAULT_MAX_RESULTS` is exported
  and reused so the planner's initial state cannot drift from its input's default.
  The folder row's `colSpan` is derived from the Storage Class toggle for the same
  reason.
- **Prefer server-consistent values in client components rendered on the server.**
  See the UTC date rule in section 7.

## 6. Functional Scope

Cleanup Planner defaults:

- minimum file size unit defaults to `GB`, with the amount left empty
- maximum results defaults to `30`
- older-than date defaults to 90 days before now

Bucket file browser:

- the URL column names the active mode, `URL (Direct)` or `URL (Presigned)`
- the direct-link precondition is a `?` affordance on that header rather than a
  standing paragraph in the toolbar
- the Name value carries a copy control for just the trailing path segment, with
  the full key on hover; applied to the mobile card list too
- the open-link action lives in `Actions` alongside delete, not beside the URL
- the Storage Class column is an opt-in toolbar toggle, `md` and up only
- the presigned control group is flush right so it holds position when toggled
- the breadcrumb's leading home icon links back to the bucket list
- the breadcrumb trail ends with a control that copies the location as an `s3://`
  URI
- the detail drawer is half the viewport below `md` and a third from `md` up
- listings expand in full; the page scrolls rather than the table

Design system and brand:

- Chakra UI v3 across every page and component
- a shared `PageHeader` replacing four hand-rolled page headings
- `Card` defaults to the elevated variant, giving surfaces a hierarchy
- an `InariMark` torii glyph plus a wordmark set in the display face, replacing
  the generic `Database` icon in the navigation and on the connect screen
- route-level loading is a skeleton matching the page shape, not a spinner
- the three-way light/dark/system preference is a segmented control

## 7. Constraints and Rules

- **Colour must not change.** The brand ramp is interpolated along the previous
  hue 265 so that step `500` is the old light `--primary` and step `400` is the
  old dark one, making `brand.solid` reproduce the original value exactly in both
  modes rather than approximating it.
- **Zen Kaku Gothic New must be vendored Latin-subset only.** It is a Japanese
  family whose full subset runs to megabytes. Every heading the product renders is
  Latin text, so only the Latin subset at weights 500 and 700 is vendored. Needing
  Japanese headings would require revisiting this.
- **Fonts must be vendored, not fetched at build time.** The container build is
  multi-stage to distroless; `next/font/google` would make image builds depend on
  the public internet.
- **Dates for date inputs must be derived in UTC.** `CleanupScanOptions` is a
  client component that Next.js also renders on the server. A local-time
  `YYYY-MM-DD` differs whenever the server timezone differs from the browser's
  (container in UTC, user in UTC+8) and causes a hydration mismatch. The existing
  `new Date("YYYY-MM-DD")` conversion already reads the input as UTC midnight, so
  UTC is consistent end to end.
- **Interactive elements must not nest.** An anchor may not contain a button, so
  the home crumb is a link. The Name cell's copy control is a sibling of the
  detail button, not a child. Chakra's `Breadcrumb.Item` and `Breadcrumb.Separator`
  both render `<li>`, so the separator must be the item's sibling; nesting it makes
  the browser auto-close the outer `<li>` and hydration then mismatches.
- **A sticky table header and inner horizontal scroll are mutually exclusive.**
  `overflow-x: auto` also makes the element a vertical scroll container, and with
  no height cap that container is exactly as tall as its content, so `position:
  sticky` never activates. Full expansion was chosen, so the sticky header was
  dropped rather than left as a dead prop.
- **`defaultTheme` must stay pinned to dark.** `next-themes` defaults to following
  the OS, which would silently contradict the documented dark-first default.
- **Emotion's SSR output must be hoisted into the head.** `ChakraProvider` renders
  two `<Global>` elements that emit `<style data-emotion="css-global ...">` inline
  in the tree on the server while rendering nothing on the client. Left alone the
  child lists differ, React discards the server HTML for that subtree, and a null
  `parentNode` error follows.
- **The Emotion cache key stays Emotion's default `css`** so generated class names
  are unchanged from before the cache provider existed.
- **Only rules new since the previous flush may be emitted** by the cache
  provider, or every flush in a streamed response would repeat all earlier rules.

## 8. Data Model and Format Notes

- No domain type changed in any of this work. The `CleanupScanOptions` domain
  type, the scan and ranking logic, and the server action contracts are untouched.
- Colour tokens are oklch throughout. The neutral ramp sits on hue 260 at chroma
  0.003 to 0.012; the brand ramp on hue 265; the destructive ramp on hue 25.
- Corner radii carry over the previous `0.625rem` and its derivations as Chakra's
  `xs`/`sm`/`md` at `0.375`/`0.5`/`0.625rem`.
- The copied location format is `s3://<bucket>/<prefix>`, unencoded and
  slash-terminated, because it is meant for a chat message or an `aws s3`
  command rather than a URL.
- The copy target for a Name value is the trailing `/`-separated segment of
  `object.key`, not the rendered `object.name`, which is already relative to the
  current prefix.
- The download preference remains a cookie. The theme preference moved from a
  cookie to `localStorage` under next-themes, so preferences saved before the
  migration reset to the dark default. This does not touch the S3 secret, which
  stays in the sealed http-only session cookie.
- Date inputs use `YYYY-MM-DD` derived in UTC; `toDateInputValue()` in
  `lib/date.ts` sits next to its `parseDateInput()` counterpart.

## 9. CLI / API / Config Notes

- Dependencies added: `@chakra-ui/react`, `@emotion/react`, `@emotion/cache`,
  `next-themes`. Removed: `tailwindcss`, `@tailwindcss/postcss`,
  `prettier-plugin-tailwindcss`, `clsx`.
- Files removed: `src/app/globals.css`, `postcss.config.mjs`, `src/lib/cn.ts`,
  `src/lib/theme.ts`, and the three files under `src/components/theme/` that the
  bespoke provider comprised.
- `.prettierrc.json` no longer loads the Tailwind class-sorting plugin.
- `tsconfig.json` already satisfied Chakra's requirements (`module: esnext`,
  `moduleResolution: bundler`, `skipLibCheck`, `@/*` paths); no change was needed.
- Turbopack is retained. Chakra documents `next dev --webpack` as the fix for the
  Emotion hydration mismatch; the custom cache provider was chosen instead so
  build speed is not sacrificed.
- `src/app/layout.tsx` carries `suppressHydrationWarning` on `<html>`, which
  next-themes requires because it writes the colour-mode class before hydration.
- Environment variables are unchanged; `SESSION_SECRET` is still required and
  still fails at request time rather than startup.
- Verification commands remain `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm run test`, plus `npm run build`.

## 10. Implementation Plan

The migration was executed in this order, and the ordering is worth preserving if
it is ever revisited:

1. Write the plan manuscript and install the Chakra dependencies.
2. Build `src/theme/system.ts` and verify token resolution against the previous
   values before touching any component. This retires the largest risk first.
3. Vendor the fonts and wire them through `next/font/local`.
4. Draw the brand mark and the wordmark lockup.
5. Rebuild the `src/components/ui/` primitives on Chakra, preserving their APIs,
   and add the shared `PageHeader`.
6. Convert the `s3/` components, then `cleanup/` and the top navigation.
7. Convert the pages and layouts, and swap the theme controls for the colour-mode
   ones.
8. Remove Tailwind, the bespoke theme module, and the dependencies they pulled in.
9. Verify.

Verification for this work is partly mechanical, because its three main failure
modes are silent:

- colour drift: sample the rendered token values against the pre-migration ones
- icon sizing: assert `rg 'h-[0-9.]+ w-[0-9.]+' src` returns nothing, since those
  classes stop applying once Tailwind is gone and icons fall back to their
  intrinsic SVG size
- theme default regression: confirm the emitted next-themes script carries a
  `dark` default

## 11. Non-goals

- Changing any colour value.
- Replacing `lucide-react`.
- Adopting Chakra's `FormatByte` in place of `src/lib/format_size.ts`, which has
  test coverage; tested behaviour is left alone.
- Any change to `src/domain/`, `src/application/` or `src/adapters/`.
- Any change to how download links are generated, signed or cached, or to the
  download preference cookie.
- Any change to the Cleanup Planner's scan and ranking logic or its server action
  contract.
- Persisting Cleanup Planner filter choices, or the Storage Class toggle, across
  visits.

## 12. Open Questions

- The visual walkthrough in light and dark mode was never completed in an
  automated environment; headless browsers were unavailable. It remains a manual
  step.
- `docker build` was likewise never exercised for this change; no Docker daemon
  was available.
- The client JS bundle grew from 723 KB to 1,244 KB, the expected cost of moving
  from Tailwind's zero-runtime classes to Emotion's runtime CSS-in-JS. Whether
  that is acceptable long term is unresolved; it was accepted when the library was
  chosen.
- The object detail drawer gained a backdrop and a focus trap by moving to
  Chakra's `Drawer`, where the previous implementation was a non-modal fixed
  panel. Whether the modal behaviour is preferable has not been confirmed with
  users.
- Whether resetting the Storage Class toggle on every navigation proves annoying
  was left to be revisited if it does.

## 13. Future Work

- Prefix-based cleanup, which the scope selector currently advertises as
  "Coming soon" with a disabled input.
- Component-level tests. Their absence was the main reason the migration leaned on
  API-preserving wrappers and mechanical checks, and it remains the largest gap in
  the safety net for UI work.
- Revisiting the Latin-only font subset if headings ever need to render Japanese.
- Revisiting the sticky table header if full-height listings prove hard to scan,
  which would require giving up the table's inner horizontal scroll.
