// src/__tests__/metalStormBackCatalogue.test.ts
import { describe, it, expect, vi } from 'vitest';
import { filterMetalStormBackCatalogue, getReleaseYear } from '../App';
import { fromAlbumWithReviews, type AlbumWithReviewsRow, type NestedReviewRow } from '../dbMapping';

// App.tsx imports supabaseClient at module load — mock to avoid env-var errors
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

function review(overrides: Partial<NestedReviewRow> = {}): NestedReviewRow {
  return {
    id: overrides.id ?? 'r1',
    source: overrides.source ?? 'Angry Metal Guy',
    score: overrides.score ?? '8/10',
    normalized_score: overrides.normalized_score ?? 80,
    summary: overrides.summary ?? 'A great record.',
    url: overrides.url ?? 'https://example.com/review',
    published_at:
      'published_at' in overrides
        ? (overrides.published_at as string | null)
        : '2026-09-01T00:00:00.000Z',
    published_date: overrides.published_date ?? '01 Sep 2026',
  };
}

function albumRow(overrides: Partial<AlbumWithReviewsRow> = {}): AlbumWithReviewsRow {
  return {
    id: overrides.id ?? 'album-1',
    band: overrides.band ?? 'Some Band',
    album: overrides.album ?? 'Some Album',
    artwork_url: overrides.artwork_url ?? 'https://cdn.example.com/art.jpg',
    release_date: overrides.release_date ?? '2026-06-01',
    genre: overrides.genre ?? ['doom metal'],
    created_at: overrides.created_at ?? '2026-09-01T00:00:00.000Z',
    reviews: overrides.reviews ?? [],
  };
}

describe('filterMetalStormBackCatalogue', () => {
  it('required case: AMG review + excluded back-catalogue Metal Storm review renders as single-source, not multi-source with a gap', () => {
    const row = albumRow({
      release_date: '2010-03-15',
      reviews: [
        review({ id: 'amg-1', source: 'Angry Metal Guy', score: '8/10' }),
        review({
          id: 'ms-1',
          source: 'Metal Storm',
          score: '7/10',
          published_at: '2015-01-01T00:00:00.000Z', // years after release — stale back-catalogue
        }),
      ],
    });

    const [filtered] = filterMetalStormBackCatalogue([row]);
    expect(filtered.reviews).toHaveLength(1);
    expect(filtered.reviews[0].source).toBe('Angry Metal Guy');
    expect(filtered.reviews.map((r) => r.id)).not.toContain('ms-1');

    // Bridges to the actual render decision: fromAlbumWithReviews must see exactly one
    // review (the single-source card layout), not a 2-length array with a hole in it.
    const card = fromAlbumWithReviews(filtered);
    expect(card.reviews).toHaveLength(1);
    expect(card.reviews[0].source).toBe('Angry Metal Guy');
  });

  it('keeps a Metal Storm review published within 12 months of release', () => {
    const row = albumRow({
      release_date: '2026-01-01',
      reviews: [review({ source: 'Metal Storm', published_at: '2026-06-01T00:00:00.000Z' })],
    });
    const [filtered] = filterMetalStormBackCatalogue([row]);
    expect(filtered.reviews).toHaveLength(1);
  });

  it('keeps a Metal Storm review when release_date is null (fail-safe, unchanged)', () => {
    const row = albumRow({
      release_date: null,
      reviews: [review({ source: 'Metal Storm' })],
    });
    const [filtered] = filterMetalStormBackCatalogue([row]);
    expect(filtered.reviews).toHaveLength(1);
  });

  it('keeps a Metal Storm review when published_at is null (fail-safe — gap unknowable)', () => {
    const row = albumRow({
      release_date: '2010-01-01',
      reviews: [review({ source: 'Metal Storm', published_at: null })],
    });
    const [filtered] = filterMetalStormBackCatalogue([row]);
    expect(filtered.reviews).toHaveLength(1);
  });

  it('drops a Metal Storm review published more than 12 months after release', () => {
    const row = albumRow({
      release_date: '2015-01-01',
      reviews: [review({ source: 'Metal Storm', published_at: '2016-06-01T00:00:00.000Z' })],
    });
    const filtered = filterMetalStormBackCatalogue([row]);
    expect(filtered).toHaveLength(0); // zero reviews left -> album row dropped entirely
  });

  it('does not apply the gap rule to non-Metal-Storm sources', () => {
    const row = albumRow({
      release_date: '2015-01-01', // stale gap, but not Metal Storm — rule is source-specific
      reviews: [
        review({ source: 'Angry Metal Guy' }),
        review({ source: 'The Progressive Subway' }),
      ],
    });
    const [filtered] = filterMetalStormBackCatalogue([row]);
    expect(filtered.reviews).toHaveLength(2);
  });

  it('drops the whole album row when its only review is an excluded Metal Storm one', () => {
    const row = albumRow({
      release_date: '2013-11-14',
      reviews: [review({ source: 'Metal Storm', published_at: '2015-01-01T00:00:00.000Z' })],
    });
    const filtered = filterMetalStormBackCatalogue([row]);
    expect(filtered).toHaveLength(0);
  });

  it('leaves a multi-source album with two promptly-reviewed sources as multi-source (no over-filtering)', () => {
    const row = albumRow({
      release_date: '2026-06-01',
      reviews: [review({ id: 'a', source: 'Angry Metal Guy' }), review({ id: 'b', source: 'Metal Storm' })],
    });
    const [filtered] = filterMetalStormBackCatalogue([row]);
    expect(filtered.reviews).toHaveLength(2);
  });

  it('does not hide a same-year review just because today is many months later (gap is release→review, never review→today)', () => {
    // Released and reviewed in the same January; today being in December must not matter —
    // the old calendar-year rule would have gotten this right too, but only by accident.
    const row = albumRow({
      release_date: '2026-01-05',
      reviews: [review({ source: 'Metal Storm', published_at: '2026-01-20T00:00:00.000Z' })],
    });
    const [filtered] = filterMetalStormBackCatalogue([row]);
    expect(filtered.reviews).toHaveLength(1);
  });
});

describe('getReleaseYear', () => {
  it('extracts the year from full, year-month, and year-only dates, and handles null', () => {
    expect(getReleaseYear('2024-03-15')).toBe(2024);
    expect(getReleaseYear('2024-03')).toBe(2024);
    expect(getReleaseYear('2024')).toBe(2024);
    expect(getReleaseYear(null)).toBeNull();
  });
});
