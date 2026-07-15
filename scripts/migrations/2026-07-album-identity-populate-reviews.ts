// Step 3b of docs/decisions/album-identity-migration.md: populate reviews.album_id by
// matching each review's norm_key against the albums table built in step 2.
//
// Prerequisite: supabase/reviews-add-album-id.sql already applied (album_id column exists).
// After this confirms zero NULLs, supabase/reviews-finalize.sql locks the column down
// (NOT NULL, new unique(album_id, source) constraint, drops artwork_url/genre/release_date).
import { supabase } from '../supabaseClient';
import { computeNormKey } from '../normalizeKey';

type ReviewRow = { id: string; band: string; album: string; album_id: string | null };
type AlbumRow = { id: string; norm_key: string };

async function main() {
  const { data: albums, error: albumsErr } = await supabase.from('albums').select('id, norm_key');
  if (albumsErr) throw albumsErr;
  const albumByNormKey = new Map<string, string>();
  for (const a of albums as AlbumRow[]) albumByNormKey.set(a.norm_key, a.id);

  const { data: reviews, error: reviewsErr } = await supabase
    .from('reviews')
    .select('id, band, album, album_id');
  if (reviewsErr) throw reviewsErr;
  const reviewRows = reviews as ReviewRow[];

  let updated = 0;
  let alreadySet = 0;
  const unmatched: { id: string; band: string; album: string; normKey: string }[] = [];

  for (const r of reviewRows) {
    const key = computeNormKey(r.band, r.album);
    const albumId = albumByNormKey.get(key);
    if (!albumId) {
      unmatched.push({ id: r.id, band: r.band, album: r.album, normKey: key });
      continue;
    }
    if (r.album_id === albumId) {
      alreadySet++;
      continue;
    }
    const { error: updateErr } = await supabase.from('reviews').update({ album_id: albumId }).eq('id', r.id);
    if (updateErr) throw updateErr;
    updated++;
  }

  if (unmatched.length > 0) {
    console.error(
      `FATAL: ${unmatched.length} review row(s) had no matching album — this should be impossible ` +
        `given step 2 built albums from these exact rows. Aborting before verifying null count.`
    );
    console.error(JSON.stringify(unmatched, null, 2));
    process.exit(1);
  }

  const { count: nullCount, error: nullErr } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .is('album_id', null);
  if (nullErr) throw nullErr;

  console.log('--- reviews.album_id population report ---');
  console.log(`reviews rows read: ${reviewRows.length}`);
  console.log(`updated: ${updated}`);
  console.log(`already correctly set (no-op): ${alreadySet}`);
  console.log(`remaining rows with album_id IS NULL: ${nullCount}`);
  if (nullCount && nullCount > 0) {
    console.error('FATAL: NULLs remain after population — do NOT run supabase/reviews-finalize.sql yet.');
    process.exit(1);
  } else {
    console.log('Zero NULLs confirmed — safe to run supabase/reviews-finalize.sql next.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
