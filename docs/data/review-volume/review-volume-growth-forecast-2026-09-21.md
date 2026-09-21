# Review-volume growth forecast (input to pagination/virtualization decision)

**Date:** 2026-09-21. Read-only data-gathering pass — no code, filtering, or schema changes.
Produced to give the Home page pagination/virtualization architecture decision a real growth
curve instead of scattered point-in-time counts. Script:
`scripts/diagnostics/review-volume-growth-forecast-2026-09-21.ts` (queries Supabase directly via
the service key, one-off, not meant to be rerun on a schedule).

**No architecture recommendation is made here** — that decision stays on the design side. This
is the numbers it needs.

## Data and exclusions

- Date axis: `published_at` (not `created_at` — see brief; `created_at` reflects ingest time).
- Excluded: the `Unknown Band | Unknown Album` sentinel row (see
  `unknown-band-collision-audit.md`) — none of the 348 reviews in the window fell on it, so this
  had no numeric effect, but the exclusion is in the query regardless.
- No separate "known-lost/overwritten id-collision" row list exists beyond that single sentinel
  — the same-title release-group collision fix
  (`album-identity/album-identity-same-title-release-group-collision.md`) is a metadata-pointer
  bug (wrong artwork/genre), not a row-loss mechanism, so nothing from it needed excluding here.
- Earliest review: 2026-05-20. 348 reviews / 316 distinct albums (with ≥1 review) as of
  2026-09-21. A further 11 albums exist with zero reviews (manual adds not yet scraped/matched)
  — excluded throughout, matching the app's own `reviews!inner` query.

## Weekly series

18 ISO weeks of data (2026-W21 through 2026-W38, both complete weeks — today, 2026-09-21, falls
in W39, so nothing here is a partial in-progress week).

| Week | AMG | Progressive Subway | Metal Storm | Total reviews | Distinct albums (first-review week) |
|---|---|---|---|---|---|
| 2026-W21 | 0 | 0 | 4 | 4 | 4 |
| 2026-W22 | 0 | 0 | 9 | 9 | 9 |
| 2026-W23 | 0 | 1 | 6 | 7 | 7 |
| 2026-W24 | 2 | 6 | 5 | 13 | 13 |
| 2026-W25 | 10 | 8 | 1 | 19 | 19 |
| 2026-W26 | 14 | 7 | 7 | 28 | 28 |
| 2026-W27 | 12 | 8 | 3 | 23 | 23 |
| 2026-W28 | 12 | 7 | 6 | 25 | 24 |
| 2026-W29 | 10 | 4 | 5 | 19 | 16 |
| 2026-W30 | 11 | 7 | 5 | 23 | 22 |
| 2026-W31 | 11 | 8 | 4 | 23 | 17 |
| 2026-W32 | 10 | 8 | 2 | 20 | 17 |
| 2026-W33 | 12 | 6 | 2 | 20 | 19 |
| 2026-W34 | 10 | 5 | 2 | 17 | 15 |
| 2026-W35 | 13 | 5 | 5 | 23 | 20 |
| 2026-W36 | 15 | 7 | 1 | 23 | 20 |
| 2026-W37 | 10 | 8 | 6 | 24 | 21 |
| 2026-W38 | 11 | 7 | 10 | 28 | 22 |

The first 3–4 weeks (W21–W24) look like pipeline ramp-up, not steady state — AMG shows zero
reviews until W24, and combined volume roughly quadruples from W21 to W26 before flattening.
From W25 onward, weekly totals sit in a fairly tight 17–28 band with no strong visual trend.

## Rate: accelerating, but driven by early ramp-up

Simple linear fit (`y = intercept + slope·week_index`) over all 18 weeks:

| Series | Intercept | Slope (reviews/wk²) | Read |
|---|---|---|---|
| Combined | 11.79 | **+0.888** | accelerating |
| Angry Metal Guy | 3.56 | +0.647 | accelerating |
| The Progressive Subway | 3.23 | +0.287 | mildly accelerating |
| Metal Storm | 5.01 | −0.046 | essentially flat |
| Distinct albums | 12.40 | +0.607 | accelerating |

Nominally "accelerating" for every source but Metal Storm, but this is dominated by the W21–W24
ramp-up, not by a genuine still-in-progress acceleration — the recent 8 weeks (W31–W38) average
**22.3 reviews/wk** and **18.9 new albums/wk**, close to flat, not visibly still climbing.

## Projections: trend vs. flat

Because the naive linear fit extrapolates the *rate's own slope* forward indefinitely, a
12-month projection off the full-history fit compounds the ramp-up bias into an implausible
~50 reviews/week by next summer. Two projections are given — **flat (recent 8-week average held
constant) is the more defensible planning number**; trend is shown for completeness only.

| Horizon | Reviews (trend) | Reviews (flat) | Albums (trend) | Albums (flat) | Payload KB (trend) | Payload KB (flat) |
|---|---|---|---|---|---|---|
| +3 months | 778 | **637** | 666 | **561** | 777 | **636** |
| +6 months | 1,358 | **927** | 1,120 | **807** | 1,356 | **925** |
| +12 months | 2,969 | **1,505** | 2,333 | **1,298** | 2,963 | **1,502** |

Current baseline: 348 reviews, 316 albums, 347.3 KB total payload.

## Payload size (actual app query)

Measured on the frontend's real `albums` query (`ALBUMS_WITH_REVIEWS_SELECT` in `src/App.tsx`,
including joined `artwork_url`/`genre`/`release_date` and nested `reviews`), not a synthetic
estimate:

- **0.998 KB/review row**, **1.099 KB/album row**
- Current full initial-fetch payload: **347.3 KB** (316 albums, 348 reviews)

No Metal Storm back-catalogue discontinuity applies to this forecast: `filterMetalStormBackCatalogue()`
was fixed on 2026-09-21 to key visibility off the gap between each review's `release_date` and
its own `published_at` (hidden past 365 days) rather than calendar year, so there is no longer a
year-boundary rollover for this projection to account for — see
`metalstorm-backcatalogue-exclusion.md` ("2026-09-21 fix" section).
