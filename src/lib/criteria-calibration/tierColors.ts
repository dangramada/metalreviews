// Colors for TierAccuracyBadge's two sections, keyed by AccuracyTier. Isolated to this one file
// so the real palette (still undecided — see docs/decisions/deferred-work.md) is a one-file
// swap once Dan picks it, rather than literals scattered across TierAccuracyBadge.tsx and every
// call site.
//
// PLACEHOLDER (2026-09-07): all four tiers share the same neutral gray, deliberately —
// shipping the compound badge's structure now without guessing at a tier-differentiated
// palette the brief explicitly said not to invent. See deferred-work.md for the real-palette
// decision and its intended landing spot (a parallel `badge.tier.*` group next to theme.ts's
// existing `badge.{source,score,genre}` semantic tokens, theme.ts:190-204).

import type { AccuracyTier } from './accuracyTierLabels.js';

export interface TierColorSet {
  /** Left section: solid background, tier label. */
  leftBg: string;
  leftText: string;
  /** Right section: muted background, border only, monospace percentage. */
  rightBg: string;
  rightText: string;
  border: string;
}

const NEUTRAL_PLACEHOLDER: TierColorSet = {
  leftBg: 'gray.700',
  leftText: 'gray.50',
  rightBg: 'gray.900',
  rightText: 'gray.100',
  border: 'gray.600',
};

export const TIER_COLORS: Record<AccuracyTier, TierColorSet> = {
  none: NEUTRAL_PLACEHOLDER,
  medium: NEUTRAL_PLACEHOLDER,
  high: NEUTRAL_PLACEHOLDER,
  veryHigh: NEUTRAL_PLACEHOLDER,
};
