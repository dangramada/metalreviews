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

## Fourth retouch — genre back to the top zone, thinner full-width dividers, vertical centering

Reverses the third retouch's placement again: genre badges no longer sit between the divider
and the action buttons. They're now their own block directly below the artwork+title `Flex` —
back in the "top zone", not the footer — with the footer containing only the action buttons.
Verified directly against the shipped code (this section documents `src/FavoritesPage.tsx` as
it stands, not a recalled description of it):

- **Genre block**: own `Box` (`borderTop="1px solid" borderColor="border.rule"`, `py={2} px={2}`),
  full card width — the `128px`-wide spacer `Box` that previously offset it to align with the
  text column (second/third retouch) is gone. Only rendered when `item.genre.length > 0`.
- **Footer block**: now a separate, always-rendered `Box` (own `borderTop`, same `border.rule`
  weight) directly below the genre block — no longer the single divider that wrapped both genre
  and buttons as children (third retouch's structure). Also lost its `128px` spacer; the button
  `Flex` uses `justify="center"` across the full row width instead of an offset start. It is
  **unconditional** now (previously gated on `item.genre.length > 0 || onRate || onRemove`) —
  see "New footer action" below for why: the new Listen button has no `onRate`/`onRemove`-style
  prop gate, so the footer always has at least one button to show.
- **Divider weight**: both dividers dropped from `2px solid border.ruleStrong` (first/third
  retouch) to `1px solid border.rule` — a lighter rule, matching the weight already used
  elsewhere for the genre section's own brackets in the second-retouch version of this doc.
- **Vertical alignment** (previously an open question in this doc's earlier drafts, left for
  live testing rather than decided up front): resolved, but not via an `align` prop on the
  artwork+title `Flex` itself — that `Flex` still sets no `align` at all, so it defaults to CSS
  `stretch`. Centering instead happens on the title column's own `Box`: it's now
  `display="flex" flexDirection="column" justifyContent="center"`, with `AlbumMetaBlock`'s own
  20px top/bottom padding zeroed via `padding={{ x: 4, top: 0, bottom: 0 }}`. The stretched
  column (matching the artwork's 128px height) centers its own shorter content within that
  height, rather than the row's cross-axis alignment doing the centering directly — functionally
  equivalent output, different mechanism than a plain `align="center"` would have been.

**Verification status**: `tsc --noEmit` clean and the full suite passes (50/50 test files,
367/367 tests) with this code in the working tree — no test asserts genre/footer DOM structure
or divider styling, so none needed changing. This pass has **not** been confirmed live in a
browser this session (the running dev server's `/favorites` route requires login, and no
credentials are stored anywhere for this project — Dan always logs in himself). Treat the
layout description above as accurate-to-code, not as live-verified pixel behavior. Not
live-tested by Dan yet — merged to master ahead of that check, per his explicit instruction;
treat this pass's on-screen result as unconfirmed until he looks at it.

## New footer action: Evaluate rename + Listen menu

Two changes to the row's action buttons (`src/FavoritesPage.tsx`, both desktop `IconButton` and
mobile `Button` trees), landed together with the fourth retouch above but logically separate:

**"Rate" → "Evaluate"**: icon changed from `FaSlidersH` to `LuClipboardCheck`
(`react-icons/lu` — confirmed to exist under that name before use, no fallback needed) and the
visible label (mobile only; desktop's button is icon-only) from "Rate" to "Evaluate", matching
the destination page's actual name (Evaluate Album). aria-labels/tooltip text changed from "Rate
this album" to "Evaluate this album" to match; "Edit rating" (shown once the album already has a
rating) was left unchanged since it never said "Rate". Applied identically to both trees.

**New "Listen" button**: reuses the Listen menu built for the review-grid card
(`docs/decisions/streaming-links.md`) — same 4 platforms (Bandcamp, Spotify, YouTube Music,
Deezer), same generated-search-link logic (`src/listenLinks.ts`), same `simple-icons` brand
marks, same trigger icon (`Headphones` from `lucide-react` — confirmed via the real import in
`src/App.tsx` before reuse; not `LuHeadphones`, which doesn't exist under that name in
`react-icons/lu`). The menu's item list was inline in `App.tsx` before this; extracted to a new
shared `src/components/ListenMenuItems.tsx` (platform icon lookup + the 4 `MenuItem`s,
parameterized by `band`/`album`) so both `App.tsx` and `FavoritesPage.tsx` import the same
component rather than duplicating the link/icon logic. `App.tsx`'s own Listen chip is otherwise
unchanged (still its own overlay-chip trigger style, still `bg="blackAlpha.800"` on its
`MenuContent` for the image-overlay context).

The new trigger is styled to match Evaluate/Remove exactly (footer button, not the review card's
overlay-chip style) — desktop: icon-only `IconButton` in a `Tooltip`; mobile: icon+label
`Button` collapsing to icon-only under the existing 400px breakpoint, same as Evaluate/Remove.
Footer order, left to right: **Evaluate → Listen → Remove** (primary action first, destructive
action isolated last, Listen as the secondary action between them). Each `MenuContent` is styled
`bg="surface.card" color="text.primary"` — this app's existing dark-panel override pattern
(matching `Drawer`/`Dialog` in `theme.ts`), not `App.tsx`'s translucent `blackAlpha.800`, since
the footer button sits on a plain card background rather than over artwork.

**Confirmed**: `FavoriteListItemRow` does not wrap in an outer `<a>` (verified by reading the
component — no `Link`/anchor wraps the row), so none of the review card's click-through
workarounds (`data-listen-trigger`, `data-menu-just-closed`, the `preventDefault()` vs
`stopPropagation()` distinction — see `streaming-links.md`) were needed or ported here.

**Verification**: `tsc --noEmit` clean. Full suite 50/50 test files, 367/367 tests passing,
including two new assertions in `FavoritesPage.test.tsx` — the Listen menu opens with all 4
platform links (correct `href` for a real band/album), and the footer buttons appear in
Evaluate → Listen → Remove order. Existing "Rate this album" assertions updated to "Evaluate
this album". Live-checked only the review-grid card's Listen chip on the running dev server
(confirmed the `ListenMenuItems` extraction didn't break it — all 4 platforms still render with
correct links) — the Favorites row itself was **not** live-checked this session, same
login-required blocker as the fourth retouch above. The 3-button mobile footer's fit/collapse at
the narrowest supported width has **not** been visually confirmed; flagging as an open item
rather than an assumption.

## Bugfix — desktop Listen menu opened pinned to the window's top-left

Reported after merge: on desktop, opening the new Listen menu positioned it at the window's
top-left corner instead of anchored to the trigger button (mobile was unaffected). Reproduced
live by temporarily wrapping the review-grid card's own (already-working) Listen chip in the
same `Tooltip` component used here, on the public `/` route — confirmed the same mispositioning,
isolating the cause to nesting our `Tooltip` component around `MenuTrigger asChild`.

Root cause: `src/components/ui/tooltip.tsx`'s `Tooltip` forwards its `ref` to
`ChakraTooltip.Content` (the bubble), not to its `Trigger`. When something needs a real ref to
the underlying DOM node through an intermediate `asChild` layer — here, `MenuTrigger asChild`
reading through `Tooltip` to reach the `IconButton` — that intermediate ref never reaches the
actual button, so Ark's Menu positioning has no anchor rect to measure against and falls back to
the viewport origin. Desktop's Evaluate/Remove buttons don't hit this because they wrap a plain
`IconButton` in `Tooltip` with no `Menu` in between; the review-grid card's Listen chip
(`App.tsx`) doesn't hit it either because it was never wrapped in `Tooltip` to begin with.

**First fix (superseded below):** dropped the `Tooltip` wrapper entirely and used a plain `title`
attribute for hover text instead. Worked, but lost the app's styled tooltip for this one button.

**Final fix — keeps the styled Tooltip:** `MenuRoot`'s `positioning` accepts a
`getAnchorElement` callback (from `@zag-js/popper`'s `PositioningOptions`, re-exported through
Ark's `Menu`) that lets the menu machine ask for its anchor element directly instead of
resolving it through the trigger's own prop/ref chain — exactly the thing `Tooltip` nesting
breaks. Added a plain `desktopListenTriggerRef = useRef<HTMLButtonElement>(null)`, attached it
directly to the `IconButton` (`ref={desktopListenTriggerRef}`, alongside whatever ref
`Tooltip`/`MenuTrigger`'s own `asChild` chain also sets — Ark's `asChild` factory composes an
incoming ref with a child's pre-existing one via `composeRefs`, it doesn't overwrite it), and
passed `getAnchorElement: () => desktopListenTriggerRef.current` into `MenuRoot`'s
`positioning`. The `Tooltip` wrapper is back around `MenuTrigger asChild` exactly as originally
written; only the anchor lookup bypasses the broken chain, not the props/ref composition that
makes the button clickable and hoverable in the first place.

Verified live (repeated the same repro method as the bug report): temporarily applied
`Tooltip` + `getAnchorElement` + a manual ref to the review-grid card's Listen chip on the
public `/` route. Clicking positioned the menu correctly under the button (not top-left), and
hovering still showed the styled tooltip bubble — both work at once. Reverted that temporary
change afterward; the real fix lives only in `src/FavoritesPage.tsx`'s desktop Listen button
(mobile was never wrapped in `Tooltip`, so it's unaffected either way).

Re-verified: `tsc --noEmit` clean, full suite 50/50 test files / 367/367 tests passing. The
`getAnchorElement` mechanism itself was proven live via the repro above (on the public route,
not gated behind login); the exact desktop Favorites-row button was **not** separately
re-confirmed live on `/favorites` (still no login for this session) — flagging that gap
explicitly rather than implying full confirmation.

## What did not change

Desktop's JSX structure and thumbnail size (128px / `toThumbnailUrl(url, 250)`, already
matched by mobile now), the split mechanism itself, `rankOverlayBadge`/
`confidenceWarningBadge` definitions, delete-confirmation logic, the year dropdown, bulk-remove,
`AddAlbumDrawer`'s form logic, the desktop image-loading bug flagged as a separate
diagnostic-first item in an earlier brief, and the review-grid card's own Listen chip/overlay
(untouched except for the internal `ListenMenuItems` extraction, which changes no visible
behavior there).
