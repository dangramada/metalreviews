-- Step 3a of docs/decisions/album-identity/album-identity-migration.md: add the (nullable, for now)
-- album_id column to reviews. Populated by scripts/migrations/2026-07-album-identity-populate-reviews.ts
-- immediately after this runs, then locked down (NOT NULL + new unique constraint +
-- column drops) by supabase/reviews-finalize.sql once that script confirms zero NULLs.
--
-- `id` (existing text primary key) is NOT touched — favorites.review_id still references
-- it, and ingest.ts's upsert (onConflict: 'id') still needs it until the ingest-pipeline
-- session lands. Run this in the Supabase SQL editor.

alter table reviews add column album_id uuid references albums(id);
