# Album-identity restructure — design decisions (8 July 2026)

> Follows `album-identity-diagnosis.md` (diagnostic complete, confirmed silent data loss). This entry records the design decisions made in the follow-up discussion, before any schema or migration work begins. Append to `docs/decisions/` as a new file or append to the diagnosis doc — Dan's call on which.

## 1. Historical data corruption — accepted as-is

Confirmed collisions in the live `reviews` table (4 in a 98-row sample) will **not** be corrected. No re-fetching, no re-verification of old rows, no attempt to recover which source's score/summary/url was overwritten historically.

**Rationale:** this is a personal tool; historical accuracy on a small number of old rows isn't worth the effort relative to fixing the mechanism going forward. Explicit, conscious tradeoff — not an oversight.

**Consequence for migration brief:** migration must NOT attempt historical score correction or re-verification. Any Claude Code session touching this area should treat old rows as-is and migrate them structurally only.

## 2. Future dedup — album+source uniqueness

`reviews` table uniqueness moves from band+album (the buggy `computeId` behavior) to **album_id + source**. This is what actually makes a review unique — the same album can and should have one review row per source, not one row total.

This was already the direction of the original draft schema; today's session confirms it's correct given the diagnostic findings (multi-source overlap is routine — not rare — so this isn't an edge case, it's the common case).

## 3. Display and filtering model — average as canonical, all scores as linked badges

- **Canonical/filterable score = computed average** across all sources that have reviewed the album.
- **All individual source scores displayed as badges** on the card (e.g. "Angry Metal Guy: 8.4 · Progressive Subway: 7.5"), each linking out to that source's actual review page/URL.
- **No single "main" source.** Considered and rejected: arrival-order-based "first reviewer is main" (rejected — arbitrary, scraper-timing-dependent, not a real editorial signal) and fixed source-priority ranking (rejected — would require inventing an editorial trust ranking Dan doesn't actually hold).
- **Rationale:** average requires no editorial claim, uses all available data, and is honest about not preferring one source over another without cause.
- **Open sub-question, not yet decided:** should the UI signal how many sources contributed to a given average (e.g. a 2-source average is more volatile than a 3-source one)? Flagged for later — not blocking.
- **Requirement surfaced during discussion:** each source's badge needs its own review URL, meaning the album card needs access to each underlying `reviews` row's `url` field, not just the aggregate score.

## 4. Identity key — dual-key strategy

Confirmed: use **both** `mb_release_group_id` (strong key) and `norm_key` (fallback key), matching the original draft schema — not a simplification to one or the other.

**How `mb_release_group_id` is actually used (clarified this session):**
- Primary "does this album already exist" check at ingest time — new reviews match against it first.
- The mechanism that correctly collapses different editions/formats of the same conceptual album (e.g. "Circadian Promise" vs "Circadian Promise (Deluxe Edition)") — something `norm_key` structurally cannot do.
- Also used at manual-add time, to check for existing matches before creating a new row.
- **Not** used for genre/artwork/release-date enrichment decisions (separate, existing merge-guard logic) and **not** user-facing (no MB ID shown to users directly).

**Matching order:** try `mb_release_group_id` first (if a fresh MB lookup resolves); fall back to `norm_key` only if MB lookup fails or returns nothing. Checking `norm_key` first would defeat the purpose of having the stronger key.

**Migration scope implication:** the migration will populate `norm_key` for every existing row. It will **not** perform per-row MusicBrainz lookups at migration time (avoids blocking on MB's 1 req/sec rate limit and resolution gaps for older/obscure releases). `mb_release_group_id` backfill is explicitly deferred to a later enrichment pass — not part of the migration's definition of done, and should not be assumed populated coming out of migration.

## 5. Manual-add guidance — prevention-first, two-layer approach

Problem: manual album entry can produce duplicate albums via typos or inconsistent formatting in band/album name, which `norm_key` normalization cannot catch (normalization fixes formatting differences, not genuine misspellings).

**Layer 1 — prevention at input time (in scope for the frontend brief):**
- Live MusicBrainz autocomplete as the user types (debounced), same pattern as Letterboxd/Spotify search-as-you-type. Selecting a suggestion gives a clean MB ID and correct canonical strings — the user's typo never reaches the database.
- For albums MB doesn't have (a real, non-edge case per the diagnostic's own findings on MB resolution gaps): fuzzy/similarity match (e.g. Levenshtein distance) against existing `albums.norm_key` values at submit time, surfaced as a soft "Did you mean [existing album]?" suggestion — not a hard block.
- Show the resolved identity (canonical band/album strings, whichever key matched) before final commit, requiring explicit confirmation rather than silently accepting the raw typed string.

**Layer 2 — admin correction, for whatever still slips through:**
- **Now (single-user stage):** no dedicated tooling needed. A simple internal query ("albums with no `mb_release_group_id`, sorted by creation date") is sufficient for Dan to eyeball occasionally and fix directly via Supabase.
- **Post-launch (multi-user), explicitly deferred and NOT scoped now:** a proper admin merge tool — select two `albums` rows, reassign all `reviews` and `favorites` foreign keys from one to the other, delete the loser row. Nontrivial (touches two other tables' FKs). Named here as a known future need only. Do not build any part of this now — consistent with the project's standing "don't over-build for hypothetical needs" principle.

## 6. Reviews table shape, going forward — confirmed multiple rows per album

Clarified explicitly this session, since it wasn't spelled out plainly before: once `albums` owns identity, `reviews` moves from "one row per band+album" (today's buggy, collision-prone shape) to **one row per (album, source) pair**. A single album can correctly have up to three `reviews` rows — one each for Angry Metal Guy, The Progressive Subway, and Metal Storm — each with its own independent score, summary, and url.

This is not an incidental side effect — it's the mechanism that makes both decision #2 (album+source uniqueness) and decision #3 (all source scores shown as separate linked badges) actually work. Each badge on a card corresponds to exactly one `reviews` row; there is no single review row that gets "updated" per source.

Example, post-migration, for an album with all three sources:

```
albums: { id: abc-123, band: "...", album: "...", ... }

reviews:
  { album_id: abc-123, source: "Angry Metal Guy",    score: 8.5, url: "...", summary: "..." }
  { album_id: abc-123, source: "Progressive Subway", score: 7.5, url: "...", summary: "..." }
  { album_id: abc-123, source: "Metal Storm",        score: 8.2, url: "...", summary: "..." }
```

**Consequence for the ingest-pipeline brief:** the "does a review already exist" check changes shape accordingly. Today's check is effectively "does a row with this id exist" (id derived from band+album only — the bug). Going forward it must be "does a row with this `album_id` AND this `source` exist." Any logic in `ingest.ts` currently reasoning about reviews as one-per-album (skip-sets, upsert-on-conflict targets, etc.) needs to be re-examined against this new one-per-(album, source) shape — this should be an explicit checklist item in that brief, not left implicit.

## Where this leaves the sequencing

Confirms the four-session plan from the diagnostic session's parent doc:
1. Migration (schema + backfill `norm_key` only + FK remap + resolve `manual_albums` identity gap) — riskiest, next up.
2. Ingest pipeline (album-level `computeId` replacement, MB lookup + `norm_key` fallback matching, album+source review uniqueness).
3. Frontend (card average+badges display, `AddAlbumDrawer` two-layer guidance, `useFavoritesList` simplification).
4. (Deferred, future phase) Admin merge tooling — not scheduled, named only.
