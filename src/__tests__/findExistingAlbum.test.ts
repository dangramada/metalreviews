// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeNormKey } from '../../scripts/normalizeKey';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../supabaseClient';
import { findExistingAlbum } from '../FavoritesPage';

const matchRow = {
  id: 'existing-album-1',
  band: 'Opeth',
  album: 'Blackwater Park',
  artwork_url: 'https://example.com/art.jpg',
  genre: ['progressive metal'],
  release_date: '2001-03-16',
};

// Builds a supabase.from('albums').select(...).eq(...).maybeSingle() mock.
// byMbId / byNormKey each independently control what their respective .eq() branch returns —
// the mock inspects which column .eq() was called with to route to the right result.
function makeAlbumsFromImpl(options: {
  byMbId?: typeof matchRow | null;
  byNormKey?: typeof matchRow | null;
}) {
  const { byMbId = null, byNormKey = null } = options;
  return (table: string) => {
    if (table !== 'albums') throw new Error(`unexpected table ${table}`);
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation((column: string) => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: column === 'mb_release_group_id' ? byMbId : byNormKey,
            error: null,
          }),
        })),
      }),
    };
  };
}

describe('findExistingAlbum', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches by mb_release_group_id first, without checking norm_key', async () => {
    vi.mocked(supabase.from).mockImplementation(makeAlbumsFromImpl({ byMbId: matchRow }));
    const result = await findExistingAlbum('mb-release-group-123', 'Opeth', 'Blackwater Park');
    expect(result).toMatchObject({
      albumId: 'existing-album-1',
      band: 'Opeth',
      album: 'Blackwater Park',
      artworkUrl: 'https://example.com/art.jpg',
      genre: ['progressive metal'],
      releaseDate: '2001-03-16',
    });
  });

  it('falls back to norm_key when no release-group id was resolved', async () => {
    vi.mocked(supabase.from).mockImplementation(makeAlbumsFromImpl({ byNormKey: matchRow }));
    const result = await findExistingAlbum(null, 'Opeth', 'Blackwater Park');
    expect(result?.albumId).toBe('existing-album-1');
  });

  it('falls back to norm_key when a release-group id was given but found no match', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeAlbumsFromImpl({ byMbId: null, byNormKey: matchRow })
    );
    const result = await findExistingAlbum('mb-release-group-999', 'Opeth', 'Blackwater Park');
    expect(result?.albumId).toBe('existing-album-1');
  });

  it('returns null when neither key matches', async () => {
    vi.mocked(supabase.from).mockImplementation(makeAlbumsFromImpl({}));
    const result = await findExistingAlbum(null, 'Some New Band', 'Some New Album');
    expect(result).toBeNull();
  });

  it('computes the norm_key from the given band/album for the fallback lookup', async () => {
    const eqSpy = vi.fn().mockImplementation(() => ({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table !== 'albums') throw new Error(`unexpected table ${table}`);
      return { select: vi.fn().mockReturnValue({ eq: eqSpy }) };
    });
    await findExistingAlbum(null, 'St. Louis', 'A Dark Poem, Part II');
    expect(eqSpy).toHaveBeenCalledWith('norm_key', computeNormKey('St. Louis', 'A Dark Poem, Part II'));
  });
});
