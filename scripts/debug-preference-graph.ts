// Terminal debug tool for the Criteria Calibration preference graph.
//
// Feeds the historical-shape fixture (see src/lib/criteria-calibration/fixtures.ts) through
// the graph in degree-ramp order, and reports how many comparisons at each degree were
// actually inserted ("asked") versus already implied by the closure at that point
// ("skipped"). This is meant to be checked by eye against a real session's known counts —
// it does not touch Supabase, React, or any other production data source.
//
// Run with: npx tsx scripts/debug-preference-graph.ts

import { PreferenceGraph } from '../src/lib/criteria-calibration/preferenceGraph.js';
import {
  buildHistoricalFixture,
  DEFAULT_FIXTURE_CONFIG,
} from '../src/lib/criteria-calibration/fixtures.js';

const graph = new PreferenceGraph({
  numCriteria: DEFAULT_FIXTURE_CONFIG.numCriteria,
  levelsPerCriterion: DEFAULT_FIXTURE_CONFIG.levelsPerCriterion,
});

const rounds = buildHistoricalFixture();

const stats = new Map<number, { asked: number; skipped: number }>();

for (const round of rounds) {
  const entry = stats.get(round.degree) ?? { asked: 0, skipped: 0 };
  const implied = graph.isImplied(round.profileA, round.profileB);
  if (implied.implied) {
    entry.skipped++;
  } else {
    graph.insertAnswer(round.profileA, round.profileB, round.result);
    entry.asked++;
  }
  stats.set(round.degree, entry);
}

console.log('Criteria Calibration preference graph — debug run');
console.log(
  `Fixture: ${rounds.length} total rounds, ${DEFAULT_FIXTURE_CONFIG.numCriteria} criteria x ${DEFAULT_FIXTURE_CONFIG.levelsPerCriterion} levels\n`
);

const degrees = [...stats.keys()].sort((a, b) => a - b);
console.log('degree | asked | skipped | total');
console.log('-------|-------|---------|------');
let totalAsked = 0;
let totalSkipped = 0;
for (const degree of degrees) {
  const { asked, skipped } = stats.get(degree)!;
  totalAsked += asked;
  totalSkipped += skipped;
  console.log(
    `${String(degree).padEnd(6)} | ${String(asked).padEnd(5)} | ${String(skipped).padEnd(7)} | ${asked + skipped}`
  );
}
console.log('-------|-------|---------|------');
console.log(
  `${'total'.padEnd(6)} | ${String(totalAsked).padEnd(5)} | ${String(totalSkipped).padEnd(7)} | ${totalAsked + totalSkipped}`
);
