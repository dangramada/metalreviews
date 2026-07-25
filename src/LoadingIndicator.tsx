import { Box } from '@chakra-ui/react';

// Equalizer-bar loading indicator (pass 7) — supersedes pass 6's "marching text"
// (LOADING...). Unified on one visual language used at both section and button scale,
// rather than text at section scale and Chakra's default ring at button scale. See
// docs/decisions/slant-take-design-system.md pass 7 for why.
//
// The bars are three vertically-centered rectangles built from a single element's layered
// `background`, each independently sized via `background-size` and animated in a wave —
// not three separate DOM nodes. `--eq-c` is `currentColor`, so nothing here hardcodes a
// colour: section scale sets it explicitly to `text.primary` (no button to inherit from);
// button scale sets no colour at all, inheriting whatever that specific button's own label
// colour is — see EqualizerBars and LoadingIndicatorBars below for why that's correct
// across every button variant, not just the ones this was checked against.
//
// The `@keyframes slant-take-eqbars` rule this references lives in theme.ts's globalCss,
// not inline here — nesting an `@keyframes` object in the same `css` prop object as a
// `_motionReduce` condition crashes Chakra's prop merge. See theme.ts for the full note.
// Bar thickness (width) is 16% — see theme.ts's keyframes comment; height values driving
// the wave are unrelated and untouched.
const EQ_STATIC_BACKGROUND_SIZE = '16% 50%, 16% 50%, 16% 50%';

// `color` is optional and deliberately NOT defaulted to a token here. Every Button variant
// (solid/subtle/surface/outline/ghost/plain) sets a real CSS `color` on the <button> element
// itself via its recipe (colorPalette.contrast for solid, colorPalette.fg for the rest —
// confirmed by reading button.js's recipe, not assumed), and instance-level overrides like
// the remove-favorite IconButton's `color="text.muted"` land on that same element too.
// `color` is a normally-inherited CSS property, so when EqualizerBars is nested inside a
// button (via Chakra's Loader) with no color prop of its own, `currentColor` in the gradient
// below picks up whatever that specific button is actually rendering its label in — ember,
// text.muted, whatever — automatically, for every variant, with no per-button-type branching
// needed here. Only the section-scale case (no button ancestor) passes an explicit color.
function EqualizerBars({ w, h, color }: { w: string; h: string; color?: string }) {
  return (
    <Box
      aria-hidden="true"
      flexShrink={0}
      w={w}
      h={h}
      color={color}
      css={{
        '--eq-c': 'linear-gradient(currentColor 0 0)',
        background: 'var(--eq-c) 0% 50%, var(--eq-c) 50% 50%, var(--eq-c) 100% 50%',
        backgroundRepeat: 'no-repeat',
        backgroundSize: EQ_STATIC_BACKGROUND_SIZE,
        animation: 'slant-take-eqbars 1s infinite linear alternate',
      }}
      // Bars freeze at the static, even 50%-height frame instead of animating — same
      // principle as pass 6's dots and App.tsx's skeleton fade: motion is never the sole
      // way information is conveyed.
      _motionReduce={{
        animation: 'none',
        backgroundSize: EQ_STATIC_BACKGROUND_SIZE,
      }}
    />
  );
}

// Section scale — reviews grid, favorites list, AuthCallback. 48x64px: the .75 aspect
// ratio of the reference implementation, both dimensions on the 4px grid.
export function LoadingIndicator() {
  return (
    <Box role="status" aria-live="polite" display="inline-flex" alignItems="center">
      {/* No button ancestor to inherit a colour from here, so this is the one call site
          that passes an explicit colour rather than relying on currentColor inheritance. */}
      <EqualizerBars w="48px" h="64px" color="text.primary" />
      {/* The bars are aria-hidden and decorative — unlike pass 6's marching text, an icon
          has no literal content for a screen reader to read. This is the accessible
          content for the section-scale case. */}
      <Box
        position="absolute"
        w="1px"
        h="1px"
        p={0}
        m="-1px"
        overflow="hidden"
        css={{ clip: 'rect(0, 0, 0, 0)' }}
        whiteSpace="nowrap"
        border="0"
      >
        Loading
      </Box>
    </Box>
  );
}

// Button scale — passed as the `spinner` override to Chakra's Button/IconButton `loading`
// prop. Purely decorative (aria-hidden, like the section-scale bars); the accessible name
// while loading comes from `aria-label="Loading"` on the Button itself at each call site
// (see App.tsx/FavoritesPage.tsx/LoginPage.tsx/AuthCallback.tsx) — the button's own visible
// label is hidden (visibility:hidden, not removed) while `loading`, which drops it from the
// accessible-name computation, so nothing announces without the explicit aria-label.
//
// 16x16px: verified live in the browser, not picked and assumed. Checked against the
// widest primary button (320x40 "Log in") — confirmed via getBoundingClientRect() before
// and after triggering `loading` that the button's own box stays exactly 320x40 in both
// states, and the bars render clearly, not crowded. The tightest real context is the
// remove-favorite IconButton at size="sm" — Chakra's button recipe puts that at a fixed
// 36x36px (h/minW: "9" = 2.25rem), not the ~32px eyeballed in pass 7's audit, so 16x16
// (under half the button's box) has clear margin there too, without needing to check it
// directly. The reference's exact 3:4 (48:64) ratio has no 4px-grid pair that both reads as
// distinct bars and fits comfortably at this scale (12x16 is too small to register as three
// separate bars; 24x32 leaves little margin even in the 36px IconButton) — 16x16 (square,
// not 3:4) is the deliberate deviation, in the sizing latitude the brief explicitly left
// open for button scale.
//
// No `color` passed here, deliberately — see EqualizerBars' comment above. Whichever
// button renders this inherits its bars' colour from that button's own label colour.
export function LoadingIndicatorBars() {
  return <EqualizerBars w="16px" h="16px" />;
}
