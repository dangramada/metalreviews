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
  },
  theme: {
    semanticTokens: {
      colors: {
        // v3 requires nested objects (not dot-notation string keys) and {token.path} references
        surface: {
          page: { value: { base: '{colors.gray.900}' } },
          card: { value: { base: '{colors.gray.800}' } },
          raised: { value: { base: '{colors.gray.700}' } },
          darkest: { value: { base: '{colors.gray.900}' } },
        },
        border: {
          default: { value: { base: '{colors.gray.600}' } },
          hover: { value: { base: '{colors.gray.400}' } },
        },
        text: {
          primary: { value: { base: '{colors.white}' } },
          muted: { value: { base: '{colors.gray.500}' } },
          dim: { value: { base: '{colors.gray.400}' } },
        },
        accent: {
          start: { value: { base: '{colors.purple.300}' } },
          end: { value: { base: '{colors.purple.600}' } },
          border: { value: { base: '{colors.purple.500}' } },
          text: { value: { base: '{colors.purple.300}' } },
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

// Primary: purple palette. Works with all variants out of the box.
export const primaryButton = {
  colorPalette: 'purple',
} as const;

// Secondary: gray palette. Hover states are defined in the theme recipe above
// (solid → gray.400, others → whiteAlpha.200) so no prop-level override is needed.
export const secondaryButton = {
  colorPalette: 'gray',
} as const;

// ---------------------------------------------------------------------------
// Contextual badge configs — spread onto <Badge> for consistent app-wide style.
// Tokens live in semanticTokens.colors.badge.* above.
// ---------------------------------------------------------------------------

// Source badge — bottom-left of card artwork, shows the review site name.
export const sourceBadge = {
  bg: 'badge.source.bg',
  color: 'badge.source.text',
  borderRadius: 'base',
  size: 'sm',
  variant: 'solid',
} as const;

// Score badge — bottom-right of card artwork, shows the normalised score string.
export const scoreBadge = {
  bg: 'badge.score.bg',
  color: 'badge.score.text',
  variant: 'solid',
} as const;

// Genre badge — inline tag inside the card body, one per genre.
export const genreBadge = {
  bg: 'badge.genre.bg',
  color: 'badge.genre.text',
  borderRadius: 'base',
  size: 'sm',
} as const;
