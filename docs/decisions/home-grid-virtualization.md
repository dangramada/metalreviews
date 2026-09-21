# Home page review grid virtualization

## Problem

`docs/data/review-volume/review-volume-growth-forecast-2026-09-21.md` (generated diagnostic
output, not a prose decision — see `CLAUDE.md`'s `docs/data/<cluster>/` convention) projects the
catalogue roughly doubling to
tripling over the next 12 months — still fine to fetch entirely client-side. The real cost was
DOM/network, not data: the old `SimpleGrid` in `src/App.tsx` mounted every filtered album card
at once, so every card's `ArtworkBlock` fired its image request on load — hundreds of
concurrent requests today, growing with the catalogue.

## Decision

Extracted the grid into `src/components/HomeReviewGrid.tsx`, windowed with
`@tanstack/react-virtual`'s `useWindowVirtualizer` (chosen over `react-window` because card
height genuinely varies by review count, and `react-virtual`'s `measureElement` handles that
natively). Virtualizes by row, not by card: `filtered` is chunked into rows of `columns` items,
and the row list is what's windowed. Each row renders as an absolutely-positioned Chakra `Grid`
with `templateColumns: repeat(columns, 1fr)` — same visual grid as before, just windowed.
Fetch/filter/sort/search in `App.tsx` are unchanged; only what `SimpleGrid`'s output becomes.

`App.tsx` no longer renders the per-card JSX directly — it passes `filtered`, `favoritedIds`,
`toggleFavorite`, and a `resetKey` (built from `search`/`sortKey`/`filterSource`/`minScore`, the
four actual pipeline inputs) into `HomeReviewGrid`. `resetKey` exists because `filtered` itself
is a new array reference every render (not memoized, deliberately unchanged) — keying a
scroll-reset effect off `filtered` directly would fire on every render, including a plain
favorite-toggle click.

`cardStyle`, `cardHoverBorderColor`, and the whole card-rendering branch (0/1/2+ review layouts)
moved into `HomeReviewGrid.tsx` verbatim — only consumer. `ArtworkBlock`, `ScoreSlab`,
`toThumbnailUrl`, `SCORE_SLAB_HIGH_THRESHOLD` stayed in `App.tsx` (already cross-file exports
consumed by `FavoritesPage.tsx` and `AlbumArtwork.tsx`; moving them would've meant updating
those import sites for no benefit). `HomeReviewGrid.tsx` imports `ArtworkBlock` and
`SCORE_SLAB_HIGH_THRESHOLD` back from `App.tsx`, creating a real module cycle with
`App.tsx` importing `HomeReviewGrid` — verified safe in practice (57/57 test files pass, `tsc`
clean, live-verified in the browser) because `ArtworkBlock` is a hoisted function declaration
and `SCORE_SLAB_HIGH_THRESHOLD` is only read inside function bodies in `HomeReviewGrid.tsx`,
never at module top level, so nothing is read before `App.tsx`'s module evaluation reaches it.

## Column count: a deliberate exception to "no `useBreakpointValue`"

This codebase has a standing rule (`docs/decisions/design-system-audit-2026-08.md`, "Responsive
split mechanism"): zero `useBreakpointValue` anywhere in `src/`, raw `@media` CSS instead, for
jsdom testability (jsdom doesn't implement `matchMedia`, which the hook wraps). Virtualization
is the first case that needs a *numeric* column count in JS — to chunk the flat card array into
rows — which a pure CSS media query can't provide, so the usual "mount both, CSS-hide one"
pattern doesn't apply here.

Resolved with `window.innerWidth` + a debounced `resize` listener, compared against Chakra's
default `md`/`lg` breakpoints (768px / 992px — `src/theme.ts` has no override, so these are the
library defaults, matching the old `columns={{ base: 1, md: 2, lg: 3 }}` prop). This sidesteps
the actual documented pain (jsdom lacking `matchMedia`) rather than reintroducing it under a
different name — `window.innerWidth` is implemented in jsdom and settable in tests. The resize
handler is debounced ~120ms so a continuous drag-resize doesn't re-chunk `filtered` into rows on
every single event.

## Numbers, measured live rather than guessed

- **`estimateSize: 590`** — measured real card heights in the browser before picking a number:
  ~570-575px for the single-review layout, ~600-630px for 2+-review layout, consistent across
  breakpoints (card width scales with column count either way, so total height stays in a
  similar band regardless of viewport). 590 splits the difference; `measureElement` (real
  `ResizeObserver`, browser-only) corrects it exactly regardless, so this only affects how close
  the *first* render is before that correction lands.
- **`overscan: 3`** rows, per the brief's starting point — not tuned further.
- **`scrollMargin`** — the grid doesn't start at the top of the page (header/controls sit above
  it), so `useWindowVirtualizer` needs to know how far down it starts. Measured via a ref's
  `offsetTop` in a `useLayoutEffect` (not read during render — `react-hooks/refs` correctly
  flags a direct `ref.current` read during render as unsafe) and fed in as state, so there's no
  visible flash between the 0-margin first render and the corrected one.

## Verified

57/57 test files, 448/448 tests pass unchanged — the existing small mocked datasets in
`App.favorites.test.tsx` render fine under jsdom's default (zero-layout) sizing without needing
new `ResizeObserver`/scroll mocking beyond what `src/__tests__/setup.ts` already stubs. `tsc
--noEmit` clean. Live-verified in the browser: only ~11-12 cards mounted at initial paint
(previously all 308), column count updates live on resize at all three breakpoints (1/2/3
cols), search/filter changes reset scroll to top, a favorite-toggle click does not, fast
scroll up/down/to-the-end renders correctly with no skipped rows, deep-scrolled cards render
identically to top-of-page ones (artwork, badges, Listen chip, hover).

## Known trade-off — flagged, not silently shipped

Rows outside the virtualizer's window don't exist in the DOM — browser Ctrl+F and a screen
reader stepping through cards only reach currently-mounted rows. The 3-row overscan softens
this but doesn't remove it. **Not yet confirmed with Dan** — surface before considering this
fully shipped.

## Out of scope (unchanged)

Supabase query, fetch logic, the filter/sort/search pipeline itself, card content/layout,
server-side pagination, infinite-scroll UI.
