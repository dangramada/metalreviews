// One-time backfill: populate the new `albums` table from existing `reviews` and
// `manual_albums` rows. Step 2 of docs/decisions/album-identity-migration.md.
//
// Prerequisite: supabase/albums.sql must already be applied (the `albums` table exists).
//
// Does NOT touch `reviews` or `favorites` — that's steps 3/4, separate scripts, run only
// after this one's counts are reviewed (stop-and-report checkpoint 1).
import { supabase } from '../supabaseClient';
import { computeNormKey } from '../normalizeKey';

type ReviewRow = {
  id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  genre: string[] | null;
  release_date: string | null;
};

type ManualAlbumRow = {
  id: string;
  user_id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  genre: string[] | null;
  release_date: string | null;
};

function firstNonEmpty<T>(values: (T | null | undefined)[]): T | null {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v === '') continue;
    return v;
  }
  return null;
}

async function main() {
  const { count: existingAlbumsCount, error: existingErr } = await supabase
    .from('albums')
    .select('*', { count: 'exact', head: true });
  if (existingErr) {
    throw new Error(
      `Could not query albums table — has supabase/albums.sql been run yet? ${existingErr.message}`
    );
  }
  if (existingAlbumsCount && existingAlbumsCount > 0) {
    throw new Error(
      `albums table already has ${existingAlbumsCount} row(s). Refusing to run — this script is not idempotent ` +
        `(norm_key is unique). If this is intentional, truncate albums manually first.`
    );
  }

  const { data: reviews, error: reviewsErr } = await supabase
    .from('reviews')
    .select('id, band, album, artwork_url, genre, release_date');
  if (reviewsErr) throw reviewsErr;
  const reviewRows = reviews as ReviewRow[];

  // Restate the duplicate-row assumption check from the plan, against live data at run time.
  const computeIdGroups = new Map<string, ReviewRow[]>();
  for (const r of reviewRows) {
    const legacyId = Buffer.from(
      `${r.band.toLowerCase().replace(/\s+/g, '')}_${r.album.toLowerCase().replace(/\s+/g, '')}`
    ).toString('base64');
    if (!computeIdGroups.has(legacyId)) computeIdGroups.set(legacyId, []);
    computeIdGroups.get(legacyId)!.push(r);
  }
  const legacyDuplicates = [...computeIdGroups.values()].filter((g) => g.length > 1);

  // Group by the new, stricter norm_key — this is expected to reveal collisions the old
  // computeId missed (diacritics/punctuation variants), which is the point of the migration.
  const normKeyGroups = new Map<string, ReviewRow[]>();
  for (const r of reviewRows) {
    const key = computeNormKey(r.band, r.album);
    if (!normKeyGroups.has(key)) normKeyGroups.set(key, []);
    normKeyGroups.get(key)!.push(r);
  }

  const albumsToInsert: {
    band: string;
    album: string;
    norm_key: string;
    artwork_url: string | null;
    genre: string[];
    release_date: string | null;
    created_by: string | null;
  }[] = [];

  for (const [normKey, group] of normKeyGroups) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    albumsToInsert.push({
      band: sorted[0].band,
      album: sorted[0].album,
      norm_key: normKey,
      artwork_url: firstNonEmpty(sorted.map((r) => r.artwork_url)),
      genre: firstNonEmpty(sorted.map((r) => r.genre)) ?? [],
      release_date: firstNonEmpty(sorted.map((r) => r.release_date)),
      created_by: null,
    });
  }

  const fromReviewsCount = albumsToInsert.length;

  const { data: manualAlbums, error: manualErr } = await supabase
    .from('manual_albums')
    .select('id, user_id, band, album, artwork_url, genre, release_date');
  if (manualErr) throw manualErr;
  const manualRows = manualAlbums as ManualAlbumRow[];

  const knownNormKeys = new Set(albumsToInsert.map((a) => a.norm_key));
  let manualMatchedCount = 0;
  const manualSkippedDetail: { manualId: string; band: string; album: string; matchedNormKey: string }[] = [];

  for (const m of manualRows) {
    const key = computeNormKey(m.band, m.album);
    if (knownNormKeys.has(key)) {
      manualMatchedCount++;
      manualSkippedDetail.push({ manualId: m.id, band: m.band, album: m.album, matchedNormKey: key });
      continue;
    }
    knownNormKeys.add(key); // also dedup against other manual_albums rows in this same pass
    albumsToInsert.push({
      band: m.band,
      album: m.album,
      norm_key: key,
      artwork_url: m.artwork_url,
      genre: m.genre ?? [],
      release_date: m.release_date,
      created_by: m.user_id,
    });
  }

  const fromManualCount = albumsToInsert.length - fromReviewsCount;

  // Insert in one batch — total row count here is small (well under Supabase's request limits).
  const { error: insertErr } = await supabase.from('albums').insert(albumsToInsert);
  if (insertErr) throw insertErr;

  const { count: verifiedCount, error: verifyErr } = await supabase
    .from('albums')
    .select('*', { count: 'exact', head: true });
  if (verifyErr) throw verifyErr;

  console.log('--- checkpoint 1 report ---');
  console.log(`reviews rows read: ${reviewRows.length}`);
  console.log(
    `legacy computeId groups with >1 row (should be 0, per pre-migration check): ${legacyDuplicates.length}`
  );
  if (legacyDuplicates.length > 0) {
    console.log('UNEXPECTED — legacy duplicate groups:', JSON.stringify(legacyDuplicates, null, 2));
  }
  console.log(`distinct norm_key groups from reviews: ${fromReviewsCount}`);
  console.log(`manual_albums rows read: ${manualRows.length}`);
  console.log(`manual_albums rows matched an existing album (skipped, no new row): ${manualMatchedCount}`);
  if (manualSkippedDetail.length > 0) {
    console.log('matched detail:', JSON.stringify(manualSkippedDetail, null, 2));
  }
  console.log(`new albums rows created from manual_albums (no match): ${fromManualCount}`);
  console.log(`total albums rows inserted: ${albumsToInsert.length}`);
  console.log(`verified count via fresh select: ${verifiedCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
