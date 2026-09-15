# Favorites row — mobile compact redesign + skeleton loading

Supersedes `favorites-row-mobile-layout`'s vertical artwork-first mobile card with a
horizontal layout matching desktop's structure, and adds skeleton loading (previously absent
entirely) to `FavoriteListItemRow` (`src/FavoritesPage.tsx`), used by both the `/favorites`
list and the `AddAlbumDrawer` preview. Branch `favorites-row-mobile-compact-redesign`.

## Why

The vertical artwork-first mobile card (`favorites-row-mobile-layout`, merged 2026-08-07) took
significant vertical space per row on mobile and read inconsistently with desktop's flush
horizontal layout. This pass brings mobile in line with desktop's row shape while keeping the
two-line stacked title (not desktop's single-line inline format) and adds a loading state that
was missing on both platforms.

## What shipped

**Mobile layout, now horizontal:** same `Flex` row shape as desktop — 128px fixed square
artwork on the left (`toThumbnailUrl(url, 250)`, dropped the old 500px mobile-specific size to
match desktop's request), `Box flex={1} minW={0}` for the title/actions column on the right.
Split mechanism (`@media` `display:none` toggle per `Box`, both trees always mounted) unchanged
from the prior mobile pass — see that doc's rationale.

**Title:** still `AlbumMetaBlock` `titleLayout="stacked"` (two lines, band then album) — not
switched to desktop's single-line inline format. `bandFontSize="15px"` (down from the stacked
default 19px, `cardTitleBand.fontSize` in `theme.ts`) to match desktop's own inline spec
exactly. Bounded-height truncation via `AlbumMetaBlock`'s existing `truncateBand` +
`clampAlbumLines={2}` props (band: single line + ellipsis; album: native Chakra `lineClamp`,
wraps then ellipsizes at 2 lines) — these props already existed for `MobileRatingLayout`'s use
case; this is a second consumer, no new prop plumbing needed. Verified live against "Labor of
the Negative" / "The Triumph of Time and the Disillusioned" (stress-test case from the brief):
band ellipsizes to "LABOR OF THE NEGAT…", album wraps to two lines then ellipsizes on the third.

**Rank badge / confidence warning:** unchanged, still flush bottom-left on the artwork, same
`title`/`aria-label` (not `Tooltip`) treatment for touch.

**Actions footer:** unchanged icon+label Rate/Remove buttons, same icon-only collapse under
400px (`@media (max-width: 24.9375em)`), same delete-confirmation `DialogRoot`. New: a
separator above the footer (`borderTop: 2px solid`, `borderColor: border.ruleStrong`) — reuses
the `ink.700` token already documented in `theme.ts` for exactly this use-case
(header/footer dividers), no new token. The footer is pinned to the bottom of the title column
via `mt="auto"` on its wrapping `Box` (the column itself is `display="flex" flexDirection="column"`),
so the separator sits directly above the buttons regardless of how many lines the title/genre
tags above it take.

**Skeleton loading — new on both mobile and desktop artwork:** previously absent entirely on
this component (only the `onError` → ♪ placeholder existed). Ported `ArtworkBlock`'s pattern
(`src/App.tsx`): `<Skeleton position="absolute" ...>` overlay, `opacity={loaded ? 0 : 1}`,
`transition="opacity 0.3s ease"`, `pointerEvents="none"`, driven by a new `imgLoaded`/
`mobileImgLoaded` state pair set on the `<Image>`'s `onLoad`. `loading={!loaded}` — Chakra v3
inverted the old `isLoaded` polarity; ArtworkBlock's own comment flags this same gotcha.
Colour: `variant="shine"` with a `css` override pointing `--start-color`/`--end-color` at
`colors.ink.800` / `colors.ink.700` — reuses the same two existing tokens as the new separator
rather than Chakra's default `bg.muted`/`bg.emphasized` gray, for better contrast against the
dark theme. **Flagged first-pass, not final** per the brief — contrast/visibility to be
confirmed live and may need a retouch iteration.

## Verification

`tsc --noEmit` clean. Full suite: 50/50 test files passing. One existing assertion in
`FavoritesPage.test.tsx` ("renders artwork thumbnail when artworkUrl is present") updated —it
asserted two different thumbnail URLs (250px desktop, 500px mobile); now both layouts request
the same 250px size, so the assertion checks for two identical URLs instead.

Live-verified by Dan at mobile viewport (360–380px) against his own real account/artwork:
horizontal row renders correctly, rank badges and separator in place, "Labor of the Negative"
truncation confirmed as described above, icon-only footer collapse confirmed either side of
400px, desktop confirmed unchanged (still the original flush single-line-title row). Skeleton
shimmer itself wasn't caught mid-transition live (images loaded from browser cache too fast to
observe the fade) — the mechanism is a direct copy of `ArtworkBlock`'s already-working pattern,
but the "first pass, expect a retouch" caveat from the brief still applies since the shimmer's
actual on-screen contrast hasn't been eyeballed yet.

## What did not change

Desktop's JSX structure and thumbnail size (128px / `toThumbnailUrl(url, 250)`, already
matched by mobile now), the split mechanism itself, `rankOverlayBadge`/
`confidenceWarningBadge` definitions, delete-confirmation logic, the year dropdown, bulk-remove,
`AddAlbumDrawer`'s form logic, and the desktop image-loading bug flagged as a separate
diagnostic-first item in the brief.
