-- Adds the missing insert policy on `albums`, needed for AddAlbumDrawer's client-side
-- insert path (see docs/decisions/album-identity-frontend-favorites.md). `albums.sql`
-- (the original migration) only added a public-read policy — no insert/update/delete
-- policy existed, confirmed by inspecting every .sql file that has touched this table.
--
-- Per docs/decisions/album-identity-decisions.md §5 (Layer 1 prevention): authenticated
-- users may INSERT their own manually-added albums (created_by = auth.uid()), but there
-- is no UPDATE or DELETE policy — albums are not user-editable or user-deletable once
-- created. Ingest-created rows (created_by is null) are unaffected; ingest writes via the
-- service-role client, which bypasses RLS entirely.
--
-- Run this in the Supabase SQL editor.

create policy "Authenticated users can insert their own albums"
  on albums for insert
  to authenticated
  with check (created_by = auth.uid());
