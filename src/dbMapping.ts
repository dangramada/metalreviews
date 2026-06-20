// src/dbMapping.ts
//
// Shared boundary layer between Postgres (snake_case) and the app's MetalReview type (camelCase).
// Used by: scripts/ingest.ts (reading existing rows from Supabase before merge)
//          src/App.tsx (mapping query results before touching React state)
//
// Never import dotenv or server-only deps here — this file runs in both Node and browser.

import type { MetalReview } from './types';

// Mirrors the exact column names and types in the Supabase `reviews` table.
export type DbRow = {
  id: string;
  band: string;
  album: string;
  source: string;
  score: string | null;
  normalized_score: number | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  published_date: string | null;
  artwork_url: string | null;
  release_date: string | null;
  genre: string[] | null;
};

export function fromDbRow(row: DbRow): MetalReview {
  return {
    id: row.id,
    band: row.band,
    album: row.album,
    source: row.source,
    score: row.score ?? '',
    normalizedScore: row.normalized_score ?? 0,
    summary: row.summary ?? '',
    url: row.url ?? '',
    publishedAt: row.published_at ?? new Date().toISOString(),
    publishedDate: row.published_date ?? '',
    artworkUrl: row.artwork_url,
    releaseDate: row.release_date ?? null,
    genre: row.genre ?? [],
  };
}
