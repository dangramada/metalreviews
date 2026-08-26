// Degree-tied accuracy tiers and the segmented per-degree progress bar (2026-08-18).
// Decision + evidence: docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md.
//
// WHAT CHANGED, AND WHY IT IS NOT A RETUNING. Until now the user-facing tier was a threshold on
// computeScoreSpreadAccuracy (SCORE_SPREAD_MEDIUM/HIGH/VERY_HIGH_THRESHOLD). The empirical
// recalibration (criteria-calibration-accuracy-threshold-recalibration.md) tested six quality
// bars across 12 traces and found SIX EMPTY threshold windows — not badly-placed constants, but
// a quantity that behaves well within a session and is not comparable across sessions. Rather
// than pick a seventh triple, the tier is now assigned by WHICH DEGREE OF TRADE-OFF the user has
// finished, following 1000minds' own documented model ("Medium — at least all 2-attribute
// trade-offs answered", see criteria-calibration-1000minds-comparative-research.md).
//
// The accuracy PERCENTAGE is unchanged, still computed by computeScoreSpreadAccuracy, and still
// shown continuously next to the label. Only what picks the LABEL moved.
//
// WHAT THIS DOES NOT FIX, stated here because the temptation to "improve" it will recur: a
// degree boundary is NOT a better predictor of ranking quality. Measured by the recalibration
// report's own false-positive test, degree boundaries fail on the same traces thresholds failed
// on (5/10 false positives at tau >= 0.80, never firing on 4/10). Oracle #4 has the best true
// ranking in the evidence set and would sit on the base rung after 90 answers; oracle #8
// converges to the wrong model and would read Sharp. The justification for degree-tying is
// different in kind: a boundary is a FACT about the answer log — "every trade-off this model can
// distinguish at this level of detail has been asked" — which is true by construction, where a
// threshold crossing was an estimate of a hidden quantity that turned out not to generalise.
// This is why the copy rule in accuracyTierLabels.ts is not negotiable.
//
// THE MAPPING'S EVIDENCE, honestly graded:
//   degree 2 exhausted -> 'medium'   strong. The one real step: tau +0.173 / +0.182 on the two
//                                    clean oracles, accuracy +0.11 to +0.15 on all five traces
//                                    that reached it.
//   degree 3 exhausted -> 'high'     weak. No measured tau gain (-0.03 to +0.04). Justified by
//                                    1000minds parity and by determinacy completing at degree 4
//                                    on oracle #8 and the real B71 session.
//   degree 4 exhausted -> 'veryHigh' none beyond 'high'. Degrees 5 and 6 change tau by <= 0.04
//                                    non-monotonically and accuracy by <= 0.001 on every trace
//                                    that reached them, which is why they get NO further label —
//                                    the same conclusion criteria-calibration-additive-model-
//                                    degree-sufficiency.md reached from the model's structure.
//
// Do not add a fifth rung for degree 5 or 6 without new evidence. There is nothing there to name.

import { MAX_VALUE_RANGE_FOR_COVERAGE } from './elicitationDriver.js';
import { profileDegree, type Profile } from './preferenceGraph.js';
import type { LevelValue } from './solver.js';
import type { AccuracyTier } from './accuracyTierLabels.js';

/** Degree every session starts at. Degree 2 is the starting point, not an escalation. */
export const STARTING_DEGREE = 2;

/**
 * The tier for a session that has fully exhausted every degree up to and including
 * `highestCompletedDegree`. Pass a number below STARTING_DEGREE (or 0) for "nothing completed
 * yet" — degree 2 still in progress, which is the base rung.
 *
 * Capped at 'veryHigh': completing degrees 5 and 6 does not promote past Sharp, per the module
 * header's evidence table.
 */
export function tierForCompletedDegrees(highestCompletedDegree: number): AccuracyTier {
  if (highestCompletedDegree >= 4) return 'veryHigh';
  if (highestCompletedDegree === 3) return 'high';
  if (highestCompletedDegree === 2) return 'medium';
  return 'none';
}

/**
 * How many degrees the session has finished, derived from the two things the page already
 * knows: the degree it is currently asking at, and whether the driver has reported that degree
 * exhausted.
 *
 * Being AT degree d is itself proof that degrees 2..d-1 were exhausted — the driver only ever
 * escalates on a `degree-exhausted` action, and a resumed session's degree is inferred from the
 * highest degree it actually answered at. Sitting ON a boundary adds the current degree.
 */
export function completedDegrees(currentDegree: number, atDegreeBoundary: boolean): number {
  return atDegreeBoundary ? currentDegree : currentDegree - 1;
}

/** Convenience: the tier implied by the page's current position. */
export function tierForPosition(currentDegree: number, atDegreeBoundary: boolean): AccuracyTier {
  return tierForCompletedDegrees(completedDegrees(currentDegree, atDegreeBoundary));
}

/**
 * Which degrees get a checkpoint screen. Degree 6 exhausts without a screen of its own here:
 * it is always terminal (no degree 7 to escalate to for this catalog), which the page routes to
 * a different, separately-handled screen with different copy.
 *
 * Degree 5 WAS silent (auto-escalated with no screen) before the 2026-08-26 checkpoint copy
 * rewrite (criteria-calibration-checkpoint-copy-rewrite). The tier truly does not change at
 * degree 5 (see the module header — it stays 'veryHigh', same as degree 4), but "the tier
 * doesn't change" stopped being a reason to hide the screen once the checkpoint's own badge
 * became permanently visible: a badge that's honestly still Sharp is not noise, and skipping
 * degree 5's boundary made it the only degree whose completion the user could never see marked
 * at all. See CalibrationCheckpoint.tsx's 'veryHigh' variant (now shared by both degree 4 and
 * degree 5 exhaustion, same "ceiling" copy for both) and the copy-rewrite decision doc.
 */
export function isLabelChangingDegree(degree: number): boolean {
  return degree === 2 || degree === 3 || degree === 4 || degree === 5;
}

/**
 * The fifth checkpoint's freeze-detection threshold (criteria-calibration-freeze-checkpoint,
 * Step 2a) — empirically derived, not guessed. Four preference shapes (#2 single-dominant, #4
 * linear-control, #5 front-loaded, #6 back-loaded) never reach `isDegreeCoverageComplete` at
 * degree 2 in 90 simulated rounds; the other eight traces in the evidence set all exit degree 2
 * by round 77 at the latest (`#10 dan-approximation`). This constant is 77 + 1: the smallest
 * round-position threshold that does not false-trigger on any of those eight healthy
 * trajectories. See criteria-calibration-freeze-checkpoint.md's Step 2a table for the full
 * per-trace exit-round data and why POSITION, not freeze-run LENGTH, is the discriminator (a
 * healthy trace, `#3 zero-weight-criterion`, has a 28-round freeze that still resolves; a
 * blocked trace, `#4 linear-control`, has a shorter 23-round max freeze that never resolves —
 * length alone gets the two groups backwards).
 *
 * Counts ANSWERS LOGGED AT DEGREE 2 specifically (not total answers, though for the normal flow
 * before any escalation the two are identical), so it stays correct if the session's degree
 * were ever to revisit 2 after Undo.
 */
export const DEGREE_2_FREEZE_ANSWER_THRESHOLD = 78;

/**
 * True once the session has given at least `DEGREE_2_FREEZE_ANSWER_THRESHOLD` answers at degree
 * 2 without the driver ever reporting it exhausted. Deliberately does NOT take
 * `atDegreeBoundary` — a real degree-2 boundary (coverage-complete OR pool-empty) is mutually
 * exclusive with this being true, by construction of the threshold's safety margin (see the
 * constant's own comment): every healthy trace already exits degree 2 well before round 78, so
 * a session that is STILL at degree 2, unexhausted, at answer 78 is presumptively one of the
 * four blocked shapes, not a session about to resolve on its own.
 *
 * Scoped to degree 2 only, per the brief — this is not a general "any degree can freeze"
 * detector, and should not be generalized to other degrees without new evidence, the same
 * caution as `isLabelChangingDegree`'s module-header note about not adding rungs without data.
 */
export function isDegree2Frozen(currentDegree: number, answersAtCurrentDegree: number): boolean {
  return currentDegree === 2 && answersAtCurrentDegree >= DEGREE_2_FREEZE_ANSWER_THRESHOLD;
}

/**
 * Continuous within-degree fill, 0..1, for the progress bar's current segment.
 *
 * This reads exactly the gate that ends a degree — elicitationDriver's isDegreeCoverageComplete
 * — but continuously instead of as a step. Per free (criterion, level) variable:
 *
 *   touched at THIS degree ? clamp01((1 - width) / (1 - MAX_VALUE_RANGE_FOR_COVERAGE)) : 0
 *
 * so a variable sitting exactly at the gate's own width contributes 1, a fully undetermined one
 * (width 1 on the normalised 0..1 value scale) contributes 0, and the mean reaches 1.0 EXACTLY
 * when isDegreeCoverageComplete would return true. Same gate, same constant, no new threshold.
 *
 * WHY NOT THE DISCRETE COUNT (covered / 24), which the brief originally specified: it is a step
 * function of a threshold, so it only moves when a variable crosses 0.2. Measured over 945
 * replayed rounds, that froze the bar for up to 64 consecutive answers — and permanently, to the
 * end of the session, on three of twelve traces. The continuous read cuts the worst freeze to 18
 * answers and every end-of-session freeze to at most 3, while being monotone over the same 945
 * rounds and producing identical values at the segment seams. See the decision doc's §4a/§4b.
 *
 * `touched` is scoped to answers logged AT `degree`, matching the 2026-08-11 degree-scoped
 * coverage fix (criteria-calibration-degree-scoped-coverage-fix.md); widths are global across
 * the whole answer log, since range-narrowing is genuine cross-degree evidence. Both halves
 * deliberately mirror isDegreeCoverageComplete rather than reinterpreting it.
 */
export function computeDegreeCoverageFill(
  levelsPerCriterion: number[],
  values: LevelValue[][],
  answers: readonly { profileA: Profile; profileB: Profile }[],
  degree: number
): number {
  const touched = levelsPerCriterion.map((max) => new Array<boolean>(max + 1).fill(false));
  for (const answer of answers) {
    if (profileDegree(answer.profileA) !== degree) continue;
    for (const profile of [answer.profileA, answer.profileB]) {
      for (const key of Object.keys(profile)) {
        touched[Number(key)][profile[Number(key)]] = true;
      }
    }
  }

  let total = 0;
  let count = 0;
  for (let c = 0; c < levelsPerCriterion.length; c++) {
    for (let level = 2; level <= levelsPerCriterion[c]; level++) {
      count++;
      if (!touched[c][level]) continue;
      const v = values[c][level];
      const width = v.max - v.min;
      const fill = (1 - width) / (1 - MAX_VALUE_RANGE_FOR_COVERAGE);
      total += Math.max(0, Math.min(1, fill));
    }
  }
  return count === 0 ? 1 : total / count;
}

/** What the monotone clamp needs to remember between renders. */
export interface FillClampState {
  degree: number;
  answerCount: number;
  fill: number;
}

/**
 * Monotone clamp for the within-degree fill: never let the bar move backwards inside a degree.
 *
 * DEFENSIVE, not a fix for something observed — replaying all 12 evidence traces (945 rounds)
 * produced zero within-degree decreases, which is what the LP's geometry predicts, since more
 * answers means more constraints means a smaller feasible region. It exists because the solver
 * is slack-tolerant, so an inconsistent answer relaxing a binding constraint is not provably
 * impossible, and a progress bar that goes backwards reads as a bug even when the number under
 * it is right.
 *
 * It deliberately does NOT hold the bar up across an Undo. The clamp guards against the solver
 * reporting a wider range for the SAME evidence; a user removing an answer is a real retreat,
 * and holding the old value would leave the bar claiming coverage the log no longer supports.
 * Tracked by answer count so that reset is exact rather than heuristic. A degree change resets
 * it too — each degree gets its own segment and its own fill.
 */
export function clampFillMonotone(previous: FillClampState | null, next: FillClampState): number {
  if (!previous) return next.fill;
  if (previous.degree !== next.degree) return next.fill;
  if (next.answerCount < previous.answerCount) return next.fill;
  return Math.max(previous.fill, next.fill);
}

/**
 * Whole-session progress, 0..100. One equal segment per degree the session can visit — degrees
 * 2..numCriteria, so 5 segments of 20% for the production 6-criterion catalog, derived rather
 * than hardcoded so a different catalog shape stays correct.
 *
 * The seam is exact, not approximate: a degree ends only when the coverage gate is satisfied, at
 * which point `fill` is 1.0 by construction, so the last frame of degree d reads (d-2)*S + S =
 * (d-1)*S — the first frame of degree d+1. Verified across all 18 exhaustion boundaries in the
 * replayed evidence set.
 *
 * PACING IS DELIBERATELY UNEVEN and should not be "fixed". Degree 2 is 34-100% of a real
 * session's answers but worth one segment; later degrees are progressively cheaper (oracle #1
 * spends 30 answers on segment 1 and 7 on segment 5). That reflects the truth that the first
 * degree carries most of the information.
 */
export function computeProgressPercent(
  currentDegree: number,
  fill: number,
  numCriteria: number
): number {
  const segments = Math.max(1, numCriteria - STARTING_DEGREE + 1);
  const segmentSize = 100 / segments;
  const completed = Math.max(0, currentDegree - STARTING_DEGREE);
  const raw = completed * segmentSize + Math.max(0, Math.min(1, fill)) * segmentSize;
  return Math.max(0, Math.min(100, raw));
}
