import { describe, it, expect } from 'vitest';
import { resolveAlbumIdentity, type AlbumRow } from '../../scripts/ingest';
import type { MusicBrainzData } from '../../scripts/musicbrainz';

const makeId = () => 'generated-id';

function mb(overrides: Partial<MusicBrainzData> = {}): MusicBrainzData {
  return {
    artworkUrl: 'https://cdn.example.com/art.jpg',
    genres: ['black metal'],
    releaseDate: '2024-03-15',
    releaseGroupId: 'mb-release-group-1',
    ...overrides,
  };
}

function album(overrides: Partial<AlbumRow> = {}): AlbumRow {
  return {
    id: 'existing-album-id',
    band: 'Sojourner',
    album: 'Gateways',
    mb_release_group_id: null,
    norm_key: 'sojourner__gateways',
    artwork_url: null,
    genre: [],
    release_date: null,
    ...overrides,
  };
}

describe('resolveAlbumIdentity', () => {
  it('MB-hit / existing-album: attaches to the album already matching the resolved mb_release_group_id', () => {
    const existing = album({ id: 'mb-matched', mb_release_group_id: 'mb-release-group-1' });
    const albumByNormKey = new Map([[existing.norm_key, existing]]);
    const albumByMbId = new Map([[existing.mb_release_group_id as string, existing]]);

    const result = resolveAlbumIdentity(
      'Sojourner',
      'Gateways',
      mb(),
      albumByNormKey,
      albumByMbId,
      makeId
    );

    expect(result.isNewAlbum).toBe(false);
    expect(result.backfilledMbId).toBe(false);
    expect(result.album.id).toBe('mb-matched');
    // Fresh enrichment is still applied on top of the mb-id match.
    expect(result.album.artwork_url).toBe('https://cdn.example.com/art.jpg');
  });

  it('MB-hit / new-album: no mb_release_group_id or norm_key match exists — creates a new album', () => {
    const result = resolveAlbumIdentity(
      'Brand New Band',
      'Debut Album',
      mb({ releaseGroupId: 'mb-release-group-9' }),
      new Map(),
      new Map(),
      makeId
    );

    expect(result.isNewAlbum).toBe(true);
    expect(result.backfilledMbId).toBe(false);
    expect(result.album.id).toBe('generated-id');
    expect(result.album.mb_release_group_id).toBe('mb-release-group-9');
    expect(result.album.artwork_url).toBe('https://cdn.example.com/art.jpg');
  });

  it('MB-hit / norm_key-enrichment: no mb_release_group_id match, but norm_key matches a null-mb-id album — attaches AND backfills', () => {
    const existing = album({
      id: 'norm-key-only',
      mb_release_group_id: null,
      artwork_url: null,
      genre: [],
      release_date: null,
    });
    const albumByNormKey = new Map([[existing.norm_key, existing]]);
    const albumByMbId = new Map<string, AlbumRow>(); // no mb-id match

    const result = resolveAlbumIdentity(
      'Sojourner',
      'Gateways',
      mb({ releaseGroupId: 'mb-release-group-5' }),
      albumByNormKey,
      albumByMbId,
      makeId
    );

    expect(result.isNewAlbum).toBe(false);
    expect(result.backfilledMbId).toBe(true);
    expect(result.album.id).toBe('norm-key-only');
    expect(result.album.mb_release_group_id).toBe('mb-release-group-5');
    expect(result.album.artwork_url).toBe('https://cdn.example.com/art.jpg');
    expect(result.album.genre).toEqual(['black metal']);
    expect(result.album.release_date).toBe('2024-03-15');
  });

  it('MB-miss / norm_key-hit: MB lookup returned nothing, but norm_key matches an existing album — attaches without creating', () => {
    const existing = album({
      id: 'norm-key-existing',
      artwork_url: 'https://old.example.com/art.jpg',
    });
    const albumByNormKey = new Map([[existing.norm_key, existing]]);
    const albumByMbId = new Map<string, AlbumRow>();

    const result = resolveAlbumIdentity(
      'Sojourner',
      'Gateways',
      null, // MB lookup skipped or found nothing
      albumByNormKey,
      albumByMbId,
      makeId
    );

    expect(result.isNewAlbum).toBe(false);
    expect(result.backfilledMbId).toBe(false);
    expect(result.album.id).toBe('norm-key-existing');
    // No fresh mb result — existing row returned untouched.
    expect(result.album.artwork_url).toBe('https://old.example.com/art.jpg');
  });

  it('MB-miss / new-album: MB lookup returned nothing and norm_key has no match — creates a new, unenriched album', () => {
    const result = resolveAlbumIdentity(
      'Totally Obscure Band',
      'Unknown Release',
      null,
      new Map(),
      new Map(),
      makeId
    );

    expect(result.isNewAlbum).toBe(true);
    expect(result.backfilledMbId).toBe(false);
    expect(result.album.id).toBe('generated-id');
    expect(result.album.mb_release_group_id).toBeNull();
    expect(result.album.artwork_url).toBeNull();
    expect(result.album.genre).toEqual([]);
    expect(result.album.release_date).toBeNull();
  });

  it('does not overwrite mb_release_group_id when an mb-id match is found via a different norm_key (edition variant)', () => {
    // e.g. "Circadian Promise" vs "Circadian Promise (Deluxe Edition)" — different norm_key,
    // same release-group per MusicBrainz.
    const existing = album({
      id: 'deluxe-match',
      band: 'Some Band',
      album: 'Circadian Promise (Deluxe Edition)',
      norm_key: 'some band__circadian promise deluxe edition',
      mb_release_group_id: 'shared-release-group',
    });
    const albumByNormKey = new Map([[existing.norm_key, existing]]); // does NOT include this item's norm_key
    const albumByMbId = new Map([[existing.mb_release_group_id as string, existing]]);

    const result = resolveAlbumIdentity(
      'Some Band',
      'Circadian Promise',
      mb({ releaseGroupId: 'shared-release-group' }),
      albumByNormKey,
      albumByMbId,
      makeId
    );

    expect(result.isNewAlbum).toBe(false);
    expect(result.album.id).toBe('deluxe-match');
  });
});
