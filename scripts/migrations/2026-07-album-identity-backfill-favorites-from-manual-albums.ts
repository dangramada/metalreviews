// One-time backfill closing a gap left by the original migration
// (docs/decisions/album-identity/album-identity-migration.md Step 2): manual_albums rows were copied into
// `albums` (created_by set), but no `favorites` row was ever created for them. Pre-migration,
// membership in `manual_albums` was itself sufficient to appear on `/favorites` — no separate
// favorites row was needed. Post-migration, `/favorites` reads exclusively through `favorites`,
// so these albums silently vanished from the user's favorites list. See
// docs/decisions/album-identity/album-identity-visibility-and-duplicate-fix.md's July 2026 follow-up for the
// investigation that found this.
//
// Matches each manual_albums row to its albums row via norm_key (same matching key the
// original backfill-albums.ts script used), then inserts a `favorites` row for that
// (manual_albums.user_id, matched album id) pair — skipped if one already exists.
import { supabase } from '../supabaseClient';
import { computeNormKey } from '../normalizeKey';

type ManualAlbumRow = { id: string; user_id: string; band: string; album: string };
type AlbumRow = { id: string; norm_key: string };

async function main() {
  const { data: manualAlbums, error: maErr } = await supabase
    .from('manual_albums')
    .select('id, user_id, band, album');
  if (maErr) throw maErr;
  const manualRows = manualAlbums as ManualAlbumRow[];

  const { data: albums, error: albErr } = await supabase.from('albums').select('id, norm_key');
  if (albErr) throw albErr;
  const albumIdByNormKey = new Map<string, string>();
  for (const a of albums as AlbumRow[]) albumIdByNormKey.set(a.norm_key, a.id);

  const { data: favorites, error: favErr } = await supabase.from('favorites').select('user_id, album_id');
  if (favErr) throw favErr;
  const existingFavorites = new Set((favorites ?? []).map((f) => `${f.user_id}::${f.album_id}`));

  let inserted = 0;
  let alreadyPresent = 0;
  const unmatched: ManualAlbumRow[] = [];

  for (const m of manualRows) {
    const key = computeNormKey(m.band, m.album);
    const albumId = albumIdByNormKey.get(key);
    if (!albumId) {
      unmatched.push(m);
      continue;
    }
    if (existingFavorites.has(`${m.user_id}::${albumId}`)) {
      alreadyPresent++;
      continue;
    }
    const { error: insertErr } = await supabase
      .from('favorites')
      .insert({ user_id: m.user_id, album_id: albumId });
    if (insertErr) throw insertErr;
    inserted++;
  }

  console.log('--- manual_albums -> favorites backfill report ---');
  console.log(`manual_albums rows read: ${manualRows.length}`);
  console.log(`favorites rows inserted: ${inserted}`);
  console.log(`already had a favorites row (skipped): ${alreadyPresent}`);
  console.log(`unmatched (no albums row found via norm_key): ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log(JSON.stringify(unmatched, null, 2));
  }

  const { count: favoritesCount } = await supabase
    .from('favorites')
    .select('*', { count: 'exact', head: true });
  console.log(`final favorites row count: ${favoritesCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
