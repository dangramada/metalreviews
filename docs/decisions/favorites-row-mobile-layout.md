# Favorites row — mobile layout

Mobile counterpart to `favorites-row-desktop-redesign`. Adds a vertical, artwork-first mobile
layout for `FavoriteListItemRow` (`src/FavoritesPage.tsx`), used by both the `/favorites` list
and the `AddAlbumDrawer` preview. Branch `favorites-row-mobile-layout`, not yet merged as of
2026-08-07 — pending Dan's own live visual confirmation.

## What shipped

**Split mechanism:** both a desktop and mobile render tree mount inside `FavoriteListItemRow`
simultaneously, each wrapped in a `Box` toggled via raw `@media` `display:none` — same technique
`AlbumRatingPage`'s `DesktopRatingLayout`/`MobileRatingLayout` split already uses (768px
breakpoint: `max-width: 47.9375em` hides desktop, `min-width: 48em` hides mobile), not
`useBreakpointValue`. Chosen over `useBreakpointValue` for the same jsdom-testability reason
`AlbumRatingPage` uses it. This mechanism extends cleanly to both `FavoriteListItemRow` call
sites (main list, `AddAlbumDrawer` preview) since the existing `onRate`/`onRemove` optional-prop
conditionals already handle the preview's reduced props.

**Artwork:** `toThumbnailUrl(url, 500)`, near-full-width, square aspect ratio. Desktop's 128px /
250px call is untouched. `rankOverlayBadge` (the desktop session's token) reused unmodified,
overlaid `position="absolute" bottom={0} left={0}` — built layout-agnostic, needed no changes.

**Title:** two separate lines instead of desktop's single-line inline-span/em-dash join — band
`fontSize="16px" fontWeight={700} letterSpacing="-0.01em" textTransform="uppercase"
lineHeight="1.2"`, album `fontSize="14px" fontWeight={500} color="text.primary" lineHeight="1.3"`.
Inline styles, not theme tokens (confirmed no shared token exists, same as desktop's finding).
Values proposed and confirmed live by Dan (initial proposal was 17px/15px, rounded to even
16px/14px per Dan's correction). Dropping the em-dash made sense once the two lines are already
visually separated.

**Actions footer:** Chakra `Button` (not bare `IconButton`), icon+label, collapsing to icon-only
under a secondary `@media (max-width: 24.9375em)` (400px) breakpoint — chosen over a container
query since the codebase has no existing container-query usage and the one precedent
(`AlbumRatingPage`) uses viewport `@media`. Known, accepted imprecision: this can't detect the
`AddAlbumDrawer` preview's actual rendered width if it's ever narrower than the viewport at a
given breakpoint. No `Tooltip` (touch has no hover state) — confirmed dropped by design, not an
oversight. `aria-label`s unchanged. Delete-confirmation `DialogRoot` reused unchanged, triggered
from the mobile button.

## Verification

`tsc --noEmit` clean, 218/218 tests passing. `FavoriteListItemRow` now always mounts both
layouts (CSS-hidden, not conditionally rendered), so several `FavoritesPage.test.tsx` assertions
that assumed a single DOM match (`getByText`, `getByRole('img')`) were updated to
`getAllByText`/`getAllByRole` — band/album text and artwork images now legitimately appear twice
in the DOM regardless of viewport.

Live-verified via a temporary dev-only route (`DevFavoritesRowPreview.tsx` +
`/dev-favorites-row-preview` in `main.tsx`, same convention as the prior `DevRatingPreview`
harness), since `/favorites` is auth-gated and no test credentials were available. Removed before
the branch's work concluded — not present in the committed diff. Used a real Cover Art Archive
URL fetched directly from Supabase (closing the desktop session's "never verified with real
artwork" gap for both the 250px desktop and new 500px mobile sizes). Confirmed at 375px and
430px: real artwork loads correctly at both sizes, the icon-only/icon+label collapse triggers
correctly either side of 400px, desktop is unaffected at >=768px, and the delete-confirmation
dialog opens correctly from the mobile trigger.

**Not done:** Dan's own live visual confirmation of the rendered mobile card — this session's
verification was tool-driven, required before merge per the brief's Definition of Done.

## What did not change

Desktop's JSX, `rankOverlayBadge` definition, delete-confirmation logic, the 250px desktop
thumbnail source, `AlbumRatingPage`'s own components, `FavoritesPage`'s controls row,
`AddAlbumDrawer`'s preview usage of `FavoriteListItemRow`.
