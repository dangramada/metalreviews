import { describe, expect, it } from 'vitest';
import { buildAotyView, type AotyMember } from '../lib/aoty/aotyView';

const yearOf = (d: string | null) => (d ? parseInt(d.slice(0, 4), 10) : null);
const m = (albumId: string, releaseDate: string | null, createdAt = '2026-01-01'): AotyMember => ({
  albumId,
  band: albumId,
  album: albumId,
  artworkUrl: null,
  releaseDate,
  genre: [],
  publishedAt: null,
  createdAt,
});
const s = (score: number) => ({ score, rank: 0, contributions: new Map<number, number>() });

describe('buildAotyView', () => {
  it('groups by year, latest first, and ranks within each year uniquely', () => {
    const view = buildAotyView(
      [m('a', '2025-01-01'), m('b', '2025-02-01'), m('c', '2026-01-01')],
      new Map([
        ['a', s(0.5)],
        ['b', s(0.7)],
        ['c', s(0.1)],
      ]),
      [],
      true,
      yearOf
    );
    expect(view.years).toEqual([2026, 2025]);
    expect(view.byYear.get(2025)!.map((r) => [r.item.albumId, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(view.byYear.get(2026)![0].rank).toBe(1);
  });

  it('lists members without a score after the ranked ones, unranked', () => {
    const view = buildAotyView(
      [m('a', '2025-01-01'), m('b', '2025-01-01')],
      new Map([['b', s(0.2)]]),
      [],
      true,
      yearOf
    );
    expect(view.byYear.get(2025)!.map((r) => [r.item.albumId, r.rank])).toEqual([
      ['b', 1],
      ['a', undefined],
    ]);
  });

  it('gives no rank numbers and orders by created_at when scores are unavailable', () => {
    const view = buildAotyView(
      [m('old', '2025-01-01', '2026-01-01'), m('new', '2025-01-01', '2026-06-01')],
      new Map([
        ['old', s(0.9)],
        ['new', s(0.1)],
      ]),
      [],
      false,
      yearOf
    );
    expect(view.byYear.get(2025)!.map((r) => [r.item.albumId, r.rank])).toEqual([
      ['new', undefined],
      ['old', undefined],
    ]);
  });

  it('keeps members with no release year, unranked, instead of dropping them', () => {
    const view = buildAotyView([m('x', null)], new Map([['x', s(0.9)]]), [], true, yearOf);
    expect(view.years).toEqual([]);
    expect(view.noYear.map((r) => r.item.albumId)).toEqual(['x']);
    expect(view.noYear[0].rank).toBeUndefined();
  });
});
