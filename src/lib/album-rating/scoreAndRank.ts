// Score + rank computation for a fully-rated album (Criteria Calibration, part 6).
// Pure functions only — no Supabase, no React. See docs/decisions/album-rating-drawer.md.

export interface CriterionLevelRating {
  criterionId: number;
  level: number;
}

export interface CriterionLevelWeight {
  criterionId: number;
  level: number;
  value: number;
}

// Sum of the derived preference value for each rated (criterion, level) pair. Returns null
// rather than throwing when a value is missing for one of the ratings — Medium tier is
// expected to guarantee all 30 (criterion, level) combinations are solved, but this is a
// defensive check per the brief, not an assumption.
export function computeScore(
  ratings: CriterionLevelRating[],
  weights: CriterionLevelWeight[]
): number | null {
  const contributions = criterionContributions(ratings, weights);
  if (!contributions) return null;
  let total = 0;
  for (const value of contributions.values()) total += value;
  return total;
}

// Per-criterion weight value for each rated (criterion, level) pair — the terms computeScore
// sums, kept separate so the AOTY tie-break can compare albums criterion by criterion. Same
// null-on-missing-weight contract as computeScore.
export function criterionContributions(
  ratings: CriterionLevelRating[],
  weights: CriterionLevelWeight[]
): Map<number, number> | null {
  const weightMap = new Map<string, number>();
  for (const w of weights) weightMap.set(`${w.criterionId}:${w.level}`, w.value);

  const out = new Map<number, number>();
  for (const r of ratings) {
    const value = weightMap.get(`${r.criterionId}:${r.level}`);
    if (value === undefined) return null;
    out.set(r.criterionId, value);
  }
  return out;
}

export interface ScoredAlbum {
  albumId: string;
  score: number;
}

// 1-based rank of `albumId` among `scoredAlbums`, sorted by score descending. Ties are
// broken by albumId string comparison so ordering is deterministic even though real-valued
// scores make an exact tie unlikely.
export function rankAlbum(albumId: string, scoredAlbums: ScoredAlbum[]): number {
  const sorted = [...scoredAlbums].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.albumId.localeCompare(b.albumId);
  });
  const index = sorted.findIndex((a) => a.albumId === albumId);
  return index + 1;
}

// ---- AOTY ordering (docs/decisions/aoty/aoty-list-implementation.md) ----
// Separate from rankAlbum on purpose: rankAlbum ranks every fully-rated album for the
// Favorites/Rating pages and stays as it was.

// Scores compare equal when they agree to 6 decimals. Scaled to an integer first so the same
// rounding is used for scores and for per-criterion contributions.
const round6 = (x: number) => Math.round(x * 1e6);

// Explicit locale so ordering doesn't vary with the runtime's default locale.
const collator = new Intl.Collator('en');

// Criteria ordered by how much they move this user's scores: spread (max - min) of that
// criterion's level values, descending; equal spread falls back to criterion id ascending.
export function criterionImportanceOrder(weights: CriterionLevelWeight[]): number[] {
  const range = new Map<number, { min: number; max: number }>();
  for (const w of weights) {
    const r = range.get(w.criterionId);
    if (!r) range.set(w.criterionId, { min: w.value, max: w.value });
    else {
      r.min = Math.min(r.min, w.value);
      r.max = Math.max(r.max, w.value);
    }
  }
  return [...range.entries()]
    .map(([id, r]) => ({ id, spread: r.max - r.min }))
    .sort((a, b) => b.spread - a.spread || a.id - b.id)
    .map((c) => c.id);
}

export interface AotyCandidate {
  albumId: string;
  band: string;
  album: string;
  score: number;
  contributions: Map<number, number>;
}

// score desc (6 decimals) -> contribution on the most important criterion, then the next
// (same rounding) -> band, album, albumId. Total order, so the result never depends on the
// input order.
export function compareAotyOrder(criterionOrder: number[]) {
  return (a: AotyCandidate, b: AotyCandidate): number => {
    const byScore = round6(b.score) - round6(a.score);
    if (byScore !== 0) return byScore;
    for (const id of criterionOrder) {
      const diff = round6(b.contributions.get(id) ?? 0) - round6(a.contributions.get(id) ?? 0);
      if (diff !== 0) return diff;
    }
    return (
      collator.compare(a.band, b.band) ||
      collator.compare(a.album, b.album) ||
      collator.compare(a.albumId, b.albumId)
    );
  };
}
