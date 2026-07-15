// Step 4b of docs/decisions/album-identity-migration.md: populate favorites.album_id via
// each favorite's review_id -> reviews.album_id, then collapse any same-user duplicates
// that only became visible once two different review_id rows resolve to the same album_id
// (e.g. a user favorited both the AMG and Metal Storm review of the same album back when
// they were separate reviews rows).
//
// Prerequisite: supabase/favorites-add-album-id.sql already applied.
// Does NOT drop favorites.review_id — that's gated behind an explicit go-ahead after this
// script's report (checkpoint 2).
import { supabase } from '../supabaseClient';

type FavoriteRow = { user_id: string; review_id: string; album_id: string | null; created_at: string };
type ReviewRow = { id: string; album_id: string; band: string; album: string };

async function main() {
  const { data: reviews, error: reviewsErr } = await supabase.from('reviews').select('id, album_id, band, album');
  if (reviewsErr) throw reviewsErr;
  const reviewById = new Map<string, ReviewRow>();
  for (const r of reviews as ReviewRow[]) reviewById.set(r.id, r);

  const { data: favorites, error: favErr } = await supabase
    .from('favorites')
    .select('user_id, review_id, album_id, created_at');
  if (favErr) throw favErr;
  const favoriteRows = favorites as FavoriteRow[];

  let updated = 0;
  const unmatched: FavoriteRow[] = [];

  for (const f of favoriteRows) {
    const review = reviewById.get(f.review_id);
    if (!review) {
      unmatched.push(f);
      continue;
    }
    if (f.album_id === review.album_id) continue;
    const { error: updateErr } = await supabase
      .from('favorites')
      .update({ album_id: review.album_id })
      .eq('user_id', f.user_id)
      .eq('review_id', f.review_id);
    if (updateErr) throw updateErr;
    updated++;
  }

  if (unmatched.length > 0) {
    console.error(
      `FATAL: ${unmatched.length} favorite(s) reference a review_id not found in reviews. Aborting before dedup.`
    );
    console.error(JSON.stringify(unmatched, null, 2));
    process.exit(1);
  }

  // Re-read post-update state to find (user_id, album_id) collisions.
  const { data: refreshed, error: refreshedErr } = await supabase
    .from('favorites')
    .select('user_id, review_id, album_id, created_at');
  if (refreshedErr) throw refreshedErr;
  const refreshedRows = refreshed as FavoriteRow[];

  const groups = new Map<string, FavoriteRow[]>();
  for (const f of refreshedRows) {
    const key = `${f.user_id}::${f.album_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const collisionDetail: {
    userId: string;
    albumId: string;
    band: string;
    album: string;
    kept: { reviewId: string; createdAt: string };
    deleted: { reviewId: string; createdAt: string }[];
  }[] = [];

  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const keep = sorted[0];
    const toDelete = sorted.slice(1);
    const review = reviewById.get(keep.review_id)!;
    collisionDetail.push({
      userId: keep.user_id,
      albumId: keep.album_id!,
      band: review.band,
      album: review.album,
      kept: { reviewId: keep.review_id, createdAt: keep.created_at },
      deleted: toDelete.map((d) => ({ reviewId: d.review_id, createdAt: d.created_at })),
    });
    for (const d of toDelete) {
      const { error: deleteErr } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', d.user_id)
        .eq('review_id', d.review_id);
      if (deleteErr) throw deleteErr;
    }
  }

  const [{ count: reviewsCount }, { count: favoritesCount }, { count: albumsCount }] = await Promise.all([
    supabase.from('reviews').select('*', { count: 'exact', head: true }),
    supabase.from('favorites').select('*', { count: 'exact', head: true }),
    supabase.from('albums').select('*', { count: 'exact', head: true }),
  ]);

  console.log('--- checkpoint 2 report ---');
  console.log(`favorites rows read: ${favoriteRows.length}`);
  console.log(`album_id updated: ${updated}`);
  console.log(`favorites-level (user_id, album_id) collisions found: ${collisionDetail.length}`);
  if (collisionDetail.length > 0) {
    console.log('collision detail (kept earliest created_at per group, deleted the rest):');
    console.log(JSON.stringify(collisionDetail, null, 2));
  }
  console.log('--- final row counts ---');
  console.log(`reviews: ${reviewsCount}`);
  console.log(`favorites: ${favoritesCount}`);
  console.log(`albums: ${albumsCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
