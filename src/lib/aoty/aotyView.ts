import { compareAotyOrder } from '../album-rating/scoreAndRank';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';
import type { FavoriteListItem } from '../../hooks/useFavoritesList';

export interface AotyMember extends FavoriteListItem {
  createdAt: string;
}

export interface AotyRow {
  item: AotyMember;
  // Position among this year's ranked members. Undefined = unranked (no score, no year, or
  // scores unavailable) — such members are listed after the ranked ones, never dropped.
  rank?: number;
}

export interface AotyView {
  years: number[];
  byYear: Map<number, AotyRow[]>;
  noYear: AotyRow[];
}

// Membership is the only persisted state; year, order and rank are all derived here.
// `scoresAvailable` is false for tier 'none' / insufficient data: no rank numbers are shown
// then, and everyone is ordered by created_at (newest first).
export function buildAotyView(
  members: AotyMember[],
  summary: Map<string, AlbumRatingSummary>,
  criterionOrder: number[],
  scoresAvailable: boolean,
  yearOf: (releaseDate: string | null) => number | null
): AotyView {
  const groups = new Map<number, AotyMember[]>();
  const noYearMembers: AotyMember[] = [];
  for (const m of members) {
    const year = yearOf(m.releaseDate);
    if (year === null) {
      noYearMembers.push(m);
      continue;
    }
    const list = groups.get(year) ?? [];
    list.push(m);
    groups.set(year, list);
  }

  const byCreated = (a: AotyMember, b: AotyMember) => b.createdAt.localeCompare(a.createdAt);
  const unranked = (list: AotyMember[]): AotyRow[] =>
    [...list].sort(byCreated).map((item) => ({ item }));

  const byYear = new Map<number, AotyRow[]>();
  for (const [year, list] of groups) {
    if (!scoresAvailable) {
      byYear.set(year, unranked(list));
      continue;
    }
    const scored = list.filter((m) => summary.has(m.albumId));
    const rest = list.filter((m) => !summary.has(m.albumId));
    const cmp = compareAotyOrder(criterionOrder);
    const ranked = scored
      .map((m) => ({
        m,
        c: {
          albumId: m.albumId,
          band: m.band,
          album: m.album,
          score: summary.get(m.albumId)!.score,
          contributions: summary.get(m.albumId)!.contributions,
        },
      }))
      .sort((a, b) => cmp(a.c, b.c))
      .map(({ m }, i): AotyRow => ({ item: m, rank: i + 1 }));
    byYear.set(year, [...ranked, ...unranked(rest)]);
  }

  return {
    years: [...byYear.keys()].sort((a, b) => b - a),
    byYear,
    noYear: unranked(noYearMembers),
  };
}
