// User-facing copy for every calibration checkpoint screen — single source of truth, same
// pattern as accuracyTierLabels.ts. Rewritten 2026-08-26
// (criteria-calibration-checkpoint-copy-rewrite) to replace the longer, more justificatory
// 2026-08-18 copy. See docs/decisions/criteria-calibration/criteria-calibration-checkpoint-copy-rewrite.md
// for the full rationale; the load-bearing rules are restated here since they constrain any
// future edit to these strings:
//
//   1. No em dashes.
//   2. Never say "label" as a noun in body text — the tier name is a badge, seen not read
//      about. Speak to the user directly instead ("you won't get any clearer than this").
//   3. The accuracy percentage never appears bare — always attached to an explicit subject
//      ("you're {accuracy}% clear on what matters most to you", never a lone "{accuracy}%").
//   4. No phrasing that reads as failure or wasted effort at a low percentage, even at the top
//      tier (Sharp at 60% is a real, valid outcome — the percentage measures how DETERMINATE
//      the preference model is, not how well the user answered).
//   5. Pausing is always mentioned, but as the last sentence, short, never parenthetical and
//      never equal in weight to the reason to continue.
//   6. At most 3 short CONTENT sentences per body, not counting the trailing pause sentence
//      (which is separate, per rule 5, and always present except on the terminal screen, which
//      has no pause option to mention). So a body reads as at most 4 sentences total when a
//      pause sentence applies, 3 when it doesn't (terminal only).
//
// Each body is a single string (one paragraph, sentences joined with spaces) — not an array of
// stacked paragraphs like the pre-rewrite copy. The four screens read as one continuous thought,
// per the brief's own formatting.

/** Shown next to every checkpoint's tier badge, every time — the badge is now permanently
 *  visible (previously conditional), so the explanation of what it means travels with it. */
export const CHECKPOINT_TIER_TOOLTIP =
  'Unfocused, Blurry, Clear, Sharp. Each one means a deeper level of comparison finished.';

// ---------------------------------------------------------------------------------------
// Tip 1 — a degree boundary that PROMOTES the tier (degree-2 exhaustion -> Blurry, degree-3
// exhaustion -> Clear). The badge shown alongside this copy is the tier just reached.
// ---------------------------------------------------------------------------------------
export const CHECKPOINT_PROMOTION_HEADLINE = "You've compared everything at this level";

export function checkpointPromotionBody(accuracyPercent: number): string {
  return [
    `So far, you're ${accuracyPercent}% clear on what matters most to you.`,
    "A few more comparisons and you'll feel the difference.",
    'Pausing is always an option.',
  ].join(' ');
}

// ---------------------------------------------------------------------------------------
// Tip 2 — a degree boundary at the tier CEILING: degree-4 exhaustion (just reached Sharp) and
// degree-5 exhaustion (already Sharp, staying Sharp). Same copy for both: neither promises a
// tier change from continuing, only a sharper percentage. The badge shown is always Sharp.
// ---------------------------------------------------------------------------------------
export const CHECKPOINT_CEILING_HEADLINE = "You've compared everything at this level";

export function checkpointCeilingBody(accuracyPercent: number): string {
  return [
    `You're ${accuracyPercent}% clear on what matters most to you.`,
    'Continuing still sharpens that number.',
    'Pausing is always an option.',
  ].join(' ');
}

// ---------------------------------------------------------------------------------------
// Tip 3 — terminal exhaustion (degree 6, nothing left to escalate to). No pause sentence: there
// is nothing left to pause before, only to finish. Single button, no Continue.
// ---------------------------------------------------------------------------------------
export const CHECKPOINT_TERMINAL_HEADLINE = "You've compared everything, at every level";

export function checkpointTerminalBody(accuracyPercent: number): string {
  return [
    `You're ${accuracyPercent}% clear on what matters most to you.`,
    "That's as far as comparisons can take it.",
  ].join(' ');
}

// ---------------------------------------------------------------------------------------
// Tip 4 — the freeze checkpoint (criteria-calibration-freeze-checkpoint branch owns the trigger
// condition; this file owns only the copy). Fires while STILL at degree 2, not at a boundary —
// the badge shown is whatever the current tier actually is (typically 'none'/Unfocused, since
// coverage never completed), not a tier just reached. Framed around INFORMATION, never around
// "ran out of questions" — the degree-2 candidate pool is NOT empty when this fires (see
// criteria-calibration-freeze-checkpoint-step1-pool-check.md), so any "exhausted the questions"
// framing would be false.
// ---------------------------------------------------------------------------------------
export const CHECKPOINT_FROZEN_HEADLINE = 'Your answers have stopped narrowing this down';

export function checkpointFrozenBody(accuracyPercent: number): string {
  return [
    `You're ${accuracyPercent}% clear on what matters most to you.`,
    "Your recent answers aren't adding much more at this level.",
    "Moving to the next level can sometimes reveal what this one can't.",
    'Pausing is always an option.',
  ].join(' ');
}

// ---------------------------------------------------------------------------------------
// Buttons — shared across the non-terminal screens (equal visual weight, side by side) and the
// one terminal screen (single button).
// ---------------------------------------------------------------------------------------
export const CHECKPOINT_CONTINUE_BUTTON = 'Continue';
export const CHECKPOINT_PAUSE_BUTTON = 'Pause here';
export const CHECKPOINT_DONE_BUTTON = 'Done, evaluate albums';
