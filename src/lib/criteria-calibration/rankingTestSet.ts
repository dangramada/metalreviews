// ---------------------------------------------------------------------------------------
// Ranking stability test set (2026-08-11) — Dan's own account
// (eec42cd4-e714-46a2-ad9c-35714a1d3a2c), pulled read-only from album_criteria_ratings: every
// album with all 6 criteria rated at the time of the query. Frozen, hardcoded set — not
// regenerated from live data — same convention as REAL_PRODUCTION_SESSION_ANSWERS in
// fixtures.ts. Single-user project, Dan's own data, embedded directly per the same prior
// sign-off basis as that fixture.
//
// Originally used by rankingStabilityLog.ts (removed — its diagnostic session is complete)
// to validate MEDIUM_ACCURACY_THRESHOLD as an auto-stop point; those snapshots are the
// evidentiary basis for docs/decisions/criteria-calibration-ranking-stability-analysis.md.
//
// As of Brief 3 (2026-08-14), IS consumed by production code: useRankingTestSetRatings.ts
// fetches these 13 albums' criteria ratings on every Criteria Calibration page load, feeding
// rankingStabilitySignal.ts's computeTop10Set/advanceStabilityWindow — the auto-escalation
// stop signal itself, not just historical evidence anymore.
// ---------------------------------------------------------------------------------------

export interface RankingTestAlbum {
  albumId: string;
  name: string;
  band: string;
}

export const RANKING_TEST_SET: RankingTestAlbum[] = [
  { albumId: '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3', name: 'Graveyards of Joy', band: 'TodoMal' },
  { albumId: '53197803-17b8-41a3-8ba5-de1932edfb99', name: 'A Tranquil Void', band: 'Urzah' },
  { albumId: 'b8a3b8a8-105a-496f-aaff-0fc942460b0b', name: 'For Eternity', band: 'Black Sites' },
  { albumId: 'e44ffad1-8763-48b6-819d-5d2c6df576c6', name: 'Ghosts of Europa', band: 'Mortiis' },
  { albumId: '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3', name: 'In Somnolent Ruin', band: 'Draconian' },
  {
    albumId: '9867b457-c406-4955-8576-b692a26555f0',
    name: 'House Of Mirrors',
    band: 'All Them Witches',
  },
  {
    albumId: '74f55ca7-59df-45e6-9b98-ddd52bd27669',
    name: 'Estuary',
    band: 'Electric Sun Defence',
  },
  { albumId: '2cb7d5e6-de25-45f7-9e35-f64c8fd41321', name: 'Yūgen', band: 'Kolm' },
  {
    albumId: '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
    name: 'Against All Warnings',
    band: 'W.M.D.',
  },
  {
    albumId: '2af5876e-26eb-4fdf-910f-dc48657c5959',
    name: 'Cycles In The Infinite Dream',
    band: 'Rezn',
  },
  {
    albumId: 'f53bda1f-a118-4ee7-be66-69a82b211914',
    name: 'Infinitude’s Passage',
    band: 'Ænigmatum',
  },
  { albumId: '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf', name: 'Descent', band: 'Immolation' },
  {
    albumId: '8107a1c4-56f7-481c-87ad-c3025320316e',
    name: 'The Triumph of Time and the Disillusioned',
    band: 'Labor of the Negative',
  },
];
