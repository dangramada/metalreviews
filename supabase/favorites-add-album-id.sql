-- Step 4a of docs/decisions/album-identity/album-identity-migration.md: add the (nullable, for now)
-- album_id column to favorites. Populated by
-- scripts/migrations/2026-07-album-identity-populate-favorites.ts immediately after.
--
-- favorites.review_id is NOT dropped in this session — left in place pending an explicit
-- go-ahead checkpoint after the populate script reports its findings. Run this in the
-- Supabase SQL editor.

alter table favorites add column album_id uuid references albums(id);
