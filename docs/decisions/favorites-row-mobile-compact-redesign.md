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

## Post-implementation retouch pass

Four visual fixes after the first live review, all mobile-only:

1. **Band font-size reverted to 16px** (from 15px) — 15px was set to match desktop's inline
   spec exactly, but that flattened the band/album size gap too much on the stacked layout,
   where the two are visually separate lines rather than one joined line. 16px/14px restores
   the original `favorites-row-mobile-layout` spec and reads clearly hierarchical again.
2. **Separator now spans the full card width**, not just the text column. Restructured so the
   artwork+text `Flex` and the divider+footer `Box` are siblings inside one outer card `Box`,
   rather than nesting the divider inside the text column. The footer's buttons still start at
   the same left offset as the text column (not the card edge) via a `128px`-wide spacer `Box`
   inside the footer row that mirrors the artwork's width, instead of a hardcoded padding
   value.
3. **`hideReleaseDateLabel`** wired through to `AlbumMetaBlock` on the mobile call site — an
   existing opt-in prop already used by `MobileRatingLayout`, no new code needed.
4. **Buttons are content-width**, not stretched — dropped `flex={1}` from both Rate and Remove
   buttons; they now size to their own icon+label content with a `gap={2}` between them.

Re-verified: `tsc --noEmit` clean, full suite 50/50 test files passing (no test changes needed
— DOM structure change, no assertion touched any of the moved elements' paths). Live-confirmed
by Dan at mobile viewport (340–375px): separator touches both card edges, no "Release date:"
text visible, buttons content-width with a visible gap right after the artwork, band/album
hierarchy restored. Icon-only footer collapse below 400px and desktop (unaffected) re-confirmed
at 1280px.

## Second retouch pass — albumFontSize bug + genre badge move

A later brief (targeting this same component) got cut off mid-message after item 1 (Layout);
its diagnostic-step instruction — grep the actual call site before editing, since prior
sessions' narrative assumptions about current values didn't always match source — caught a
real bug while re-verifying: **`albumFontSize` was never explicitly passed** at the mobile
`AlbumMetaBlock` call site. The first retouch pass's own doc text claimed "album stays 14px
unchanged," but no `albumFontSize` prop had ever been added, so it silently fell back to
`cardTitleAlbum.fontSize`'s theme default of **18px** the whole time. Fixed: added
`albumFontSize="14px"` explicitly.

Separately, live review flagged that genre badges — still rendered inside `AlbumMetaBlock`'s
own `genre` prop at the time — were squeezed into the ~215px text column and two-word genres
(e.g. "PROGRESSIVE METAL") always stacked vertically instead of wrapping side-by-side. Genre
rendering was pulled out: `AlbumMetaBlock` now gets `hideGenres` on the mobile call site, and
the mobile block renders its own `Wrap`/`Badge` row (reusing the existing `genreBadge` token
from `theme.ts`, same one `AlbumMetaBlock` uses internally) directly below the artwork+text
`Flex`. Alignment was a live decision, not an assumption — asked Dan whether the new genre row
should get the full card width (dropping the artwork-width spacer, since the row sits below the
128px artwork and nothing would overlap) or stay aligned to the text column like the title above
it; **he chose to keep it aligned to the text column** (same `128px` spacer + `px={4}` pattern
already used for the footer), so the row's available wrap width is unchanged from before the
move — the move relocates genre out of `AlbumMetaBlock` and below the release date, it doesn't
create additional horizontal space. Two-word genres still stack vertically in a narrow column;
that's accepted behavior, not a regression.

Re-verified: `tsc --noEmit` clean, full suite 50/50 test files passing (no test changes — no
assertion depended on genre badge placement or album font size). Live-confirmed by Dan at
mobile viewport (375px): album title now visibly smaller than band (14px vs 16px), genre
badges render as their own row under the release date at the same left indent as the title,
desktop confirmed unchanged at 1280px.

## Third retouch — genre badges moved below the separator

Live review disagreed with the second retouch's placement: genre badges sat directly under the
release date, above the divider. Moved them below the divider instead, between the separator
and the Rate/Remove buttons. Restructured so the divider `Box` (`borderTop`) now wraps both the
genre row and the button row as children — genre row first (own `pb={3}` only when actions
follow, so there's no double gap when a row has no `onRate`/`onRemove`), buttons second — rather
than the genre row sitting outside the divider `Box` before it. The divider's own show condition
widened to `item.genre.length > 0 || onRate || onRemove` so it still appears for a genre-only
row (no rate/remove handlers, e.g. a context that never passes them) instead of only showing
when actions exist.

Re-verified: `tsc --noEmit` clean, full suite 50/50 test files passing. Live-confirmed by Dan at
375px: divider directly below the release date, genre badges between the divider and the
action buttons, desktop unaffected at 1280px.

## What did not change

Desktop's JSX structure and thumbnail size (128px / `toThumbnailUrl(url, 250)`, already
matched by mobile now), the split mechanism itself, `rankOverlayBadge`/
`confidenceWarningBadge` definitions, delete-confirmation logic, the year dropdown, bulk-remove,
`AddAlbumDrawer`'s form logic, and the desktop image-loading bug flagged as a separate
diagnostic-first item in the brief.
