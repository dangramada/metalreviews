import { describe, it, expect } from 'vitest';
import { applyAlbumEnrichment, type AlbumRow } from '../../scripts/ingest';
import type { MusicBrainzData } from '../../scripts/musicbrainz';

const baseAlbum: AlbumRow = {
  id: 'abc',
  band: 'Opeth',
  album: 'Blackwater Park',
  mb_release_group_id: null,
  norm_key: 'opeth__blackwater park',
  artwork_url: 'https://cdn.example.com/art.jpg',
  genre: ['progressive metal', 'death metal'],
  release_date: null,
};

const baseFresh: MusicBrainzData = {
  artworkUrl: 'https://new.example.com/art.jpg',
  genres: ['doom metal'],
  releaseDate: null,
  releaseGroupId: null,
};

describe('applyAlbumEnrichment', () => {
  it('uses fresh artworkUrl when it is a non-null string', () => {
    const result = applyAlbumEnrichment(baseAlbum, {
      ...baseFresh,
      artworkUrl: 'https://new.example.com/art.jpg',
    });
    expect(result.artwork_url).toBe('https://new.example.com/art.jpg');
  });

  it('keeps existing artwork_url when fresh artworkUrl is null', () => {
    const result = applyAlbumEnrichment(baseAlbum, { ...baseFresh, artworkUrl: null });
    expect(result.artwork_url).toBe('https://cdn.example.com/art.jpg');
  });

  it('uses null artwork_url when fresh is null and there is no existing value', () => {
    const noArt = { ...baseAlbum, artwork_url: null };
    const result = applyAlbumEnrichment(noArt, { ...baseFresh, artworkUrl: null });
    expect(result.artwork_url).toBeNull();
  });

  it('uses fresh genre when it is non-empty', () => {
    const result = applyAlbumEnrichment(baseAlbum, { ...baseFresh, genres: ['doom metal'] });
    expect(result.genre).toEqual(['doom metal']);
  });

  it('keeps existing genre when fresh genre is empty', () => {
    const result = applyAlbumEnrichment(baseAlbum, { ...baseFresh, genres: [] });
    expect(result.genre).toEqual(['progressive metal', 'death metal']);
  });

  it('uses empty genre when fresh is empty and there is no existing genre', () => {
    const noGenre = { ...baseAlbum, genre: [] };
    const result = applyAlbumEnrichment(noGenre, { ...baseFresh, genres: [] });
    expect(result.genre).toEqual([]);
  });

  it('uses fresh releaseDate when it is more precise than existing (full overwrites year-only)', () => {
    const withYear = { ...baseAlbum, release_date: '2024' };
    const result = applyAlbumEnrichment(withYear, { ...baseFresh, releaseDate: '2024-03-15' });
    expect(result.release_date).toBe('2024-03-15');
  });

  it('keeps existing releaseDate when fresh is less precise (year-only does NOT overwrite full date)', () => {
    const withFullDate = { ...baseAlbum, release_date: '2024-03-15' };
    const result = applyAlbumEnrichment(withFullDate, { ...baseFresh, releaseDate: '2024' });
    expect(result.release_date).toBe('2024-03-15');
  });

  it('keeps existing releaseDate when fresh is null', () => {
    const withFullDate = { ...baseAlbum, release_date: '2024-03-15' };
    const result = applyAlbumEnrichment(withFullDate, { ...baseFresh, releaseDate: null });
    expect(result.release_date).toBe('2024-03-15');
  });

  it('stays null when both fresh and existing releaseDate are null', () => {
    const result = applyAlbumEnrichment(baseAlbum, { ...baseFresh, releaseDate: null });
    expect(result.release_date).toBeNull();
  });

  it('does not touch mb_release_group_id, band, album, norm_key, or id', () => {
    const result = applyAlbumEnrichment(baseAlbum, baseFresh);
    expect(result.id).toBe('abc');
    expect(result.band).toBe('Opeth');
    expect(result.album).toBe('Blackwater Park');
    expect(result.norm_key).toBe('opeth__blackwater park');
    expect(result.mb_release_group_id).toBeNull();
  });
});
