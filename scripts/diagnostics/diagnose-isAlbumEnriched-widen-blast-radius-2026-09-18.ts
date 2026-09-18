// One-off diagnostic (read-only, writes nothing): scopes the blast radius of widening
// isAlbumEnriched() to also require mb_release_group_id, ahead of step 2b of the same-title
// release-group collision fix (docs/decisions/album-identity/album-identity-same-title-release-group-collision.md).
// Reuses the real isAlbumEnriched() and selectAlbumBackfillCandidates() from ingest.ts rather
// than reimplementing the eligibility logic.
//
// Usage: npx tsx scripts/diagnostics/diagnose-isAlbumEnriched-widen-blast-radius-2026-09-18.ts

import { supabase } from '../supabaseClient';
import { isAlbumEnriched, selectAlbumBackfillCandidates, type AlbumRow } from '../ingest';

interface ReviewRow {
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
  album_id: string;
  mb_lookup_attempts: number | null;
}

async function main() {
  const [{ data: albumsData, error: albumsErr }, { data: reviewsData, error: reviewsErr }] =
    await Promise.all([
      supabase
        .from('albums')
        .select('id, band, album, mb_release_group_id, norm_key, artwork_url, genre, release_date'),
      supabase
        .from('reviews')
        .select(
          'id, band, album, source, score, normalized_score, summary, url, published_at, published_date, album_id, mb_lookup_attempts'
        ),
    ]);
  if (albumsErr) throw albumsErr;
  if (reviewsErr) throw reviewsErr;

  const albums = albumsData as AlbumRow[];
  const reviews = reviewsData as ReviewRow[];
  console.log(`Total albums: ${albums.length}`);

  // Q1: currently-enriched (today's definition) rows missing mb_release_group_id.
  const enrichedNoId = albums.filter((a) => isAlbumEnriched(a) && !a.mb_release_group_id);
  console.log(`\nQ1: enriched (artwork+genre+date) but mb_release_group_id null: ${enrichedNoId.length} / ${albums.length}`);

  // Q2: of those, how many would be live backfill candidates on the very next run under the
  // widened definition. Reuse the real selectAlbumBackfillCandidates() against a set of
  // "fake" albums where isAlbumEnriched would return false only because we strip the fields
  // it checks — instead, simplest accurate approach: call the REAL function on the REAL
  // album rows (so its `isAlbumEnriched(a)` check still uses today's narrower definition and
  // returns true, which would normally exclude them) is wrong for this purpose. So instead
  // we replicate its touched/retry-cap logic directly for exactly the enrichedNoId subset,
  // which is equivalent to "isAlbumEnriched raises false for this row" — since every other
  // row in this subset already independently satisfies isAlbumEnriched()==true today, the
  // ONLY thing standing between it and eligibility under the widened rule is the retry cap
  // (touchedAlbumIds is empty here — no fresh RSS scrape is part of a read-only diagnostic,
  // and these are old catalog rows unlikely to reappear in the next scrape's items anyway).
  const reviewsByAlbumId = new Map<string, ReviewRow[]>();
  for (const r of reviews) {
    if (!reviewsByAlbumId.has(r.album_id)) reviewsByAlbumId.set(r.album_id, []);
    reviewsByAlbumId.get(r.album_id)!.push(r);
  }

  // Sanity check: confirm selectAlbumBackfillCandidates's retry-cap logic against the subset
  // by using its own code path with a stand-in "not enriched" AlbumRow (same id/band/album,
  // enrichment fields blanked) — this exercises the exact real function rather than a copy.
  const standIns: AlbumRow[] = enrichedNoId.map((a) => ({ ...a, artwork_url: null }));
  const eligibleNow = selectAlbumBackfillCandidates(standIns, new Set(), reviewsByAlbumId, new Date());
  console.log(`Q2: of those, eligible for a live MB re-fetch on the very next run (not excluded by the 5-attempt/14-day retry cap): ${eligibleNow.length} / ${enrichedNoId.length}`);

  const excluded = enrichedNoId.length - eligibleNow.length;
  console.log(`  Excluded by retry cap: ${excluded}`);
  if (excluded > 0) {
    const eligibleIds = new Set(eligibleNow.map((a) => a.id));
    const excludedRows = enrichedNoId.filter((a) => !eligibleIds.has(a.id));
    for (const a of excludedRows.slice(0, 10)) {
      const revs = reviewsByAlbumId.get(a.id) ?? [];
      console.log(`    ${a.band} — ${a.album}: attempts=${revs.map((r) => r.mb_lookup_attempts ?? 0).join(',')}, published=${revs.map((r) => r.published_at).join(',')}`);
    }
  }

  // Q3: timing estimate. lookupMusicBrainz makes 1 MB request (Step A) + a sleep(1000), then
  // Step B's release-detail request (MB) run concurrently with CAA (non-MB host, doesn't
  // count against the MB budget) — no additional sleep charged for Step B itself since it's
  // the last MB-rate-limited call unless the release-group detail fallback or Step C's artist
  // fallback also fire, each adding its own sleep(1000). For rows that were already fully
  // enriched before, Step B is very likely to already have both date and genres (that's what
  // "enriched" means), so the release-group detail fetch (gated on !artworkUrl || !releaseDate)
  // and the artist fallback (gated on empty genres) should rarely trigger again on a re-fetch —
  // best case ~1 sleep/album, worst case up to ~3 if both fallbacks fire.
  const bestCaseSeconds = eligibleNow.length * 1;
  const worstCaseSeconds = eligibleNow.length * 3;
  console.log(`\nQ3: at 1 MB req/sec, one sleep(1000) minimum per album (Step A -> Step B):`);
  console.log(`  Best case (~1 sleep/album, no extra fallback fetches): ~${Math.round(bestCaseSeconds / 60)} min (${bestCaseSeconds}s) for ${eligibleNow.length} albums`);
  console.log(`  Worst case (~3 sleeps/album, both fallbacks fire): ~${Math.round(worstCaseSeconds / 60)} min (${worstCaseSeconds}s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
