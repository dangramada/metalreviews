# Design tokens

> **Scope warning (added 2026-09-12).** This file is no longer a complete token reference. It
> predates the Slant Take redesign, so its colour tables still describe the retired purple accent
> palette, and several live token groups are documented in NO file — `cardTitleBand` /
> `cardTitleAlbum`, `surface.ratingCardFill`, `border.rule` / `border.ruleStrong` (partially
> covered by `slant-take-design-system.md`). `src/theme.ts` is the only authoritative source
> today. A consolidation pass is logged in `deferred-work.md`.

## What was built

All hardcoded design values consolidated into `src/theme.ts`, registered in `src/main.tsx` via `<ChakraProvider value={system}>`. Components reference only named tokens — no raw hex codes, no bare Chakra palette keys.

## Global CSS

Two global rules are set inside `createSystem()`:

- `body` → `bg: surface.page`, `color: text.primary` — dark base so components inherit colour instead of using light-mode recipe defaults
- `h1–h6` → `color: inherit` — Chakra v3's heading recipe sets its own dark colour; `inherit` lets headings pick up the surrounding surface's text colour

## Token groups

### Semantic tokens (`semanticTokens.colors`)

| Token                     | Resolves to          | Purpose                                                                                                                                                                          |
| ------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surface.page`            | `gray.900`           | Page background                                                                                                                                                                  |
| `surface.card`            | `gray.800`           | Card background                                                                                                                                                                  |
| `surface.raised`          | `gray.700`           | Raised element (e.g. drawer)                                                                                                                                                     |
| `surface.darkest`         | `gray.900`           | Deepest surface (same as page)                                                                                                                                                   |
| `surface.tabPanel`        | `ink.900` (#131313)  | The Criteria Calibration tab panel's fill. Shared with the `tabs` slot recipe, so the active tab's fill and the edge it paints over the panel border stay one token              |
| `surface.calibrationCard` | `sand.900` (#1a1a1a) | Both Criteria Calibration card types (comparison cards and Guide cards) — one step lighter than the panel, so a card reads as sitting **on** the panel rather than flush with it |
| `border.default`          | `gray.600`           | Default border                                                                                                                                                                   |
| `border.hover`            | `gray.400`           | Hover border                                                                                                                                                                     |
| `text.primary`            | `white`              | Primary text                                                                                                                                                                     |
| `text.muted`              | `gray.500`           | Muted / secondary text                                                                                                                                                           |
| `text.dim`                | `gray.400`           | Dim / tertiary text                                                                                                                                                              |
| `accent.start`            | `purple.300`         | Gradient start                                                                                                                                                                   |
| `accent.end`              | `purple.600`         | Gradient end                                                                                                                                                                     |
| `accent.border`           | `purple.500`         | Accent border                                                                                                                                                                    |
| `accent.text`             | `purple.300`         | Accent text                                                                                                                                                                      |

### Contextual badge tokens (`semanticTokens.colors.badge`)

Three badge types used across the app, each with a `bg` and `text` token:

| Token               | Resolves to      | Purpose                                                   |
| ------------------- | ---------------- | --------------------------------------------------------- |
| `badge.source.bg`   | `gray.800`       | Source badge background                                   |
| `badge.source.text` | `purple.100`     | Source badge text                                         |
| `badge.score.bg`    | `purple.300`     | Score badge background                                    |
| `badge.score.text`  | `purple.950`     | Score badge text (dark purple on light purple background) |
| `badge.genre.bg`    | `whiteAlpha.100` | Genre tag background                                      |
| `badge.genre.text`  | `purple.200`     | Genre tag text                                            |

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
export const primaryButton = { colorPalette: 'purple' };
export const secondaryButton = { colorPalette: 'gray' };

export const BUTTON_VARIANTS = ['solid', 'outline', 'surface', 'subtle', 'ghost', 'plain'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
```

Spread onto `<Button>` and add a `variant` prop. Sizes available: `xs`, `sm`, `md`, `lg`, `xl`. Do not add `_hover` at the call site — hover behaviour is handled by the theme recipe (see below).

### Theme-level gray hover (compound variants in `recipes.button`)

Gray buttons on the dark `gray.900` surface need explicit hover overrides — Chakra v3's default gray hover is nearly invisible. Defined as `compoundVariants` under `recipes.button` in `createSystem()`:

| variant                                    | hover bg                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `solid`                                    | `gray.400` — distinct filled hover, intentionally different from other variants |
| `outline` / `surface` / `subtle` / `ghost` | `whiteAlpha.200` — subtle tint                                                  |

Purple (primary) does not need overrides; its default hover is visible on dark backgrounds.

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

## Style guide page

All tokens, typography, buttons, and badges are visible at `/style-guide` (`src/StyleGuide.tsx`) — an unlinked dev route, not shown in the app nav. Navigate to it manually to preview every token and component variant side by side.

### PageBreadcrumb (2026-08-07)

`src/components/ui/breadcrumb.tsx`'s `PageBreadcrumb` restyled to match a new reference: `LuChevronLeft` (react-icons/lu, same set used elsewhere — no new icon dep) prefixes the first item's link, separator changed from Chakra's default chevron icon to a literal `"/"` (passed via `BreadcrumbRoot`'s existing `separator` prop), current item made explicit `text.primary` + `fontWeight="semibold"` (Chakra's "plain" breadcrumb variant already colored `currentLink` brighter than `link` — `fg` vs `fg.muted` — this just makes that intentional rather than incidental). `{label, to?}[]` API unchanged. Specimen added to StyleGuide.tsx using the real Favorites → Album Evaluation trail. Still only wired up on `AlbumRatingPage` — that trail (`sourceLabel`/`backHref` from `resolveBackDestination`) already produced a real 2-item breadcrumb before this change; nothing there needed touching. `CriteriaCalibrationPage` still has no breadcrumb — deferred, see `deferred-work.md`.

## Intentional non-token values

Two hardcoded values are deliberate carve-outs:

- `sx={{ '& option': { background: '#1a202c' } }}` on `<Select>` controls — Chakra semantic tokens cannot resolve inside native CSS `sx` option selectors. `#1a202c` is the hex equivalent of `gray.900`.
- `color="gray.300"` on the Refresh button — pending a decision on whether the button adopts purple (`accent.text`) styling. Not a token yet.
