# Album evaluation page — background color updates

Two small background-color tweaks to the `/rate/:albumId` page (Dan's request, 2026-09-16):

1. **Mobile header (artwork/band/album)** — [`MobileRatingLayout.tsx`](../../src/components/album-rating/MobileRatingLayout.tsx)'s
   `albumInfo` `Flex` previously had no `bg` of its own and inherited `surface.ratingCardFill`
   (`sand.900`) from the shared card wrapper it sits inside (that same wrapper also holds the
   criteria list below it). Gave `albumInfo` its own `bg="surface.card"`, matching desktop's
   `DesktopRatingLayout.tsx` Section 1 (artwork + `AlbumMetaBlock`), which already used
   `surface.card` — this was a mobile/desktop inconsistency, not a new token.

2. **Evaluation-in-progress slab (mobile + desktop)** — [`RatingSlab.tsx`](../../src/components/album-rating/RatingSlab.tsx)'s
   `scoreSlabProgress` style object (the "Evaluation progress" slab shown pre-completion, via
   `RatingProgressBox`) changed `bg` from `ember.950` to `sand.800`. This object is shared by
   both `MobileRatingLayout` and `DesktopRatingLayout` (both render `RatingProgressBox`), so the
   one edit covers both breakpoints. `sand.800` (`#292929`) was previously defined in
   `theme.ts`'s `sand` ramp but not yet used as any `bg` in the codebase.

No new tokens, no schema/logic changes. `tsc` clean, 367/367 tests pass. The route sits behind
`RequireAuth` — no credentials are stored for this project (see the QA-account convention), so
this was not live-verified before merge. Dan has since confirmed both changes on his own account
(2026-09-16) — verified.
