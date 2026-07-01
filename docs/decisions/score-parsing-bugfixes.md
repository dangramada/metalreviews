# Session decisions — Progressive Subway score-parsing bugfix (July 2026)

## Bug: footnote digit merging into the extracted score

**Symptom:** a card displayed `0.7798165137614679/10` as its score badge, for
"Deathspiral of Inherited Suffering, Elysian Blaze, Panegyrist, & Maerund –
Sunthema" (The Progressive Subway).

**Root cause:** The Progressive Subway renders inline footnote markers as a
`<sup>` tag glued directly onto the score with no separating whitespace, e.g.
`Final verdict: 8.5/10<sup>9</sup>`. Cheerio's `.text()` flattens this to the
literal string `"Final verdict: 8.5/109"` — there is no boundary between the
real denominator (`10`) and the footnote digit (`9`).

`extractRating`'s fraction regex (`src/scraper/progressivesubway.ts`) captured
the denominator with a generic `\d+(?:\.\d+)?`, which greedily consumed all
three contiguous digits as `"109"`. `normaliseRating` then computed
`(8.5 / 109) * 10 = 0.7798165137614679`, and `fetchProgressiveSubwayRating`
(`scripts/ingest.ts`) stringified that as `"0.7798165137614679/10"` — exactly
the corrupted value seen on the card. `normalizeScore()` had no bound/precision
check, so the resulting `normalized_score` (`7.798...`) looked like a small-but-
plausible number and passed through unnoticed.

The Progressive Subway uses footnotes fairly often for asides/citations, so
this was not a one-off formatting fluke — any review with a footnote directly
after the score was exposed to the same bug.

**Blast radius:** 1 of 26 existing Progressive Subway rows was affected (the
Sunthema review above). A second flagged row (`Unknown Band` / `Unknown
Album`, empty score) is an unrelated pre-existing band/album-extraction issue,
not touched here.

**AMG / Metal Storm risk (not fixed, follow-up only):** Angry Metal Guy's
`Rating:` regex (`src/scraper/angrymetal.js`) has the identical
`\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?` structure over flattened `.text()`, so it
is structurally exposed to the same bug if AMG ever glues a footnote directly
after a score. Metal Storm's extractor targets a narrowly-scoped
`span.bold[style*="color:#eebb00"]` element with `parseFloat` + a `0–10`
bounds check, which is much safer but not fully immune (an in-range decimal
glued onto that specific span could still slip through). No changes made to
either — flagging for a future session if it's ever observed in the wild.

## Fix 1 — pin the denominator to a literal `10`

`src/scraper/progressivesubway.ts`: the fraction alternative in `extractRating`'s
regex now matches the denominator as a literal `10` followed by a negative
digit lookahead (`10(?!\d)`) instead of a generic `\d+(?:\.\d+)?`. A fixed-width
literal can't absorb a contiguous trailing digit the way a greedy `\d+` can, so
`"8.5/109"` no longer matches as `8.5/109` — it correctly resolves to `8.5/10`.
This is safe because Progressive Subway scores are always out of 10 (per the
existing `RATING_MAP` 1–10 scale and `ingest.ts`'s `${rating}/10` construction).

Regression test added: `src/__tests__/progressivesubway.test.js` — "ignores a
footnote digit glued directly onto the score (no separator)".

**Scope note:** a bare (non-slash) score with a footnote glued on, e.g.
`"Final verdict: 8<sup>9</sup>"` → `"89"`, is a different, unconfirmed failure
mode (not the reported bug, and not structurally fixable the same way since
there's no fixed denominator to pin). Left as-is; `normaliseRating`'s existing
`Math.min(Math.max(num, 0), 10)` clamp would silently produce `10` for that
case rather than rejecting it. Worth revisiting if it's ever observed for real.

## Fix 2 — sanity guard in `normalizeScore()`

`scripts/ingest.ts`: `normalizeScore()` now returns `number | null` instead of
always `number`. A result is rejected (returns `null`) when:

- the computed 0–100 value falls outside `[0, 100]` (also catches divide-by-zero
  producing `Infinity`), or
- the raw score string has more than one decimal place (e.g. `8.59`, or the
  corrupted `0.7798165137614679`) — no real source score goes beyond one
  decimal (`8.5/10`, `7.3/10`, etc).

This is a safety net for *unknown* future pollution patterns, not a
replacement for Fix 1 — an empty raw string (`""`) still legitimately
resolves to `0`, matching existing behavior; only malformed non-empty values
are rejected.

At the call site (`runIngestion`, `scripts/ingest.ts`), a `null` result from
`normalizeScore` sets both `score` and `normalizedScore` back to the existing
"no score found" sentinel (`''` / `0`) — the same one already used for reviews
Never store a raw `null` in these two fields on freshly-computed rows; that
keeps `MetalReview`'s types unchanged and reuses the card-rendering condition
that already exists (`src/App.tsx`: `{rev.score && rev.score !== '' && (...)}`)
with no new UI state introduced.

Tests added: `scripts/__tests__/normalizeScore.test.ts`.

## Data cleanup

The single affected row (Sunthema) was corrected by re-fetching the live
review page and re-running the fixed `extractRating` against it (rather than
nulling it out) — re-fetching was practical here since the review is recent
and still live. Result: `score` corrected to `"8.5/10"`, `normalized_score` to
`85`, matching what the source page actually shows ("Final verdict: 8.5/10⁹").
No other fields (`artwork_url`, `genre`, `release_date`) were touched.
