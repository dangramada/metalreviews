// Section 1's generated sentence. Tie-handling by leader count, per the brief — the spike's
// edge-case pass found the naive "always name the top two" approach reads as a false distinction
// when four+ criteria are genuinely tied; see
// docs/decisions/criteria-calibration/criteria-calibration-results-tab-design-brief.md's Dataset
// A / Case 1.
import type { CriterionBreakdown } from './resultsBreakdown.js';

// The only sentence with any personality: humor fills the gap where there's no real fact to
// state (a genuine four-way-or-more tie), it never undercuts an actual fact with forced
// positivity. Do not revive the earlier "that's its own kind of taste" draft — reframing a null
// result as a positive trait was rejected during discovery for exactly that reason.
const DEAD_HEAT_SENTENCE = "It's a dead heat up top right now. Annoying, but accurate.";

function joinNaturally(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function buildNarrativeSentence(leaders: CriterionBreakdown[]): string {
  if (leaders.length >= 4) return DEAD_HEAT_SENTENCE;
  const names = leaders.map((l) => l.name.toLowerCase());
  return `Right now, you lean hardest into ${joinNaturally(names)}.`;
}
