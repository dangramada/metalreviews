# Album-identity diagnostic (read-only investigation)

**Date:** 2026-07-02
**Scope:** Findings only. No recommendations, no schema proposals, no code changes. Follow-up design work is a separate step.

**Question under investigation:** `computeId` hashes band+album only (no source). A duplicate-check query against `reviews` (grouped by normalized band+album, `HAVING count > 1`) returned zero rows — which is ambiguous, because a collision would overwrite a row rather than create a visible duplicate. Does the collision exist in practice, and has it caused actual silent data loss in the live table?

**Answer:** Yes to both. The collision is structural (Finding 1), the pipeline resolves it by silently discarding one source's review (Findings 2–3), and at least one concrete loss is confirmed in the live table: The Progressive Subway's review of **Fires in the Distance – Circadian Promise** (published 2026-06-23, verdict 8/10) was ingested and then erased by the Metal Storm row for the same album (Finding 5).

---

## Finding 1 — `computeId` verbatim: source is not part of identity

[ingest.ts:326](../../scripts/ingest.ts) —

```ts
function computeId(band: string, album: string): string {
  const key = `${band.toLowerCase().replace(/\s+/g, '')}_${album.toLowerCase().replace(/\s+/g, '')}`;
  // Simple hash – we'll just use base64 of the key.
  return Buffer.from(key).toString('base64');
}
```

Inputs are **band and album only** — lowercased, all whitespace stripped, joined with `_`, base64-encoded. Source, URL, and date play no part. Two different sources reviewing the same album always produce the identical id. Confirmed against live data: the stored id `ZmlyZXNpbnRoZWRpc3RhbmNlX2NpcmNhZGlhbnByb21pc2U=` decodes to `firesinthedistance_circadianpromise`.

All three fetchers call it the same way (`computeId(band.trim() || 'Unknown Band', album.trim() || 'Unknown Album')` at ingest.ts:79, :143, :180), and the assembly loop recomputes it identically at ingest.ts:445. `id` is the upsert conflict key (`onConflict: 'id'`, ingest.ts:524).

## Finding 2 — Skip-set behavior when a second source hits a known id

`ratingAlreadyFetched` (ingest.ts:412–414) is built **once, before the fetchers run**, from existing Supabase rows with a non-empty score, keyed by id only — it does not record which source produced the score, and it does not grow during a run. Two distinct cases follow:

- **Same run, both sources new:** neither id is in the skip set, so **both sources' rating fetches do attempt** and both `RawReview`s (with their own genuine scores) enter `allRaw`. The loss happens later, at merge (Finding 3).
- **Later run, first source's row already stored:** the second source's fetcher sees `ratingAlreadyFetched.has(id) === true` and **skips its own rating fetch outright**, reusing the stored score: `score = existingById.get(id)?.score ?? ''` (ingest.ts:83, :147, :218–220). The reused score is emitted under the **second source's label and URL**. This is score misattribution: e.g. an Angry Metal Guy score can be stored in a row labeled `source: 'Metal Storm'` with a metalstorm.net URL. Because source, score, and URL are internally consistent-looking, no query can detect this after the fact.

`mbAlreadyFetched` (ingest.ts:420–430, checked at :454) behaves the same way but is benign for identity purposes — artwork/genre/release date genuinely belong to the album, not the source.

## Finding 3 — Where a same-run collision resolves (traced, not inferred)

The path is: `Promise.all` → `allRaw` concat → `final[]` (both rows present) → `applyMergeGuard` Map (second write wins) → upsert.

1. `const [amg, ps, ms, sp] = await Promise.all([...])` (ingest.ts:433–438). `Promise.all` preserves **array order regardless of resolution timing**, so `allRaw = [...amg, ...ps, ...ms, ...sp]` is deterministic: AMG rows first, then Progressive Subway, then Metal Storm.
2. The assembly loop (ingest.ts:442–486) has **no dedup** — both colliding rows are pushed into `final[]` with the same `id`.
3. `applyMergeGuard(existingById, final)` (ingest.ts:367–391) folds `final` into a `Map` keyed by id. When the second colliding row arrives, `merged.get(review.id)` returns the *first fresh row*, and `merged.set(review.id, { ...existing, ...review, ... })` spreads the second row over it. `source`, `score`, `normalizedScore`, `url`, `summary`, `publishedAt` all come from the later row; only `artworkUrl`/`genre`/`releaseDate` have fallback logic.

So a same-run collision is **last-write-wins in concat order inside `applyMergeGuard`'s Map** — not a `Promise.all` race, and not the existing-vs-fresh guard doing anything protective. The winner is fixed: **Metal Storm beats The Progressive Subway beats Angry Metal Guy.**

Cross-run collisions take the same `{ ...existing, ...review }` path, with the stored row as `existing`: the fresh (second-source) row replaces source/score/url/summary/publishedAt wholesale, then the upsert overwrites the DB row. Combined with Finding 2, the overwriting row carries the *first* source's score under the *second* source's label.

The backfill pass (ingest.ts:493–511) is id-keyed against rows already excluded from `final`, and adds no additional collision surface.

## Finding 4 — Why the duplicate-check query necessarily returned zero

Three independent layers make a visible duplicate structurally impossible, so the zero-row result carries no information about overlap:

1. `id` is the primary key / upsert conflict target — two rows with the same band+album key cannot coexist.
2. `applyMergeGuard`'s Map dedupes before the upsert even runs.
3. The dump taken for this diagnosis (98 rows, 2026-07-02) reconfirms: 0 normalized band+album keys with more than one row, and 0 rows whose source label mismatches their URL domain — the latter is expected even in the presence of the bug, because source and URL always travel together from the same fetcher (only the *score* can be foreign, per Finding 2).

## Finding 5 — Empirical: confirmed silent data loss in the live table

Live-table snapshot (2026-07-02): 98 rows — Angry Metal Guy 38 (earliest `published_at` 2026-06-10), The Progressive Subway 26 (earliest 2026-06-07), Metal Storm 34 (earliest 2026-05-20). These three different depths are consistent with each feed's window at first ingest (~2026-06-19/21); `reviews.json` was never committed to git, so pre-Supabase row history cannot be reconstructed.

### Case A — Fires in the Distance – *Circadian Promise*: **confirmed loss**

Independently verified reviews by **all three** tracked sources:

- Angry Metal Guy: [review](https://www.angrymetalguy.com/fires-in-the-distance-circadian-promise-review/), `datePublished` 2026-06-09T16:30Z (from page JSON-LD via curl)
- The Progressive Subway: [review](https://theprogressivesubway.com/2026/06/23/review-fires-in-the-distance-circadian-promise/), published 2026-06-23, "Final verdict: 8/10"
- Metal Storm: [review](https://metalstorm.net/pub/review.php?review_id=21301)

The live table contains **exactly one row** for this album:

```
source: Metal Storm | score: "8/10" | published_at: 2026-06-23T22:00Z
url: https://metalstorm.net/pub/review.php?review_id=21301
```

**The Progressive Subway loss is proven, not theoretical.** The PS review (2026-06-23) sat inside PS's RSS window during many subsequent ingest runs — the table holds PS rows dated 6/22, 6/25, 6/26, 6/27, 6/28, 6/30 and 7/01, so the feed was demonstrably being ingested on both sides of 6/23, and a WordPress feed's window (PS posts ~1/day) unquestionably contained the 6/23 item on those runs. Its RSS title `Review: Fires in the Distance – Circadian Promise` parses (prefix strip + `extractBandAlbum`) to exactly the key stored in the surviving row's id. The review is absent. It was ingested and overwritten by (or lost the merge to) the Metal Storm row.

**The Angry Metal Guy case is borderline/undeterminable.** Its review (6/09) predates the earliest surviving AMG row (6/10) by one day. Either it aged off AMG's feed just before the first ingest (no loss, only permanent non-coverage), or it was ingested in an early run and overwritten — with `reviews.json` never committed, the two can't be distinguished.

**Score-forensics (supporting, not conclusive):** the surviving Metal Storm row's score is `"8/10"` — an exact match for The Progressive Subway's "Final verdict: 8/10". Re-running the pipeline's own extraction path against the Metal Storm page today (Puppeteer + `extractRating` from `src/scraper/metalstorm.ts`, replicating `fetchMetalStormRating`) yields **8.2** (162 users; staff score 8.6). Every other Metal Storm row in the table except three carries a one-decimal score. This is consistent with the Finding-2 misattribution path (PS row stored first; MS item arrived in a later run; MS's fetch skipped; PS's score reused under the Metal Storm label). It is not conclusive — the community score may simply have read 8.0 on 2026-06-23 and drifted to 8.2 since.

### Case B — pre-window dual reviews: collision guarantees permanent single-source ceiling

Three more albums were independently confirmed as dual-reviewed, with the AMG review published before the first-ingest feed window (so no operational loss occurred *yet*, but the id design guarantees the table can never hold both):

| Album | Stored row | Second source (verified) |
|---|---|---|
| Draconian – In Somnolent Ruin | Metal Storm, 8.1/10, 6/23 | [AMG review](https://www.angrymetalguy.com/draconian-in-somnolent-ruin-review/), 2026-05-13 |
| Elder – Through Zero | Metal Storm, 8/10, 6/12 | [AMG review](https://www.angrymetalguy.com/elder-through-zero-review/), 2026-05-29 (4.0/5.0) |
| Godthrymm – Projections | Metal Storm, 7.6/10, 6/14 | [AMG review](https://www.angrymetalguy.com/godthrymm-projections-review/), 2026-05-28 (2.0/5.0) |

Cross-source overlap is therefore **routine, not rare**: 4 confirmed dual-reviewed albums out of a spot-check of ~8 candidates, in a table of only 98 rows spanning ~6 weeks.

## Finding 6 — Adjacent identity noise observed in the live table (recorded, not investigated)

- A literal `Unknown Band | Unknown Album` row exists (The Progressive Subway, 2026-06-10) — the `extractBandAlbum` failure sentinel. Every future unparseable title from **any** source computes the same id (`unknownband_unknownalbum`), so this single row is a standing collision channel: each new parse failure silently overwrites the previous one.
- AMG non-review posts were ingested as albums: `Record(s) o' the Month – March 2026`, `Yer Metal is Olde: Warning – Watching from a Distance`, `The Willowtip Files: Commit Suicide – Synthetics`. These occupy band+album identities derived from post-title text rather than actual band/album names.

## Finding 7 — `manual_albums` identity (observed from client code)

`manual_albums` does **not** use `computeId` at all. Inserts ([FavoritesPage.tsx:289](../../src/FavoritesPage.tsx)) supply no `id` — the primary key is DB-generated. Consequences observed (not judged here):

- No dedup key on (user, band, album): the same album can be inserted twice by the same user; nothing in the client prevents it.
- No identity linkage between a `manual_albums` row and a `reviews` row for the same album — they carry unrelated ids, so the same album can exist in both tables with no way to correlate them by key.

## Method notes

- Live-table reads were performed with a read-only scratchpad script against Supabase (`select` only; nothing written).
- Metal Storm score verification reused the project's own extractor and Puppeteer wait logic to replicate exactly what the pipeline would extract.
- angrymetalguy.com and metalstorm.net block plain fetches (403 / Cloudflare); AMG dates were read from page JSON-LD via curl with a browser User-Agent, Metal Storm via Puppeteer.
