import { describe, it, expect } from 'vitest';
import { selectAlbumBackfillCandidates, type AlbumRow } from '../../scripts/ingest';

const NOW = new Date('2026-06-21T12:00:00.000Z');
const RECENT = '2026-06-18T00:00:00.000Z'; // 3 days ago — within 14-day window
const OLD = '2026-06-01T00:00:00.000Z'; // 20 days ago — outside 14-day window

const incompleteAlbum: AlbumRow = {
  id: 'abc',
  band: 'Malist',
  album: 'Eternal Echo of the Fall',
  mb_release_group_id: null,
  norm_key: 'malist__eternal echo of the fall',
  artwork_url: 'https://cdn.example.com/art.jpg',
  genre: ['black metal'],
  release_date: null, // incomplete — missing release_date
};

const completeAlbum: AlbumRow = {
  ...incompleteAlbum,
  id: 'complete',
  release_date: '2026-06-12',
};

function review(
  overrides: Partial<{ id: string; mb_lookup_attempts: number; published_at: string }> = {}
) {
  return {
    id: overrides.id ?? 'r1',
    band: incompleteAlbum.band,
    album: incompleteAlbum.album,
    source: 'Angry Metal Guy',
    score: '8/10',
    normalized_score: 80,
    summary: '',
    url: 'https://example.com',
    published_at: overrides.published_at ?? OLD,
    published_date: '01 Jun 2026',
    album_id: incompleteAlbum.id,
    mb_lookup_attempts: overrides.mb_lookup_attempts ?? 0,
  };
}

describe('selectAlbumBackfillCandidates', () => {
  it('includes an incomplete album with an attached review under the cap', () => {
    const reviewsByAlbumId = new Map([[incompleteAlbum.id, [review({ mb_lookup_attempts: 2 })]]]);
    const result = selectAlbumBackfillCandidates(
      [incompleteAlbum],
      new Set(),
      reviewsByAlbumId,
      NOW
    );
    expect(result.map((a) => a.id)).toContain('abc');
  });

  it('excludes an album whose only attached review is past the cap: attempts >= 5 AND age > 14 days', () => {
    const reviewsByAlbumId = new Map([
      [incompleteAlbum.id, [review({ mb_lookup_attempts: 5, published_at: OLD })]],
    ]);
    const result = selectAlbumBackfillCandidates(
      [incompleteAlbum],
      new Set(),
      reviewsByAlbumId,
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it('includes an album where attempts >= 5 but age <= 14 days (age is the binding constraint)', () => {
    const reviewsByAlbumId = new Map([
      [incompleteAlbum.id, [review({ mb_lookup_attempts: 5, published_at: RECENT })]],
    ]);
    const result = selectAlbumBackfillCandidates(
      [incompleteAlbum],
      new Set(),
      reviewsByAlbumId,
      NOW
    );
    expect(result.map((a) => a.id)).toContain('abc');
  });

  it('includes an album older than 14 days but attempts < 5', () => {
    const reviewsByAlbumId = new Map([
      [incompleteAlbum.id, [review({ mb_lookup_attempts: 4, published_at: OLD })]],
    ]);
    const result = selectAlbumBackfillCandidates(
      [incompleteAlbum],
      new Set(),
      reviewsByAlbumId,
      NOW
    );
    expect(result.map((a) => a.id)).toContain('abc');
  });

  it('is still eligible when one attached review is past the cap but another is not (OR across reviews)', () => {
    const exhausted = review({ id: 'r-exhausted', mb_lookup_attempts: 5, published_at: OLD });
    const fresh = review({ id: 'r-fresh', mb_lookup_attempts: 0, published_at: RECENT });
    const reviewsByAlbumId = new Map([[incompleteAlbum.id, [exhausted, fresh]]]);
    const result = selectAlbumBackfillCandidates(
      [incompleteAlbum],
      new Set(),
      reviewsByAlbumId,
      NOW
    );
    expect(result.map((a) => a.id)).toContain('abc');
  });

  it('excludes an album where all three enrichment fields are present', () => {
    const reviewsByAlbumId = new Map([
      [completeAlbum.id, [review({ id: 'r-complete', mb_lookup_attempts: 0 })]],
    ]);
    const result = selectAlbumBackfillCandidates([completeAlbum], new Set(), reviewsByAlbumId, NOW);
    expect(result).toHaveLength(0);
  });

  it('excludes an album already touched this run (covered by the main resolution loop)', () => {
    const reviewsByAlbumId = new Map([[incompleteAlbum.id, [review({ mb_lookup_attempts: 0 })]]]);
    const result = selectAlbumBackfillCandidates(
      [incompleteAlbum],
      new Set([incompleteAlbum.id]),
      reviewsByAlbumId,
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it('includes an incomplete album with no attached reviews at all (no attempt history)', () => {
    const result = selectAlbumBackfillCandidates([incompleteAlbum], new Set(), new Map(), NOW);
    expect(result.map((a) => a.id)).toContain('abc');
  });

  it('includes an album missing only artwork_url even when genre and release_date are present', () => {
    const noArtwork = {
      ...incompleteAlbum,
      id: 'no-art',
      artwork_url: null,
      release_date: '2026-06-12',
    };
    const reviewsByAlbumId = new Map([
      ['no-art', [review({ id: 'r-no-art', mb_lookup_attempts: 0 })]],
    ]);
    const result = selectAlbumBackfillCandidates([noArtwork], new Set(), reviewsByAlbumId, NOW);
    expect(result.map((a) => a.id)).toContain('no-art');
  });

  it('includes an album missing only genre even when artwork_url and release_date are present', () => {
    const noGenre = { ...incompleteAlbum, id: 'no-genre', genre: [], release_date: '2026-06-12' };
    const reviewsByAlbumId = new Map([
      ['no-genre', [review({ id: 'r-no-genre', mb_lookup_attempts: 0 })]],
    ]);
    const result = selectAlbumBackfillCandidates([noGenre], new Set(), reviewsByAlbumId, NOW);
    expect(result.map((a) => a.id)).toContain('no-genre');
  });
});
