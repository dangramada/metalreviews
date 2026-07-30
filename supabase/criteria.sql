-- criteria + criteria_levels: the 6 fixed criteria and their 5 levels each, seeded here as
-- the DB's source of truth going forward. Shared reference content (same for every user),
-- not per-user data. Run this in the Supabase SQL editor.
-- See docs/decisions/criteria-calibration-engine.md (parts 1-2) for the criterion index
-- convention this mirrors: `criteria.id` is the same 0-5 criterionIndex used throughout
-- src/lib/criteria-calibration/preferenceGraph.ts and solver.ts -- deliberately a fixed,
-- explicit id (not identity/serial), since it's stable domain data, not auto-incrementing.
--
-- RLS pattern for this table: public read (matches albums.sql's "Anyone can read" policy --
-- this dashboard is unauthenticated-readable), no anon write policy. Seeding happens via the
-- insert statements below, run once as part of this migration; any future edits to wording
-- are manual SQL-editor changes, not an app-writable path.

create table criteria (
  id smallint primary key,
  name text not null,
  display_order smallint not null
);

alter table criteria enable row level security;

create policy "Anyone can read criteria"
  on criteria for select
  using (true);

create table criteria_levels (
  criterion_id smallint references criteria(id) not null,
  level smallint not null,
  label text not null,
  description text not null,
  primary key (criterion_id, level)
);

alter table criteria_levels enable row level security;

create policy "Anyone can read criteria_levels"
  on criteria_levels for select
  using (true);

-- Seed data: exact criteria/level text from the Criteria Calibration domain model.

insert into criteria (id, name, display_order) values
  (0, 'Musical innovation / Originality', 0),
  (1, 'Emotional impact / atmosphere', 1),
  (2, 'Instrumental + Vocal performance', 2),
  (3, 'Album coherence', 3),
  (4, 'Production & sound design', 4),
  (5, 'Songwriting', 5);

insert into criteria_levels (criterion_id, level, label, description) values
  -- 0: Musical innovation / Originality
  (0, 1, 'Uninspired', 'sounds like it''s just going through the motions'),
  (0, 2, 'Familiar', 'solid, but plays it safe within genre norms'),
  (0, 3, 'Some fresh ideas', 'a few moments break from the formula, but stay the exception'),
  (0, 4, 'Bold', 'risk-taking defines the album, not just a few moments'),
  (0, 5, 'Groundbreaking', 'redefines what''s possible in the genre'),

  -- 1: Emotional impact / atmosphere
  (1, 1, 'Flat', 'doesn''t leave much of a feeling behind'),
  (1, 2, 'Nice', 'pleasant to listen to, nothing lingers'),
  (1, 3, 'Engaging', 'holds your attention, but doesn''t hit you emotionally'),
  (1, 4, 'Powerful', 'genuinely moves you, not just holds attention'),
  (1, 5, 'Unforgettable', 'leaves a deep, lasting mark you think about after'),

  -- 2: Instrumental + Vocal performance
  (2, 1, 'Rough', 'noticeable mistakes or weak delivery'),
  (2, 2, 'Solid', 'technically correct, but nothing stands out'),
  (2, 3, 'Skilled', 'clean technique with some real expression'),
  (2, 4, 'Excellent', 'strong technique and personality throughout'),
  (2, 5, 'Masterful', 'world-class musicianship, defines the genre'),

  -- 3: Album coherence
  (3, 1, 'Disjointed', 'feels like unrelated tracks thrown together'),
  (3, 2, 'Loosely connected', 'some links between songs, but inconsistent'),
  (3, 3, 'Well linked', 'clear connections, feels intentional'),
  (3, 4, 'Flows great', 'one track leads naturally into the next'),
  (3, 5, 'Perfectly unified', 'feels like one complete statement, start to finish'),

  -- 4: Production & sound design
  (4, 1, 'Poor', 'muddy, harsh, or badly mixed'),
  (4, 2, 'Okay', 'clean, but generic, could be any album'),
  (4, 3, 'Well done', 'clear and balanced, fits the music well'),
  (4, 4, 'Great', 'the sound itself adds to the experience'),
  (4, 5, 'Exceptional', 'the sound is part of what makes the album special'),

  -- 5: Songwriting
  (5, 1, 'Weak', 'songs go nowhere, feel unfinished'),
  (5, 2, 'Decent', 'does the job, nothing memorable'),
  (5, 3, 'Good', 'a few standout moments, solid structure overall'),
  (5, 4, 'Great', 'most songs are memorable and hold up on their own'),
  (5, 5, 'Outstanding', 'every song is sharp, no filler anywhere');
