import { createSystem, defaultConfig } from '@chakra-ui/react';

const system = createSystem(defaultConfig, {
  // Global CSS: set dark base so components inherit color instead of using
  // their light-mode recipe defaults. This avoids per-component bg/color overrides.
  globalCss: {
    body: {
      bg: 'surface.page',
      color: 'text.primary',
    },
    // v3 heading recipe sets its own dark color; forcing inherit lets it pick up
    // the surrounding dark surface's white text.
    'h1, h2, h3, h4, h5, h6': {
      color: 'inherit',
    },
    // Equalizer-bar loading indicator (LoadingIndicator.tsx, pass 7). Defined globally
    // rather than inline in the component's `css` prop: nesting an `@keyframes` object
    // inside the same `css` object as a `_motionReduce` condition crashes Chakra's prop
    // merge (`Cannot create property '@keyframes ...' on string`) — found via live
    // verification, not assumed. Keeping the keyframes here, referenced by name from the
    // component, avoids the collision entirely.
    // Bar thickness is 16% (was 20% at ship time) — width values only. The height values
    // in each step (50%/20%/100%) are unrelated to thickness; they drive the wave motion
    // and are untouched.
    '@keyframes slant-take-eqbars': {
      '0%': { backgroundSize: '16% 50%, 16% 50%, 16% 50%' },
      '20%': { backgroundSize: '16% 20%, 16% 50%, 16% 50%' },
      '40%': { backgroundSize: '16% 100%, 16% 20%, 16% 50%' },
      '60%': { backgroundSize: '16% 50%, 16% 100%, 16% 20%' },
      '80%': { backgroundSize: '16% 50%, 16% 50%, 16% 100%' },
      '100%': { backgroundSize: '16% 50%, 16% 50%, 16% 50%' },
    },
  },
  theme: {
    tokens: {
      colors: {
        // Custom Slant Take palettes (pass 1 of design system migration).
        // Values anchored to real mockup hexes where available; ramp steps
        // without a mockup anchor are interpolated/extrapolated.
        ember: {
          50: { value: '#fef5f1' },
          100: { value: '#fde8dd' },
          200: { value: '#fdceb4' },
          300: { value: '#ffa97a' },
          400: { value: '#ff8847' },
          500: { value: '#ff6a1a' },
          600: { value: '#e65000' },
          700: { value: '#b84305' },
          800: { value: '#913808' },
          900: { value: '#712e09' },
          950: { value: '#451d08' },
        },
        ink: {
          50: { value: '#f7f7f7' },
          100: { value: '#ededed' },
          200: { value: '#d9d9d9' },
          300: { value: '#bdbdbd' },
          400: { value: '#999999' },
          500: { value: '#757575' },
          600: { value: '#595959' },
          700: { value: '#3a3a3a' },
          800: { value: '#262626' },
          900: { value: '#131313' },
          950: { value: '#0c0c0c' },
        },
        sand: {
          50: { value: '#f4f3f0' },
          100: { value: '#eae8e1' },
          200: { value: '#cac6bb' },
          300: { value: '#9d998c' },
          400: { value: '#7b7870' },
          500: { value: '#666460' },
          600: { value: '#4d4d4c' },
          700: { value: '#383838' },
          800: { value: '#292929' },
          900: { value: '#1a1a1a' },
          950: { value: '#0f0f0f' },
        },
      },
      fonts: {
        heading: { value: "'Clash Display', sans-serif" },
        body: { value: "'Inter', sans-serif" },
        mono: { value: "'JetBrains Mono', monospace" },
      },
      // Slant Take is a zero-radius system — every corner is square (spec §4).
      //
      // Raw '0px' strings only. Referencing another scale key by name (e.g. md: 'none')
      // silently produces NO radius rule at all rather than a zero one.
      //
      // `xs`/`sm` matter as much as the rest despite nothing referencing them directly:
      // Chakra v3's component recipes don't read these keys, they read a semantic layer
      // (l1 -> xs, l2 -> sm, l3 -> md, see @chakra-ui/react semantic-tokens/radii.js).
      // Button, Input, NativeSelect, Toast and the Badge base recipe all resolve through
      // l2 -> sm; Dialog and Drawer content through l3 -> md. Omitting xs/sm would leave
      // every button, input, select, toast and score badge visibly rounded.
      //
      // `base` is not a real v3 token — it's a stale v2-era key still referenced by
      // sourceBadge/genreBadge and the favorites thumbnail. Before this pass it resolved
      // to nothing: the two badges stayed rounded anyway via the Badge recipe's own l2
      // fallback, while the thumbnail (a plain Box, no recipe) rendered square. Defining
      // it here makes all three resolve consistently to zero for the first time.
      //
      // `full` is zeroed deliberately: the mockups have no circular elements anywhere.
      // Its single consumer is the heart-favourite toggle over card artwork (App.tsx),
      // which becomes square. This does remove Chakra's standard "make this a circle"
      // escape hatch app-wide — reinstate a dedicated token if a future component needs one.
      //
      // 2xs/xl/2xl/3xl/4xl are left at Chakra defaults: nothing in the app, and no recipe
      // reachable from it, consumes them.
      radii: {
        none: { value: '0px' },
        xs: { value: '0px' },
        sm: { value: '0px' },
        base: { value: '0px' },
        md: { value: '0px' },
        lg: { value: '0px' },
        full: { value: '0px' },
        // Reinstates a real circle, scoped to a single token rather than un-zeroing `full`
        // app-wide — see the `full` comment above. Only consumer: the AlbumRatingPage level
        // picker's radio indicator (CriterionLevelPicker.tsx), which needs a genuine circle to
        // match its reference design; nothing else should opt into this.
        circle: { value: '9999px' },
      },
    },
    semanticTokens: {
      colors: {
        // v3 requires nested objects (not dot-notation string keys) and {token.path} references
        surface: {
          page: { value: { base: '{colors.ink.950}' } },
          card: { value: { base: '{colors.ink.900}' } },
          cardHover: { value: { base: '#181818' } },
          raised: { value: { base: '{colors.ink.700}' } },
          darkest: { value: { base: '{colors.ink.950}' } },
          // AlbumRatingPage desktop redesign (see docs/decisions/album-rating-page.md). Anchored
          // to the `sand` ramp, not `ink` like the rest of this group — the reference design's
          // card is a distinctly lighter gray than the `surface.card` review cards use
          // elsewhere, an intentional divergence for this page, not an oversight.
          // `ratingCard` (sand.600) is shared by Section 2's border — kept as-is, not repointed,
          // per the retouch pass's explicit instruction not to blindly repoint a shared token.
          // `ratingCardFill` (sand.900) is the card's own background only, corrected in that
          // same retouch pass after the initial sand.600 fill turned out not to match the
          // reference design.
          ratingCard: { value: { base: '{colors.sand.600}' } },
          ratingCardFill: { value: { base: '{colors.sand.900}' } },
          // Fifth pass (same day) correction: `criterionRow` is the resting fill for non-active
          // criteria rows and the criteria-list container — repointed from ink.800 to sand.950,
          // one step darker than the reintroduced `criterionActive` (ink.800) below, so the
          // active row + its level picker read as a lighter highlighted block against the
          // darker resting rows. `criterionHover` (ink.900) unchanged.
          criterionRow: { value: { base: '{colors.sand.950}' } },
          criterionHover: { value: { base: '{colors.ink.900}' } },
          // Reintroduced (fifth pass) at a new value — the fourth pass deleted this token when
          // "active" briefly had no distinct background at all; it's back because active now
          // needs one again, this time ink.800 (not the original sand.900) shared by both the
          // active criteria row and the level picker area next to it.
          criterionActive: { value: { base: '{colors.sand.900}' } },
        },
        border: {
          default: { value: { base: '{colors.gray.600}' } },
          hover: { value: { base: '{colors.gray.400}' } },
          rule: { value: { base: '{colors.ink.800}' } },
          ruleStrong: { value: { base: '{colors.ink.700}' } },
        },
        text: {
          primary: { value: { base: '{colors.sand.200}' } },
          muted: { value: { base: '{colors.sand.500}' } },
          dim: { value: { base: '{colors.sand.300}' } },
        },
        accent: {
          start: { value: { base: '{colors.ember.300}' } },
          end: { value: { base: '{colors.ember.600}' } },
          border: { value: { base: '{colors.ember.500}' } },
          text: { value: { base: '{colors.ember.300}' } },
          ink: { value: { base: '#140a03' } },
        },
        slab: {
          bg: { value: { base: '#f2f2f0' } },
          text: { value: { base: '{colors.ink.950}' } },
        },
        // Registers `ember` as a full colorPalette (contrast/fg/subtle/muted/emphasized/
        // solid/focusRing/border) so `colorPalette: 'ember'` resolves in component
        // recipes (button hover/active/disabled etc.) the same way built-in palettes do.
        // Without this, the raw 50-950 ramp above isn't enough — Chakra's recipes read
        // `colorPalette.solid` etc., not the numbered steps directly.
        ember: {
          contrast: { value: { base: '{colors.accent.ink}' } },
          fg: { value: { base: '{colors.ember.300}' } },
          subtle: { value: { base: '{colors.ember.900}' } },
          muted: { value: { base: '{colors.ember.800}' } },
          emphasized: { value: { base: '{colors.ember.700}' } },
          solid: { value: { base: '{colors.ember.500}' } },
          focusRing: { value: { base: '{colors.ember.500}' } },
          border: { value: { base: '{colors.ember.500}' } },
        },
        // Contextual badge tokens — source, score, genre.
        // Use the exported badge config objects below rather than referencing these directly.
        badge: {
          source: {
            bg:   { value: { base: '{colors.gray.800}' } },
            text: { value: { base: '{colors.purple.100}' } },
          },
          score: {
            bg:   { value: { base: '{colors.purple.300}' } },
            text: { value: { base: '{colors.purple.950}' } },
          },
          genre: {
            bg:   { value: { base: '{colors.whiteAlpha.100}' } },
            text: { value: { base: '{colors.purple.200}' } },
          },
        },
      },
    },
    // Button recipe: compound variants fix hover visibility on dark backgrounds.
    // gray/solid → gray.400 (distinct filled hover)
    // gray/other → whiteAlpha.200 (subtle tint for outline, ghost, etc.)
    recipes: {
      button: {
        compoundVariants: [
          {
            colorPalette: 'gray',
            variant: 'solid',
            css: { _hover: { bg: 'gray.400' } },
          },
          {
            colorPalette: 'gray',
            variant: 'outline',
            css: { _hover: { bg: 'whiteAlpha.200' } },
          },
          {
            colorPalette: 'gray',
            variant: 'surface',
            css: { _hover: { bg: 'whiteAlpha.200' } },
          },
          {
            colorPalette: 'gray',
            variant: 'subtle',
            css: { _hover: { bg: 'whiteAlpha.200' } },
          },
          {
            colorPalette: 'gray',
            variant: 'ghost',
            css: { _hover: { bg: 'whiteAlpha.200' } },
          },
        ],
      },
    },
    // Override slot recipes so overlays (Drawer, Dialog) inherit the dark surface
    // colours without needing per-instance bg/color props. These set only the parts
    // that default to white; all other recipe slots are left at their defaults.
    slotRecipes: {
      drawer: {
        base: {
          content: { bg: 'surface.card', color: 'text.primary' },
        },
      },
      dialog: {
        base: {
          content: { bg: 'surface.card', color: 'text.primary' },
        },
      },
    },
  },
});

// NOTE: v2 components block removed — Input/Select defaultProps and Switch baseStyle
// are replaced by v3 recipes in Steps 3-4 of the Chakra v3 migration.

export default system;

// ---------------------------------------------------------------------------
// Button style sets — import these into StyleGuide or future components.
// Spread onto <Button> to get a consistent primary/secondary look.
// The `variant` prop selects the visual style within each set.
// ---------------------------------------------------------------------------

// All Chakra v3 button variants available for both sets.
export const BUTTON_VARIANTS = ['solid', 'outline', 'surface', 'subtle', 'ghost', 'plain'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

// Primary: ember palette. Works with all variants out of the box.
export const primaryButton = {
  colorPalette: 'ember',
} as const;

// Secondary: gray palette. Hover states are defined in the theme recipe above
// (solid → gray.400, others → whiteAlpha.200) so no prop-level override is needed.
export const secondaryButton = {
  colorPalette: 'gray',
} as const;

// ---------------------------------------------------------------------------
// Contextual badge configs — spread onto <Badge> for consistent app-wide style.
//
// Slant Take treatment (pass 3): source badge and score slab are *flush corner*
// elements. Each carries borders only on the two edges facing into the artwork —
// the other two sit on the card edge and need no rule. This only reads correctly
// when the element is positioned hard into the corner (bottom/left/right = 0);
// inset by even a few px and the partial borders look like an authoring mistake.
// Callers must keep them flush.
//
// The legacy badge.* semantic tokens are no longer referenced here.
// ---------------------------------------------------------------------------

// Source badge — flush bottom-left of card artwork, shows the review site name.
export const sourceBadge = {
  bg: 'surface.page',
  color: 'text.dim',
  borderTop: '2px solid',
  borderTopColor: 'border.rule',
  borderRight: '2px solid',
  borderRightColor: 'border.rule',
  borderRadius: '0',
  fontFamily: 'mono',
  fontSize: '11px',
  fontWeight: '500',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  // Pass 4: padding brought onto the 4px grid alongside genreBadge/scoreSlab.
  px: '8px',
  py: '4px',
} as const;

// Score slab — flush bottom-right of card artwork. Rendered as explicit markup
// with two children (see App.tsx), not as a single-string <Badge>: a large
// display-face number plus a small dimmed mono denominator.
export const scoreSlabBase = {
  bg: 'slab.bg',
  color: 'slab.text',
  borderTop: '2px solid',
  borderTopColor: 'border.rule',
  borderLeft: '2px solid',
  borderLeftColor: 'border.rule',
  borderRadius: '0',
  // Pass 4: padding brought onto the 4px grid alongside sourceBadge/genreBadge.
  px: '12px',
  pt: '8px',
  pb: '4px',
} as const;

// High-score variant. The accent fill is *earned*, not decoration: reserved for
// albums scoring 8.0+ so the orange means something rather than sitting on every
// card. Threshold lives at the call site (SCORE_SLAB_HIGH_THRESHOLD in App.tsx).
export const scoreSlabHigh = {
  ...scoreSlabBase,
  bg: 'accent.border',
  color: 'accent.ink',
} as const;

// Genre tag — inline chip inside the card body, one per genre.
// The 1px border is intentional and deliberately thinner than the 2px structural
// borders used by the flush-corner elements above: inline chips should read
// lighter than structural rules. Do not "fix" this to 2px for consistency.
export const genreBadge = {
  bg: 'transparent',
  color: 'text.dim',
  border: '1px solid',
  borderColor: 'border.ruleStrong',
  borderRadius: '0',
  fontFamily: 'mono',
  fontSize: '11px',
  fontWeight: '500',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  // Pass 4: padding brought onto the 4px grid alongside sourceBadge/scoreSlab.
  px: '8px',
  py: '4px',
} as const;

// Rank overlay badge — favorites row desktop redesign. Flush-corner overlay on the
// artwork thumbnail (bottom-left), structurally modeled on scoreSlabHigh (accent fill,
// 2px structural border, zero radius) but single-node: just "#{rank}", no second
// value node like ScoreSlab's score/denominator pair. Always accent-filled — unlike
// scoreSlabHigh there's no threshold, every rank renders identically.
export const rankOverlayBadge = {
  bg: 'accent.border',
  color: 'accent.ink',
  borderTop: '2px solid',
  borderTopColor: 'border.rule',
  borderRight: '2px solid',
  borderRightColor: 'border.rule',
  borderRadius: '0',
  fontFamily: 'heading',
  fontSize: '14px',
  fontWeight: 400,
  letterSpacing: '0.1em',
  px: '8px',
  py: '4px',
} as const;

// Confidence badge — flush top-right of the favorites-row artwork (rankOverlayBadge already
// owns bottom-left). Deliberately muted (not accent-filled like rankOverlayBadge): this is a
// secondary caveat about the score, not a primary result, so it shouldn't compete visually
// with the rank badge. Modeled on sourceBadge's flush-corner treatment.
export const confidenceBadge = {
  bg: 'surface.page',
  color: 'text.dim',
  borderBottom: '2px solid',
  borderBottomColor: 'border.rule',
  borderLeft: '2px solid',
  borderLeftColor: 'border.rule',
  borderRadius: '0',
  fontFamily: 'mono',
  fontSize: '11px',
  fontWeight: '500',
  letterSpacing: '0.08em',
  px: '8px',
  py: '4px',
} as const;

// Band/album title typography — shared source of truth (design-system-audit-2026-08.md).
// Review card and AlbumRatingPage desktop already matched byte-for-byte before this token
// existed; FavoriteListItemRow desktop/mobile previously used their own smaller literal
// values (15/14px, 16/14px) and now adopt these too. Only the 5 props that make up the
// "title identity" live here — line-height stays per-site since it's a layout concern
// (each site's line count/spacing differs), not a typography-identity one.
// MobileRatingLayout is explicitly excluded (still under active development, out of scope).
export const cardTitleBand = {
  fontFamily: 'body',
  fontSize: '19px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  textTransform: 'uppercase',
} as const;

export const cardTitleAlbum = {
  fontFamily: 'body',
  fontSize: '18px',
  fontWeight: 500,
} as const;
