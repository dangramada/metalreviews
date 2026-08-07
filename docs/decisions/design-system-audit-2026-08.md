# Design system audit — 2026-08

Read-only diagnostic pass over the Slant Take token system and its actual usage across
`src/`, run 2026-08-07. Treats the shipped code as ground truth, not prior decision docs —
nine passes of design-system work have shipped since the last full audit (pass 9), and
components have kept shipping since then (`album-rating-page` + its desktop redesign,
criteria calibration, favorites row desktop + mobile split). Zero files modified in this
session; this doc is the write-up.

## Open items — Dan's decision needed

Three things found during the audit are deliberately **not** resolved here — they're
judgment calls, not bugs, and implementation is a separate future session.

1. **Review card's `boxShadow: 'md'`** (`App.tsx:597`) is the *only* `boxShadow` usage
   anywhere in `src/` outside `components/ui/*`. Favorites rows and the AlbumRatingPage
   desktop card use the same 2px-border language with no shadow. No decision doc mentions
   a deliberate reason for the review card alone having one. **Keep** (document it as
   intentional visual-weight differentiation — review grid is the primary landing surface)
   or **drop** (for consistency with favorites/rating cards, matching the rest of the
   flat/bordered aesthetic)?

2. **Card radius token inconsistency:** the review card uses `borderRadius: 'md'`
   (`App.tsx:595`), FavoriteListItemRow uses `borderRadius="lg"` (`FavoritesPage.tsx:108,227`).
   Both resolve to `0px` today (theme.ts's zero-radius system), so there's no visible bug —
   but they're two different token names doing the same job by coincidence, not by design.
   Standardize on one (e.g. always `md`, or a dedicated `radii.card` semantic token)?

3. **Proposed new tokens** (below) — `text.error`, a title-typography token/shared
   component, `status.info`/`status.warning`, `shadow.card` — need Dan's approve/reject/
   modify before any implementation session touches `theme.ts`.

## Out of scope

**MobileRatingLayout's title typography** (`src/components/album-rating/MobileRatingLayout.tsx:81–83`)
was flagged during the audit as the one title instance with no `fontFamily`, no explicit
`fontSize`, no uppercase/letter-spacing treatment — unlike the other four title instances
(App.tsx card, FavoritesPage desktop/mobile, DesktopRatingLayout). **Not reported as a
confirmed finding here**: Dan has flagged that `MobileRatingLayout` is still under active
development, so auditing its current styling as drift would be premature. Revisit this
component specifically once it's done, rather than folding it into the token-consistency
work below.

---

## 1. Token inventory (`src/theme.ts`, as of this audit)

**Color ramps:** `ember` (50–950, brand accent), `ink` (50–950, dark neutral), `sand`
(50–950, warm neutral) — raw hex, no drift found.

**Semantic color tokens:**
- `surface.*` — `page`, `card`, `cardHover`, `raised`, `darkest`, `ratingCard`,
  `ratingCardFill`, `criterionRow`, `criterionHover`, `criterionActive`
- `border.*` — `default`, `hover`, `rule`, `ruleStrong`
- `text.*` — `primary`, `muted`, `dim`
- `accent.*` — `start`, `end`, `border`, `text`, `ink`
- `slab.*` — `bg`, `text`
- `ember.*` colorPalette registration — `contrast/fg/subtle/muted/emphasized/solid/focusRing/border`
- `badge.*` — `source.bg/text`, `score.bg/text`, `genre.bg/text` — **confirmed still
  orphaned** (theme.ts:196–210 already documents this; nothing in `src/` references
  `badge.source`/`badge.score`/`badge.genre` directly, same finding as pass 9)

**Fonts:** `heading` (Clash Display), `body` (Inter), `mono` (JetBrains Mono).

**Radii:** zero-radius system — `none/xs/sm/base/md/lg/full` all `'0px'`; `circle` =
`'9999px'` (single consumer: `CriterionLevelPicker.tsx:87`).

**Exported style configs:** `primaryButton`, `secondaryButton`, `sourceBadge`,
`scoreSlabBase`, `scoreSlabHigh`, `genreBadge`, `rankOverlayBadge`.

**Recipes:** button compound variants (gray hover fixes), drawer/dialog slot recipe
overrides for dark surfaces.

---

## 2. Colors

No hardcoded hex found anywhere outside `theme.ts`. This is the cleanest category in the
audit.

| Finding | File:Line | Value | Severity |
|---|---|---|---|
| `badge.*` semantic tokens orphaned | theme.ts:197–210 | n/a | Cosmetic — dead weight in the token file, same finding as pass 9 |
| Raw palette key (error text) | LoginPage.tsx:160 | `color="red.400"` | Cosmetic |
| Raw palette key (error text) | AuthCallback.tsx:108 | `color="red.400"` | Cosmetic |
| Raw palette key (error text) | FavoritesPage.tsx:1129 | `color="red.400"` | Cosmetic |
| Raw palette key (error text) | CriteriaCalibrationPage.tsx:345 | `color="red.400"` | Cosmetic — 4 identical error-text uses, zero using a token; argument for `text.error` (see proposed tokens) |
| Raw palette key (favorited heart) | App.tsx:303 | `color="red.400"` | Cosmetic — different semantic meaning (favorited state, not error) wearing the same raw key as the 4 error-text instances above |
| Raw palette key | App.tsx:283 | `bg="blackAlpha.400"` | Cosmetic — heart-toggle scrim overlay |
| Raw palette key | App.tsx:309, 318 | `color="whiteAlpha.600"` | Cosmetic |
| Raw palette key | Header.tsx:125 | `bg="whiteAlpha.400"` (divider) | Cosmetic |
| Raw palette key (status colors) | FavoritesPage.tsx:795, 801, 804, 814, 817 | `gray.900`, `blue.900/200`, `orange.900/200` | Cosmetic — no `status.info`/`status.warning` tokens exist; candidate for new tokens |
| Intentional carve-out | App.tsx:585–586 | `css: { '& option': { background: 'gray.800' } }` | **Not a violation** — native `<option>` can't resolve Chakra CSS vars; value matches `surface.card`, already documented inline |
| Intentional carve-out | RatingRadarChart.tsx:153,169,179–180 | `chart.color('ember.solid')`, `chart.color('sand.300')`, `chart.color('accent.border')` | **Not a violation** — correctly routes through `useChart().color()` to resolve tokens for Recharts SVG props |

---

## 3. Typography

### 3a. General hardcoded font-size sweep

24 call sites use literal px font-sizes instead of Chakra's size scale or a semantic
token. None are miscolored or broken — each is internally consistent — but there's no
single source of truth. Confirmed by `deferred-work.md`'s 2026-08-07 entry
(`favorites-row-mobile-layout` branch), which already flagged this as a real, separate,
not-yet-started concern.

Distinct px values in use across the app: `10px`, `11px`, `12px`, `13px`, `14px`, `15px`,
`16px`, `18px`, `19px`, `20px`, `22px`, `23px`, `28px` — 13 distinct literal sizes, zero
named scale.

### 3b. Title typography — cross-surface comparison

Every place a band/album title renders (excluding `MobileRatingLayout`, see Out of scope
above):

| # | Component | File:Line | Band size/weight/LS/transform | Album size/weight | Layout pattern |
|---|---|---|---|---|---|
| 1 | Review grid card | App.tsx:741–751 (band), 756–764 (album) | `body`, 19px, 700, `-0.01em`, uppercase, lineHeight 1.1 | `body`, 18px, 500, no LS/transform | Two-line stacked (`Heading` + `Text`) |
| 2 | FavoriteListItemRow — desktop | FavoritesPage.tsx:158–166 (band), 168 (album) | `body`, 15px, 700, `-0.01em`, uppercase | `body`, 14px, 500 | Single-line, inline spans joined `"{band} – {album}"` inside one `Text` with `lineClamp={1}` |
| 3 | FavoriteListItemRow — mobile | FavoritesPage.tsx:266–274 (band), 276 (album) | `body`, 16px, 700, `-0.01em`, uppercase, lineHeight 1.2 | `body`, 14px, 500, lineHeight 1.3 | Two-line stacked, em-dash join explicitly dropped (comment at FavoritesPage.tsx:259–264 confirms deliberate, Dan-confirmed-live choice) |
| 4 | AlbumRatingPage — desktop (`DesktopRatingLayout`, Section 1) | DesktopRatingLayout.tsx:136–146 (band), 147–149 (album) | `body`, 19px, 700, `-0.01em`, uppercase, lineHeight 1.1 | `body`, 18px, 500 | Two-line stacked — byte-identical props to #1 (genuinely consistent reuse, not drift) |

**Assessment:** #1 and #4 are a confirmed intentional match — same design language reused
verbatim between the review-grid card and the rating page's desktop card. #2 and #3
diverge from #1/#4 in size (15/14px and 16/14px vs. 19/18px) but keep the same
weight/letter-spacing/uppercase language — a scaled-down variant, plausibly intentional
for a denser list row, but never written down as a rule anywhere. This 3-variant spread
(19/18, 16/14, 15/14) across confirmed-stable components is the strongest concrete
candidate for token/component consolidation — see proposed tokens below.

### 3c. Style-guide/production mismatch

- `App.tsx:143`'s real `ScoreSlab` component uses `fontSize="23px"`.
- `StyleGuide.tsx:331`'s hand-copied mirror of the same score-slab markup uses
  `fontSize="22px"`.
- These two values differ for what's presented as the same element. No decision doc
  mentions a deliberate difference — reads as drift (the style guide wasn't updated after
  a later change to the real component, or a typo at authoring time), not a carve-out.
  Low risk (cosmetic, dev-only route) but a clean, concrete instance of exactly the kind
  of style-guide drift this audit was looking for. See §6.

---

## 4. Spacing / Radii / Shadows

### Spacing

| File:Line | Value | Note |
|---|---|---|
| App.tsx:138 | `gap="3px"` | Off the 4px-grid convention documented in theme.ts pass 4 |
| StyleGuide.tsx:327 | `gap="3px"` | Mirrors App.tsx:138 exactly — consistent with each other, both off-grid |
| RatingSlab.tsx:52 | `gap="2px"` | Off-grid |
| RatingSlab.tsx:47–48 | `pt="16px" pb="12px"` | On-grid; literal px string rather than a spacing-scale number, but comment explains it's a deliberate override of `scoreSlabBase`'s own 8px/4px padding |
| DesktopRatingLayout.tsx:134 | `gap="12px" px="16px" py="20px"` | On-grid, literal px strings — **stale**: this line was consolidated into `AlbumMetaBlock` by the title+metadata unification commits (`6a37fa8` onward) shipped after this audit; the call site no longer carries its own spacing props |
| DesktopRatingLayout.tsx:269–270 | `px="8px" py="4px"` | Matches the badge padding convention from theme.ts pass 4 exactly — **not a violation**, correct reuse of the established (if unnamed) pattern |

**Update (2026-08-07):** the title+metadata consolidation above moved the literal px
strings out of individual call sites and into `AlbumMetaBlock`'s own default/override
props (`padding.x/y/top/bottom`, `titleToDateGap`, `dateToGenreGap`) — which then became
the only place in the whole design system with a spacing scale living outside
theme.ts/Chakra's own system. Fixed same day: replaced the literal `'16px'`/`'20px'`/
`'12px'`/`'8px'` defaults and overrides with Chakra's native scale (`4`/`5`/`3`/`2`) —
no new token group added to `theme.ts`, no semantic `spacing.*` names invented, per Dan's
decision to use Chakra's own scale directly. Verified zero visual change (computed
padding/margin identical before/after) on the review card and FavoritesPage desktop row,
the two surfaces with non-default overrides. Commit `447d6d7`.

None of these are visually risky. The only genuinely inconsistent values are the two
`2px`/`3px` gaps, which don't fit the 4px-grid rule the rest of the codebase follows.

### Radii

No pixel-literal border-radius values found anywhere in `src/` outside `theme.ts`. All
usages reference scale names (`md`, `lg`, `base`, `full`, `circle`, or the literal string
`'0'` in `OptionCard.tsx:40`), and since every named step except `circle` resolves to
`0px`, this category is effectively clean — the zero-rounding rule holds everywhere. See
Open item #2 above for the `md`-vs-`lg` naming inconsistency between the review card and
favorites rows. `OptionCard.tsx:40`'s literal `'0'` string (vs. a token name like `none`)
is a separate, purely stylistic inconsistency — functionally identical.

### Shadows

`App.tsx:597` (`cardStyle`) sets `boxShadow: 'md'` on the review-grid card — the only
`boxShadow` usage found anywhere in `src/` outside `components/ui/*`. FavoritesPage's
desktop and mobile row/card treatments (FavoritesPage.tsx:108–123, 227–230) use the
identical 2px-border-plus-hover-color language but carry no shadow. `DesktopRatingLayout`'s
bordered card (DesktopRatingLayout.tsx:71–72) is also border-only, no shadow.
`CriterionLevelPicker.tsx:84`'s `boxShadowColor` is a Chakra radio-indicator focus-ring
prop, a different mechanism, not a real drop shadow.

No decision doc mentions a shadow at all — see Open item #1 above.

---

## 5. Component duplication

- **Title typography** — see §3b, the primary duplication finding (3 independent
  implementations of the same concept, no shared component/token, excluding the
  out-of-scope `MobileRatingLayout`).
- **Card border/hover language** — genuinely *not* duplicated with drift: the review
  card, FavoritesPage's row/card, `OptionCard.tsx`, and `DesktopRatingLayout`'s outer card
  all reuse the same 2px `border.ruleStrong` border and `border.hover` hover color as
  plain inline props rather than a shared `Card` component or config object. Works today
  because every author copied the same values correctly, but there's no single
  definition — a future change to the border width would require editing 4+ files by
  hand, and nothing would catch a fifth copy that drifts. Candidate for a shared
  card-style config object (same pattern as `sourceBadge`/`scoreSlabBase` already are for
  badges); not urgent since current values are consistent.
- **`red.400` for error text** — 4 independent literal usages (LoginPage, AuthCallback,
  FavoritesPage, CriteriaCalibrationPage) with no shared component or token — see §2.
- **Score/rank display** — `ScoreSlab` (App.tsx), `rankOverlayBadge` (FavoritesPage), and
  `RatingSlab` (AlbumRatingPage) are visually distinct by design and explicitly documented
  as such (`RatingSlab.tsx`'s own header comment explains why it reuses
  `scoreSlabBase`/`scoreSlabHigh` configs but not the `ScoreSlab` component). **Intentional
  differentiation, confirmed not drift** — see §6 table.

---

## 6. Cross-surface consistency tables

### Card treatment

| Component | File | Border | Radius | Shadow | Hover |
|---|---|---|---|---|---|
| Review grid card | App.tsx:593–600 | 2px solid, `border.ruleStrong` | `md` (0px) | `boxShadow: 'md'` — see Open item #1 | border → earned accent/bone color |
| FavoriteListItemRow desktop | FavoritesPage.tsx:117–123 | 2px solid, `border.ruleStrong` | `lg` (0px) — see Open item #2 | none | border → `border.hover` |
| FavoriteListItemRow mobile | FavoritesPage.tsx:229–230 | 2px solid, `border.ruleStrong` | `lg` (0px) | none | (touch — no hover) |
| AlbumRatingPage desktop card | DesktopRatingLayout.tsx:71–72 | 2px solid, `border.ruleStrong` | none set (inherits 0) | none | static, no hover mechanism |
| OptionCard (calibration) | OptionCard.tsx:38–42 | 2px solid, `border.ruleStrong`/`accent.border` | `'0'` | none | border → `border.hover` |

### Score/rank display (intentional differences, confirmed not drift)

| Component | File | Purpose | Visual |
|---|---|---|---|
| `ScoreSlab` | App.tsx:128–154 | Absolute-positioned flush-corner overlay on review-card artwork | 23px number + 10px `/10`, accent-filled at 8.0+ |
| `rankOverlayBadge` | theme.ts:374–388, used FavoritesPage.tsx:150, 252 | Absolute-positioned flush-corner overlay on favorites artwork | 14px `#N`, always accent-filled, single value node |
| `RatingSlab` | RatingSlab.tsx | Static, non-overlay, inline in the rating page's own section layout | Label (14px mono) + 28px value, reuses `scoreSlabBase`/`High` configs with border stripped |

### Badge/tag treatment

| Component | File | Reuses |
|---|---|---|
| `sourceBadge` | theme.ts:305–321 | — |
| `genreBadge` | theme.ts:353–367 | — |
| `CriterionBadge` (calibration) | CriterionBadge.tsx | Spreads `genreBadge` directly, recolors on selected state — correct reuse, not a duplicate |
| Confirmation-dialog status colors | FavoritesPage.tsx:801–817 | Raw `blue.900/200`, `orange.900/200` — not badge-token-based, different visual language from the three badge configs above |

### Hover/touch parity

| Affordance | File | Touch equivalent |
|---|---|---|
| `Tooltip` (rate/remove icons) | FavoritesPage.tsx:188, 203 | Desktop-row only; mobile row explicitly swaps to icon+label buttons with no tooltip (FavoritesPage.tsx:294 comment) — documented, correct |
| Card hover border | App.tsx, FavoritesPage desktop, OptionCard | No touch equivalent, but decorative-only, not information-bearing |
| Radar chart `Tooltip` | RatingRadarChart.tsx:188–213 | Only rendered when `!isSmall`; `MobileRatingLayout.tsx:90` always passes `size="small"`, so the tooltip never renders on mobile — by design (comment at RatingRadarChart.tsx:67), not an untested gap |
| Desktop-only `Tooltip`s in FavoritesPage row | — | Still the one open item already tracked in `deferred-work.md`/CLAUDE.md's active-branches note — confirmed still true, no code change since that note was written |

### Responsive split mechanism

Consistently raw `@media` CSS via `css={{ '@media (...)': {...} }}` in every component
that splits desktop/mobile (`Header.tsx`, `FavoritesPage.tsx`, `AlbumRatingPage.tsx`,
`DesktopRatingLayout.tsx`). Zero `useBreakpointValue` usage anywhere in `src/`. **Consistent,
not mixed** — matches CLAUDE.md's existing note that raw `@media` was chosen for jsdom
testability.

### Description-text formatting

`formatLevelDescription()` is applied at both of its call sites —
`CriterionRow.tsx:39` (calibration UI) and `CriterionLevelPicker.tsx:68` (rating page) —
no third render site bypasses it.

---

## 7. Style-guide drift

- `rankOverlayBadge` (theme.ts:374–388, shipped as part of `favorites-row-desktop-redesign`)
  is entirely absent from `StyleGuide.tsx`'s "Badges — Contextual" section
  (StyleGuide.tsx:305–355), which still only covers `sourceBadge`/`scoreSlabBase`/
  `scoreSlabHigh`/`genreBadge`. Confirmed via grep — no import, no render. Same pattern of
  drift pass 9 already found once (a shipped badge-like config missing from the style
  guide).
- `App.tsx:143`'s real `ScoreSlab` uses `fontSize="23px"`; `StyleGuide.tsx:331`'s mirror
  uses `fontSize="22px"` — see §3c.
- `RatingSlab`, `CriterionBadge`, `OptionCard`, and the `DesktopRatingLayout`/
  `MobileRatingLayout` card treatments have no representation in the style guide at all —
  expected to some degree (a style guide doesn't need every instance), but `rankOverlayBadge`
  specifically is a first-class exported token-like config, same category as the four
  badges already shown, and its omission directly parallels the badge-drift pattern pass 9
  found before.

---

## Proposed new tokens (for Dan's review — not implemented, see Open item #3)

| Proposed name | Value | Group | Justification |
|---|---|---|---|
| `text.error` | `{colors.red.400}` | `text.*` | 4 independent literal `red.400` usages for error text (LoginPage.tsx:160, AuthCallback.tsx:108, FavoritesPage.tsx:1129, CriteriaCalibrationPage.tsx:345) — same semantic meaning, zero shared token |
| Title-typography token(s) or shared `CardTitle` component | 19px/18px primary; document 15/14px and 16/14px as intentional scaled variants, or consolidate | typography | Per §3b: the band/album pattern repeats 3 times (excluding the out-of-scope `MobileRatingLayout`) with no source of truth — matches the existing note in `favorites-row-desktop-redesign.md` that this typography has "no single source of truth" |
| `status.info` / `status.warning` bg+text pairs | `blue.900`/`blue.200`, `orange.900`/`orange.200` | badge/status | FavoritesPage.tsx:801–817's confirmation-dialog status colors are raw palette keys with no existing badge/status token family to map to |
| `shadow.card` (or explicit removal) | `boxShadow: 'md'` — contingent on Open item #1 | shadow | If the review-card shadow is deliberate, name it explicitly instead of the generic Chakra `'md'` shadow token so its intent is documented; if not deliberate, drop it |

---

**Zero application code touched.** Audit was read-only throughout: no changes to `theme.ts`,
`StyleGuide.tsx`, or any component file. Next step is Dan's review of the three open items
above before any implementation session.

---

## Follow-up (2026-08-07) — §7 style-guide drift + surface token gaps resolved

A focused 3-commit session on `StyleGuide.tsx` closed the highest-value gaps this audit
found (`theme.ts` untouched, per the standing convention of not blindly repointing what
an audit only flagged for the style guide itself):

- The 5 `surface.*` tokens listed in §1 (`ratingCard`, `ratingCardFill`, `criterionRow`,
  `criterionHover`, `criterionActive`) that existed in `theme.ts` but had no swatch in the
  "Colors" section are now shown, plus `radii.circle` (also real but missing from
  `RADIUS_TOKENS`).
- §7's two confirmed findings are fixed: `rankOverlayBadge` now has a specimen in
  "Badges — Contextual", and the `ScoreSlab` mirror's `fontSize` was corrected from
  `22px` to `23px` (re-verified against `App.tsx` at fix time, still `23px`).
- §3c's Band/Album typography specimen now spreads `cardTitleBand`/`cardTitleAlbum` from
  `theme.ts` instead of hand-copying their literal values — same "drift because
  hand-copied" root cause as the `ScoreSlab` mismatch and the `rankOverlayBadge` gap, so
  bundled into the same pass. Verified zero visual change via computed style, not just
  by eye (fontFamily/fontSize/fontWeight/letterSpacing/textTransform all matched before
  and after).
- Added an "Album Meta Block" section showing `AlbumMetaBlock`'s two real configurations
  side by side: the default spacing (review card, rating page, favorites mobile) and the
  favorites-desktop override (`padding={{x:0,y:3}}`, `titleToDateGap={1}`,
  `dateToGenreGap={2}`) — not in the original audit's findings, but the same
  "spec exists in code, no representation in the style guide" gap.

Still deferred, unchanged from the audit's "Out of scope" section: `RatingRadarChart`,
review card's unexported `ScoreSlab` assembly, `RatingSummaryView`, `AlbumArtwork`, the
calibration-screen sub-components, and `MobileRatingLayout`. The three "Open items — Dan's
decision needed" (card shadow, radius token naming, proposed new tokens) are also
untouched — this session only closed style-guide-specimen gaps, not token-design
decisions.
