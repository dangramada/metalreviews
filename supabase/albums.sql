-- albums table: real album entity, separate from reviews and favorites.
-- Fixes the computeId collision confirmed in docs/decisions/album-identity/album-identity-diagnosis.md
-- (band+album only, no source -> silent data loss when two sources review the same album).
-- Run this in the Supabase SQL editor. See docs/decisions/album-identity/album-identity-migration.md.
--
-- mb_release_group_id stays NULL for every row created by this migration — no
-- MusicBrainz lookups are performed here, that's a deferred enrichment pass.

create table albums (
  id uuid primary key default gen_random_uuid(),
  band text not null,
  album text not null,
  mb_release_group_id text unique,
  norm_key text unique not null,
  artwork_url text,
  genre text[] default '{}'::text[],
  release_date text,  -- text, not date: MB returns partial dates ("2024", "2024-03", "2024-03-15")
  created_by uuid references auth.users(id),  -- NULL for ingest-created rows
  created_at timestamptz default now()
);

alter table albums enable row level security;

-- Public read (the dashboard is unauthenticated); writes only via the service-role
-- key (bypasses RLS), matching how `reviews` is written today. No anon insert/update/delete policy.
create policy "Anyone can read albums"
  on albums for select
  using (true);
