-- Final step of docs/decisions/album-identity/album-identity-migration.md's favorites remap.
-- Prerequisite: favorites.album_id already populated and verified (confirmed: 5/5 rows,
-- 0 collisions found — see checkpoint 2 in album-identity/album-identity-migration.md). Deferred at that
-- checkpoint pending an explicit go-ahead; now requested.
--
-- Drops the old review_id column and its FK to reviews(id). After this, favorites is keyed
-- purely by album_id — one row per (user_id, album_id) is the natural shape going forward,
-- though no unique constraint is added here (out of scope; add one only if/when duplicate
-- inserts become an observed problem, per the project's standing "don't build for
-- hypothetical needs" convention).
--
-- Run this in the Supabase SQL editor.

alter table favorites drop column review_id;
