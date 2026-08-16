-- Drops the manual_albums table, retired by the album-identity migration.
-- Confirmed dead in every live code path (client, server, ingest) — see
-- docs/decisions/album-identity/album-identity-visibility-and-duplicate-fix.md's July 2026 follow-up section.
-- The only remaining reference was scripts/migrations/2026-07-album-identity-backfill-albums.ts,
-- a one-time, already-run migration script that read manual_albums purely as a historical data
-- source to seed the new `albums` table — it will not run again.
--
-- No other table has a foreign key referencing manual_albums (confirmed by grepping every
-- .sql file in this directory) — a plain DROP is safe, no CASCADE needed.
--
-- Run this in the Supabase SQL editor.

drop table manual_albums;
