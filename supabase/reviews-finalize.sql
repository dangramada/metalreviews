-- Step 3d of docs/decisions/album-identity/album-identity-migration.md.
-- Prerequisite: scripts/migrations/2026-07-album-identity-populate-reviews.ts has run and
-- confirmed zero NULL album_id rows (verified: 133/133 populated, 0 remaining NULLs).
--
-- This is destructive — it drops artwork_url/genre/release_date from reviews. Per the
-- confirmed decision in docs/decisions/album-identity/album-identity-migration.md, this intentionally
-- breaks scripts/ingest.ts and the frontend (both still read/write these columns on
-- `reviews`) until the separate ingest-pipeline and frontend sessions land. This branch
-- is not merged to master until then.
--
-- `reviews.id` (existing text primary key) is left untouched.

alter table reviews alter column album_id set not null;
alter table reviews add constraint reviews_album_source_unique unique (album_id, source);
alter table reviews drop column artwork_url;
alter table reviews drop column genre;
alter table reviews drop column release_date;
