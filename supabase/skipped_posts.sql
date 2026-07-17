-- skipped_posts: audit log of RSS items filtered out before ever becoming an
-- albums/reviews row (roundups, retrospective columns, ranking posts, etc).
-- Run this in the Supabase SQL editor. See docs/decisions/roundup-skip-fix.md
-- and docs/decisions/unknown-band-collision-audit.md for the investigation
-- that motivated this table.
--
-- Service-role only (matches how `reviews`/`albums` are written by the ingest
-- pipeline) — no anon read/write policy needed, this is an internal log, not
-- user-facing.

create table skipped_posts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  url text not null,
  published_at timestamptz,
  reason text not null default 'non_review_category',
  skipped_at timestamptz not null default now()
);

alter table skipped_posts enable row level security;
