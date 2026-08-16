// src/dbMapping.ts
//
// Shared boundary layer between Postgres (snake_case) and the app's MetalReview type (camelCase).
// Used by: src/App.tsx (mapping query results before touching React state)
//
// Never import dotenv or server-only deps here — this file runs in both Node and browser.

// =============================================================================
// Post-album-identity-migration mapping — the home page's real, live schema.
// =============================================================================
//
// Mirrors a `reviews` row nested under its parent `albums` row via PostgREST/Supabase
// embedding (`.select('..., reviews(...)')`). `artwork_url`/`genre`/`release_date` are
// deliberately absent — they live on AlbumRow now, not here.
export type NestedReviewRow = {
  id: string;
  source: string;
  score: string | null;
  normalized_score: number | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  published_date: string | null;
};

// Mirrors the `albums` table (see supabase/albums.sql), with its attached `reviews` rows
// embedded as an array. An album can have zero reviews (manually added, not yet reviewed
// by any source) up to three (one per source, unique on (album_id, source)).
export type AlbumWithReviewsRow = {
  id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  release_date: string | null;
  genre: string[] | null;
  created_at: string | null;
  reviews: NestedReviewRow[];
};

// One line item on a card — one attached review, rendered verbatim (no editorial ranking,
// per album-identity/album-identity-decisions.md §3). `summary` is only displayed by the card component in
// the exactly-one-review case (see AlbumCard below) — it's carried here regardless so that
// branch has the data it needs without a second, near-duplicate type.
export interface AlbumReviewLine {
  source: string;
  score: string;
  summary: string;
  url: string;
  publishedAt: string;
  publishedDate: string;
}

// One album -> one card. The card component branches its rendering on `reviews.length`
// (see docs/decisions/album-identity/album-identity-frontend-homepage.md's multi-source-display section
// and its follow-up bugfix note): zero reviews renders album-info-only; exactly one review
// renders the original single-review layout (summary, one date line, one badge, card-level
// link); two or more renders the multi-source layout (average badge, stacked source badges,
// per-source line list, no card-level link). This shape carries enough data for all three —
// the branching lives in the component, not here.
export interface AlbumCard {
  albumId: string;
  band: string;
  album: string;
  genre: string[];
  artworkUrl: string | null;
  releaseDate: string | null;
  // Every attached review, unfiltered/unranked. Empty when the album has zero reviews.
  reviews: AlbumReviewLine[];
  // Average of all attached reviews' normalized_score (0–100 scale, same scale the old
  // per-review normalizedScore used). Null when the album has zero reviews, or when every
  // attached review is missing a score — both cases the score badge's zero-review guard
  // already handles by simply not rendering the badge.
  averageScore: number | null;
  // Most recent attached review's publishedAt, for "newest first" sorting. Falls back to the
  // album's created_at when there's no review to source a date from, so date-sort still
  // places zero-review albums somewhere sensible instead of computing an invalid date.
  publishedAt: string;
}

export function fromAlbumWithReviews(row: AlbumWithReviewsRow): AlbumCard {
  const nested = row.reviews ?? [];

  const reviews: AlbumReviewLine[] = nested.map((r) => ({
    source: r.source,
    score: r.score ?? '',
    summary: r.summary ?? '',
    url: r.url ?? '',
    publishedAt: r.published_at ?? row.created_at ?? new Date().toISOString(),
    publishedDate: r.published_date ?? '',
  }));

  const scored = nested.filter(
    (r): r is NestedReviewRow & { normalized_score: number } => r.normalized_score != null
  );
  const averageScore =
    scored.length > 0
      ? scored.reduce((sum, r) => sum + r.normalized_score, 0) / scored.length
      : null;

  const publishedAt = reviews.reduce(
    (latest, r) => (new Date(r.publishedAt) > new Date(latest) ? r.publishedAt : latest),
    row.created_at ?? new Date().toISOString()
  );

  return {
    albumId: row.id,
    band: row.band,
    album: row.album,
    genre: row.genre ?? [],
    artworkUrl: row.artwork_url,
    releaseDate: row.release_date ?? null,
    reviews,
    averageScore,
    publishedAt,
  };
}
