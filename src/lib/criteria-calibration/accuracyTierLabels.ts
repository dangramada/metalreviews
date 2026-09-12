// The ONLY place the user-facing names of the accuracy tiers are written down.
//
// 2026-08-18: the labels moved from a numeric-scale family (Low / Medium / High / Very High)
// to an optical one (Unfocused / Blurry / Clear / Sharp), and — more importantly — what
// ASSIGNS them changed. They are no longer thresholds on a continuous accuracy number; each
// one names how many degrees of trade-off comparison the user has finished. See
// docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md.
//
// WHY A SEPARATE MODULE, and why every display surface must read from it: before this, the
// same four strings were written out in four places — the page's label derivation, the
// checkpoint headline builder, AccuracyStatus's own union type, and useCalibrationGate's
// CONFIDENCE_LABELS for the album-rating pages. Renaming meant finding all four. The internal
// identifiers ('medium' / 'high' / 'veryHigh', and 'none' for the base rung) are deliberately
// UNCHANGED throughout the code, logic, tests and database — only the display strings live
// here, so a future rename touches exactly one file and no logic at all.
//
// COPY CONSTRAINT, load-bearing (see the decision doc's §2b): these labels describe ONLY how
// many degrees of comparison have been completed. They must never be presented as a statement
// about ranking quality or how trustworthy the resulting scores are. The evidence does not
// support that claim for ANY label derivation tried so far — the recalibration report's
// oracle #4 / #8 inversion (best true ranking labelled lowest, a model converged to the wrong
// answer labelled highest) survives the move from thresholds to degrees. It is re-expressed,
// not fixed.

/** Internal tier identifiers. 'none' is the base rung: degree 2 still in progress. */
export type AccuracyTier = 'none' | 'medium' | 'high' | 'veryHigh';

export const ACCURACY_TIER_LABELS: Record<AccuracyTier, string> = {
  none: 'Unfocused',
  medium: 'Blurry',
  high: 'Clear',
  veryHigh: 'Sharp',
};

export type AccuracyTierLabel = (typeof ACCURACY_TIER_LABELS)[AccuracyTier];

export function accuracyTierLabel(tier: AccuracyTier): string {
  return ACCURACY_TIER_LABELS[tier];
}

/** The badge's own explanation of itself, shown on hover wherever TierAccuracyBadge renders
 *  (the tab row and every checkpoint). It lives here rather than in checkpointCopy.ts, where it
 *  started, because it stopped being checkpoint copy the moment the badge became the trigger.
 *
 *  It is bound by this file's copy constraint above, and the second clause is where that bites:
 *  the percentage (computeScoreSpreadAccuracy) measures how far your answers have NARROWED the
 *  range of weightings still consistent with them. That is determinacy, not correctness — a
 *  model converged on the wrong ranking scores high, which is exactly the inversion the
 *  recalibration report found. "How settled your weighting is" is therefore the strongest claim
 *  the evidence supports; anything about accuracy, confidence or trustworthiness is not.
 *
 *  It also says the two halves are different KINDS of measurement — the names count levels
 *  finished, the number moves continuously inside one — since they share a border and otherwise
 *  look like one reading split in two. */
export const TIER_BADGE_TOOLTIP =
  'Each name is a deeper level of comparison finished; the percentage is how settled your weighting is within that level.';
