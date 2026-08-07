# Favorites row — desktop redesign

Desktop-only restyle of `FavoriteListItemRow` (`src/FavoritesPage.tsx`), used by both the
`/favorites` list and the `AddAlbumDrawer` preview. Mobile untouched — a separate brief follows.
Branch `favorites-row-desktop-redesign`, merged to `master` 2026-08-07 (merge commit `5055ba7`).

## What shipped

**Artwork:** 96px → 128px, flush against the row's left/top/bottom edges (row padding zeroed,
`overflow="hidden"` added so the flush square still clips to the row's own rounded corners).
Right side (action buttons) keeps `pr={3}`. Row height is now driven by the artwork (128px + 2×2px
border = 132px measured).

**Rank badge — new token, `rankOverlayBadge` in `theme.ts`:**
```ts
export const rankOverlayBadge = {
  bg: 'accent.border',
  color: 'accent.ink',
  borderTop: '2px solid',
  borderTopColor: 'border.rule',
  borderRight: '2px solid',
  borderRightColor: 'border.rule',
  borderRadius: '0',
  fontFamily: 'heading',       // Clash Display
  fontSize: '14px',
  fontWeight: 400,
  letterSpacing: '0.1em',
  px: '8px',
  py: '4px',
} as const;
```
Structurally modeled on `scoreSlabHigh` (accent fill, 2px structural border, zero radius) but
single-node — just `#{rank}`, no second value node like `ScoreSlab`'s score/denominator pair, and
always accent-filled (no `scoreSlabHigh`-style threshold — every rank renders identically).
Positioned `position="absolute" bottom={0} left={0}` on the artwork's `position="relative"` Box,
flush-corner like the home page's `sourceBadge`/`scoreSlab` overlays (not an inset offset — that
technique was tried on other badges and rejected because partial borders only read correctly flush
into the corner). Renders only when `ratingSummary` is present for the album; no placeholder
otherwise. The font-size/weight/letter-spacing values (14px/400/0.1em) were a live follow-up tweak
after the initial ship (initial values were 13px/700/none) — 14/400/0.1em is what's actually live.

The old inline `rankBadge` chip (mono, 1px border, inline next to genre tags) is deleted — its
`theme.ts` export was removed outright since grep confirmed it had exactly one consumer
(`FavoriteListItemRow` itself), no other callers.

**Band/album title:** still one combined line (`{band} – {album}`), not split into two — that was
a deliberate call during this session (see "Rejected approaches" below) — but now built from two
nested `<Text as="span">` with distinct styles instead of one uniform `Text`:
- Band span: `fontFamily="body"` (Inter, **not** Clash Display — Clash Display is reserved for
  the wordmark and the score-slab number, same rule as the review card), `fontSize="15px"`,
  `fontWeight={700}`, `letterSpacing="-0.01em"`, `textTransform="uppercase"`.
- Album span: `fontFamily="body"`, `fontSize="14px"`, `fontWeight={500}`, `color="text.primary"`.

These are inline styles local to `FavoriteListItemRow`, not a `theme.ts` token — a future session
reusing this typography elsewhere needs to either promote it to a token or copy the values by
hand; there is currently no single source of truth for it the way `rankOverlayBadge` is one for
the badge.

**Actions:** rate (`FaSlidersH`) and delete (`FaTrash`) icon buttons wrapped in Chakra's native
`Tooltip` (`components/ui/tooltip.tsx` — first real consumer of this component in the app),
content "Rate this album" / "Remove from favorites". `aria-label`s on the buttons are unchanged
and independent of the tooltip. **Tooltip is hover-driven and was not touch-tested** — mobile has
no true hover, so this needs a different treatment (or explicit accept-as-is) in the mobile brief;
see `deferred-work.md`.

**Delete confirmation:** previously fired `onRemove` immediately on click. Now opens a local
`DialogRoot` (`role="alertdialog"`, `initialFocusEl` on the Cancel button — same pattern as
`AddAlbumDrawer`'s "Discard this album?" flow) before calling `onRemove`. State
(`showRemoveConfirm`, `cancelRemoveRef`) lives inside `FavoriteListItemRow` itself, gated on
`onRemove` being defined, so the `AddAlbumDrawer` preview usage (no `onRemove` passed) is
unaffected. This part is not hover/touch-dependent — should carry to mobile unchanged.

## Rejected approaches

- **Splitting band/album onto two separate lines** (mirroring the review card's two-`Text`
  structure) — considered since it would have made the new band typography cleaner to apply, but
  rejected in favor of keeping the existing single-line combined layout; band styling applied via
  a nested `<Text as="span">` inside the same line instead.

## Verification

`tsc --noEmit` clean and `npx vitest run` 218/218 passing at every commit on the branch, including
immediately pre-merge. No existing test referenced the old `rankBadge` markup or the previous
immediate-delete behavior directly, so nothing needed updating.

Live verification used a temporary dev-only route/component (`DevFavoritesRowPreview.tsx` +
`/dev-favorites-row-preview` in `main.tsx`, same convention as the prior `DevRatingPreview`
harness) since `/favorites` is auth-gated and no test credentials were available. Removed before
each commit — not present on `master`. Confirmed via computed styles (not just eyeballing):
badge `bottom`/`left` exactly matching the artwork box's `bottom`/`left` (flush corner), badge
`background-color`/`color` matching `accent.border`/`accent.ink`, row height 132px, `Cancel`
button holding `document.activeElement` when the delete dialog opens, tooltip text rendering on
hover.

**Not verified — real artwork softness at 128px.** Both harness passes used either a fake/
non-resolving `artworkUrl` (a made-up MusicBrainz release-group UUID) or `null`, so the `<Image>`
branch never actually rendered in the live check — every screenshot showed the ♪ placeholder, not
a real 250px-source image scaled to 128px display. The brief's ask ("confirm 250px still renders
acceptably at 128px, flag if it looks soft") was never actually exercised. Tracked as open in
`deferred-work.md` — check with a real `artworkUrl` before or during the mobile pass, since mobile
likely reuses the same `toThumbnailUrl(url, 250)` source size.

## What did not change

`useAlbumRatingsSummary`, `scoreAndRank.ts`, any calibration/solver logic, `toThumbnailUrl`'s
source size (250px), `scoreSlabBase`/`scoreSlabHigh` themselves (only a new sibling export added),
mobile layout/breakpoints, the year-dropdown, `AddAlbumDrawer`'s flow, `FavoritesPage`'s controls
row, bulk-remove (still out of scope per `favorites-view.md`).
