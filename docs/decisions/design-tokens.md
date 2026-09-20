# Design tokens

## What was built

All hardcoded design values consolidated into `src/theme.ts`, registered in `src/main.tsx` via `<ChakraProvider value={system}>`. Components reference only named tokens — no raw hex codes, no bare Chakra palette keys.

## Global CSS

Two global rules are set inside `createSystem()`:

- `body` → `bg: surface.page`, `color: text.primary` — dark base so components inherit colour instead of using light-mode recipe defaults
- `h1–h6` → `color: inherit` — Chakra v3's heading recipe sets its own dark colour; `inherit` lets headings pick up the surrounding surface's text colour

## Token groups

### Semantic colour tokens (`semanticTokens.colors`)

Complete as of 2026-09-12, and kept that way by `src/__tests__/designTokensDoc.test.ts` — see
"Keeping this file complete" below. Values are the ramp token each one resolves to; the ramps
themselves (`ink`, `sand`, `ember`) are defined in `theme.ts` and shown live at `/style-guide`.

#### Surface

| Token                     | Resolves to | Purpose                                                                                                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `surface.page`            | `ink.950`   | Page background                                                                                                                                                    |
| `surface.card`            | `ink.900`   | Card background                                                                                                                                                    |
| `surface.cardHover`       | `#181818`   | Card hover background. A raw hex deliberately: it sits between `ink.900` and `ink.800`, and neither read correctly                                                 |
| `surface.raised`          | `ink.700`   | Raised element (drawer, menu)                                                                                                                                      |
| `surface.darkest`         | `ink.950`   | Deepest surface (same value as page)                                                                                                                               |
| `surface.ratingCard`      | `sand.600`  | AlbumRatingPage card border                                                                                                                                        |
| `surface.ratingCardFill`  | `sand.900`  | AlbumRatingPage card background                                                                                                                                    |
| `surface.tabPanel`        | `ink.900`   | Criteria Calibration tab panel fill. Shared with the `tabs` slot recipe, so the active tab's fill and the edge it paints over the panel border stay one token      |
| `surface.calibrationCard` | `sand.900`  | Both Criteria Calibration card types (comparison and Guide cards). One step lighter than the panel, so a card reads as sitting **on** it rather than flush with it |
| `surface.criterionRow`    | `sand.950`  | Criteria row resting fill                                                                                                                                          |
| `surface.criterionHover`  | `ink.900`   | Criteria row hover fill                                                                                                                                            |
| `surface.criterionActive` | `sand.900`  | Criteria row and level-picker active fill                                                                                                                          |

#### Border

| Token               | Resolves to | Purpose                                                                                     |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `border.default`    | `gray.600`  | Pre-redesign default border. Still used by untouched decorative containers (dialogs, menus) |
| `border.hover`      | `gray.400`  | Pre-redesign hover border                                                                   |
| `border.rule`       | `ink.800`   | Light rule: flush-corner badges, separators inside a card                                   |
| `border.ruleStrong` | `ink.700`   | Structural 2px rule: cards, form elements, header/footer dividers, tab panel                |

#### Text

| Token          | Resolves to | Purpose               |
| -------------- | ----------- | --------------------- |
| `text.primary` | `sand.200`  | Primary text          |
| `text.muted`   | `sand.500`  | Muted / tertiary text |
| `text.dim`     | `sand.300`  | Dim / secondary text  |

Note the ordering is not what the names suggest: `text.dim` is **lighter** than `text.muted`.

#### Accent and slab

| Token           | Resolves to | Purpose                                                                   |
| --------------- | ----------- | ------------------------------------------------------------------------- |
| `accent.start`  | `ember.300` | Gradient start                                                            |
| `accent.end`    | `ember.600` | Gradient end                                                              |
| `accent.border` | `ember.500` | Accent border, high-score fill                                            |
| `accent.text`   | `ember.300` | Accent text                                                               |
| `accent.ink`    | `#140a03`   | Dark text on accent-filled backgrounds                                    |
| `slab.bg`       | `#f2f2f0`   | Score slab background — the app's one light-on-dark inversion (`App.tsx`) |
| `slab.text`     | `ink.950`   | Score slab text                                                           |

#### Status

| Token              | Resolves to | Purpose                                                                                            |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| `status.info.bg`   | `blue.900`  | Informational banner/dialog background. First consumer: AlbumRatingPage's insufficient-data banner |
| `status.info.text` | `blue.200`  | Text on `status.info.bg`                                                                           |

Added 2026-09-20 (insufficient-data score state), tokenizing the raw `blue.900`/`blue.200` pair
`FavoritesPage.tsx`'s confirmation dialogs already used — the gap
`design-system-audit-2026-08.md` flagged. That audit also proposed `status.warning`; it is
deliberately **not** defined, since nothing in the app renders a warning tone yet.

#### `ember` palette contract (`semanticTokens.colors.ember`)

Not swatches to pick from: these are the keys Chakra's own recipes read when a component is given
`colorPalette="ember"` (which is what `primaryButton` does). They exist so the ember ramp can act
as a Chakra colour palette at all, and are listed here only so this file stays exhaustive.

| Token            | Resolves to  |     | Token              | Resolves to |
| ---------------- | ------------ | --- | ------------------ | ----------- |
| `ember.solid`    | `ember.500`  |     | `ember.subtle`     | `ember.900` |
| `ember.fg`       | `ember.300`  |     | `ember.muted`      | `ember.800` |
| `ember.contrast` | `accent.ink` |     | `ember.emphasized` | `ember.700` |
| `ember.border`   | `ember.500`  |     | `ember.focusRing`  | `ember.500` |

#### Dead tokens, pending deletion

| Token                       | Resolves to                     | Status                                |
| --------------------------- | ------------------------------- | ------------------------------------- |
| `badge.source.bg` / `.text` | `gray.800` / `purple.100`       | **Dead** — zero references in the app |
| `badge.score.bg` / `.text`  | `purple.300` / `purple.950`     | **Dead** — zero references            |
| `badge.genre.bg` / `.text`  | `whiteAlpha.100` / `purple.200` | **Dead** — zero references            |

All three are pre-redesign purple-era tokens replaced by the badge style objects below. They are
still defined in `theme.ts`; deletion is logged in `deferred-work.md` rather than done silently,
since a token removal is a change to the public theme surface. They are listed here because this
file is exhaustive by test, and "documented as dead" is more useful than absent.

### Text styles (`textStyles`)

Added 2026-09-12 by the Criteria Calibration page redesign. Both exist because the same
typography had to be identical across several components that don't share a parent, which an
inline `fontSize`/`fontWeight` pair cannot guarantee.

| Token           | Value                           | Purpose                                                                                                                                  |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `cardTitle`     | Inter (`body`) 18px / 500 / 1.4 | Card and section titles: the calibration question prompt, and each criterion level's name in both the comparison card and the Guide card |
| `statusReadout` | Inter (`body`) 14px / 700 / 1.4 | Small numeric readouts you glance at rather than read: the round counter and the progress percentage                                     |

The size gap between the two is deliberate. `statusReadout` was briefly on `cardTitle` and read
far too large beside the question — status numbers sit _below_ content type, not level with it.

### Spacing tokens (`tokens.spacing`)

| Token           | Value  | Purpose                                                                   |
| --------------- | ------ | ------------------------------------------------------------------------- |
| `breadcrumbTop` | `1rem` | The gap between the global `Header`'s bottom rule and a page's breadcrumb |

Named rather than inline because `Header` alone owns that distance for **every** page with a
breadcrumb (see `header-redesign.md`), so it is a cross-page contract, not one page's spacing.

## Border radii — use Chakra's built-in scale

No custom radii are defined. Use Chakra's built-in keys directly:

- `base` (4px) — score badge, source badge, genre tags
- `md` (6px) — refresh button
- `lg` (8px) — cards

**Gotcha:** values in a custom `radii` block must be raw CSS strings (`'0.375rem'`). Referencing another Chakra scale key by name (e.g. `button: 'md'`) silently produces no border radius. Avoid adding custom radii unless a value has no Chakra equivalent.

## Slot recipe overrides (`slotRecipes`)

Drawer and Dialog default to white backgrounds in Chakra v3. Overridden in `createSystem()` so overlays inherit the dark surface without needing per-instance props:

```ts
slotRecipes: {
  drawer: { base: { content: { bg: 'surface.card', color: 'text.primary' } } },
  dialog: { base: { content: { bg: 'surface.card', color: 'text.primary' } } },
}
```

Two more were added 2026-09-11/12 (Criteria Calibration page redesign). Both are overrides of a
**built-in variant** rather than new named variants, which is forced rather than chosen: this repo
has no `@chakra-ui/cli` typegen step, so a new variant name cannot type-check.

| Recipe     | What it overrides                                                                                                                                                     | Why in the theme rather than inline                                                                                                                                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabs`     | The built-in `outline` variant: square corners, 2px rule, selected trigger filled with `surface.tabPanel` and its bottom border painted the same, `list` `minH: auto` | The active tab has to _join_ the panel below it — it paints over the panel's top border to read as its top edge. That join is one visual object built from two components, so both halves must read the same token. Inline props on the `line` variant were tried first and left a white bar, because `line` draws the selected indicator as a `::before` on the trigger itself |
| `progress` | The default `outline` variant: `track` `ink.700`, `range` `ink.300`                                                                                                   | A light fill on a dark empty track, applied wherever a progress bar appears rather than per instance                                                                                                                                                                                                                                                                            |

The `tabs` override requires the panel to render immediately below the tab bar with **no gap and
nothing between them** — see `CriteriaCalibrationPage.tsx`'s `gap={0}` comment.

## Button style sets

Two exported config objects define the canonical primary and secondary button props:

```ts
export const primaryButton = { colorPalette: 'ember' };
export const secondaryButton = { colorPalette: 'gray' };

export const BUTTON_VARIANTS = ['solid', 'outline', 'surface', 'subtle', 'ghost', 'plain'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
```

Spread onto `<Button>` and add a `variant` prop. Sizes available: `xs`, `sm`, `md`, `lg`, `xl`. Do not add `_hover` at the call site — hover behaviour is handled by the theme recipe (see below).

### Theme-level gray hover (compound variants in `recipes.button`)

Gray buttons on the dark `ink.950` surface need explicit hover overrides — Chakra v3's default gray hover is nearly invisible. Defined as `compoundVariants` under `recipes.button` in `createSystem()`:

| variant                                    | hover bg                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `solid`                                    | `gray.400` — distinct filled hover, intentionally different from other variants |
| `outline` / `surface` / `subtle` / `ghost` | `whiteAlpha.200` — subtle tint                                                  |

Ember (primary) does not need overrides; its default hover is visible on dark backgrounds.

**Do not** add `_hover` props directly to gray `<Button>` instances in the app — the theme handles it.

## Badges

### Contextual badges

Three badge configs are exported from `src/theme.ts` — spread onto `<Badge>` directly:

```ts
export const sourceBadge = {
  bg: 'badge.source.bg',
  color: 'badge.source.text',
  borderRadius: 'base',
  size: 'sm',
  variant: 'solid',
};
export const scoreBadge = { bg: 'badge.score.bg', color: 'badge.score.text', variant: 'solid' };
export const genreBadge = {
  bg: 'badge.genre.bg',
  color: 'badge.genre.text',
  borderRadius: 'base',
  size: 'sm',
};
```

| Config        | Where used                                             |
| ------------- | ------------------------------------------------------ |
| `sourceBadge` | Bottom-left of card artwork — review site name         |
| `scoreBadge`  | Bottom-right of card artwork — normalised score string |
| `genreBadge`  | Inline in card body — one per genre tag                |

### System badges

Standard Chakra `colorPalette` + `variant` props, no custom recipe overrides. Palettes: `gray`, `green`, `red`. Available variants: `solid`, `outline`, `surface`, `subtle`, `plain`.

## Keeping this file complete

`src/__tests__/designTokensDoc.test.ts` fails the suite if a custom token is missing from this
file. It derives the list by diffing this project's system against Chakra's `defaultConfig`, so
there is no hardcoded token list to forget to update — that would have been one more copy of the
same problem.

**Why a test and not a convention.** The convention already existed ("update the doc after each
feature") and this file still drifted twice: by 2026-09-12 it described the retired purple accent
palette and was missing nine live tokens, four of which appeared in no doc at all. A reminder
cannot fail, so the guarantee is structural instead. The same technique, for the same reason,
keeps the accuracy-tier labels single-sourced (`accuracyTierLabels.test.ts`).

The check is deliberately loose: it asserts a token's `group.name` appears _somewhere_ in the
file, not that the description is any good. What a token is for is a judgement the person adding
it has to write down; a test can only insist that they wrote something.

**Scope.** Semantic colours, text styles and spacing tokens. Recipe and slot-recipe overrides are
not covered — they override existing Chakra keys rather than adding new ones, so the same diff
cannot tell ours from the defaults. Those are documented by hand, above.

**Live rendering.** `/style-guide` shows every token as an actual swatch or specimen, including
the Tabs and Progress slot recipes and the two text styles. It cannot drift, since it renders the
real theme — but it only exists in a running app, which is why the enumeration lives here too.

## Style guide page

All tokens, typography, buttons, and badges are visible at `/style-guide` (`src/StyleGuide.tsx`) — an unlinked dev route, not shown in the app nav. Navigate to it manually to preview every token and component variant side by side.

### PageBreadcrumb (2026-08-07)

`src/components/ui/breadcrumb.tsx`'s `PageBreadcrumb` restyled to match a new reference: `LuChevronLeft` (react-icons/lu, same set used elsewhere — no new icon dep) prefixes the first item's link, separator changed from Chakra's default chevron icon to a literal `"/"` (passed via `BreadcrumbRoot`'s existing `separator` prop), current item made explicit `text.primary` + `fontWeight="semibold"` (Chakra's "plain" breadcrumb variant already colored `currentLink` brighter than `link` — `fg` vs `fg.muted` — this just makes that intentional rather than incidental). `{label, to?}[]` API unchanged. Specimen added to StyleGuide.tsx using the real Favorites → Album Evaluation trail. Still only wired up on `AlbumRatingPage` — that trail (`sourceLabel`/`backHref` from `resolveBackDestination`) already produced a real 2-item breadcrumb before this change; nothing there needed touching. `CriteriaCalibrationPage` still has no breadcrumb — deferred, see `deferred-work.md`.

## Intentional non-token values

Two hardcoded values are deliberate carve-outs:

- `sx={{ '& option': { background: '#1a202c' } }}` on `<Select>` controls — Chakra semantic tokens cannot resolve inside native CSS `sx` option selectors. `#1a202c` is the hex equivalent of `gray.900`.
- `color="gray.300"` on the Refresh button — pending a decision on whether the button adopts purple (`accent.text`) styling. Not a token yet.
