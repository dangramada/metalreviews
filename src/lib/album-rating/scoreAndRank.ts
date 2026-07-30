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
  const weightMap = new Map<string, number>();
  for (const w of weights) weightMap.set(`${w.criterionId}:${w.level}`, w.value);

  let total = 0;
  for (const r of ratings) {
    const value = weightMap.get(`${r.criterionId}:${r.level}`);
    if (value === undefined) return null;
    total += value;
  }
  return total;
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
