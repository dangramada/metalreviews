# Criteria Calibration: joint (Chebyshev-center) point estimate

Branch: `criteria-calibration-joint-point-estimate`, off `master`.

## 2026-08-09 — Fix

### Problem (confirmed, not hypothesis)

`solver.ts`'s `solveValues` derived each free `(criterion, level)` value's reported
`.point` as the midpoint of that single variable's independently-solved min/max range —
one separate LP per variable, on different objective axes. Nothing tied these
per-variable midpoints to a single feasible point of the underlying LP, so the model's
own normalization invariant ("best-level values across all criteria sum to exactly 1")
held on the constraint set but not on the reported values themselves.

Confirmed live against Dan's real production account
(`eec42cd4-e714-46a2-ad9c-35714a1d3a2c`, a sparse 6-criteria/33-answer degree-2-only
session, zero total slack — i.e. fully self-consistent answers, not noisy data):
level-5 values summed to **1.3077509833333332**, not 1. This fed both
`computeSolverAccuracy` (persistence.ts) and real album scores (`computeScore`,
`scoreAndRank.ts`, via `user_criterion_weights`) — one real album computed a raw score
of 1.099 (122% in an earlier documented instance), silently clamped to a false 100%
display by `RatingProgressBox.tsx`. Prior write-ups: `deferred-work.md`'s "Solver
point-estimate normalization doesn't jointly hold" entry, `album-rating-drawer.md`.

### Fix

`solver.ts` gained a third solve pass: `computeChebyshevCenter`, a joint LP that finds
the single point maximally interior to the same slack-capped feasible polytope the
existing min/max ranges are solved against. Standard technique — one extra variable `r`
(the inscribed radius), every inequality row widened by `r * ||row.coeffs||₂`, and the
existing normalization equality row copied through **unchanged** (no `r` term, since it
must hold exactly, not "with room to spare"). Explicit `x_j - r >= 0` rows are added for
the value variables only (not the slack variables — slack sitting at 0 is desirable, not
something to push away from). `LevelValue.point` is now this joint solve's coordinate,
not `(min + max) / 2`; `.min`/`.max` are unchanged (still independent per-variable
solves).

**Scope decision (Dan's call, asked explicitly before implementing):** `computeSolverAccuracy`
was NOT changed — it still averages independent per-variable range widths, exactly as
before. Only the point used for scoring/ranking (`scoreProfile`, consumed by
`computeScore`/`rankAlbum` and by `rankCandidatesByAmbiguity`'s candidate-ambiguity
gap) changed. A joint-point-based accuracy redefinition (e.g. distance-to-boundary of
the Chebyshev center) was considered and explicitly rejected for this session — it would
invalidate the already-calibrated 0.85/0.92/0.97 Medium/High/Very High thresholds
without new data to re-calibrate against, a larger and separately-scoped change.

Because the normalization equality row is never widened by the Chebyshev radius, the
joint point satisfies it **exactly** (up to LP float epsilon, ~1e-9), not approximately.
This means, by construction, `scoreProfile` on any fully-rated profile is now `<= 1`
always — not just typically — since each level's point is `<=` its criterion's max-level
point (monotonicity) and max-level points sum to exactly 1 (normalization). This is the
actual fix for the overflow, not a downstream mitigation.

### Verification

- **5-criterion historical fixture** (`REAL_SESSION_*`, `fixtures.ts`): normalization sum
  now `1.0000000000001592` (was already close under the old method for this
  well-determined fixture, but not exact; now exact to float epsilon).
- **Real 6-criteria/33-answer production session** (embedded as a new fixture,
  `REAL_PRODUCTION_SESSION_*` in `fixtures.ts` — Dan's own single-user project data,
  explicit sign-off given to embed it directly, no anonymization needed): normalization
  sum **1.0000000000000002** (was 1.3077509833333332). Zero total slack in both cases —
  confirms the 31/33-answer datasets were never the problem; the point-estimate method
  was.
- `solver.test.ts`'s existing normalization assertion tightened from
  `toBeCloseTo(1, 2)` to `toBeCloseTo(1, 6)` — the old tolerance only ever accounted for
  independent-midpoint drift; the joint point holds far tighter than that now, so
  loosening further would have been backwards. A new test regresses the real production
  session's exact-normalization result directly.
- **Round-34 escalation diagnostic** (does degree-3 become reachable sooner with the new
  point estimate feeding `rankCandidatesByAmbiguity`?): measured, not assumed — **no
  measurable change**. Reconstructed the same degree-2 refinement candidate pool
  `nextAction` would see after this session's 33 answers (74 candidates, dominance-filtered)
  and computed the top-ranked candidate's gap under both the old and new point estimate:
  old method gap = 0.00010, new method gap = 0.00000, both far below `MAX_AMBIGUOUS_GAP`
  (0.05) — `nextAction` still offers another degree-2 question either way. This is
  consistent with `deferred-work.md`'s separately-diagnosed levels-2–5-flatness finding:
  the *within-criterion* under-determination (nothing distinguishes levels 2–5 once the
  extremes are pinned) is a distinct root cause from the *cross-criterion* normalization
  bug this session fixed, and fixing the latter doesn't resolve the former. The external
  Chebyshev-center prototype's earlier "real differentiation across levels 2-5" finding
  did not reproduce on this real dataset under this session's specific LP construction —
  noted for a future session rather than assumed to hold.
- `tsc --noEmit`, `eslint` (touched files clean; pre-existing repo-wide prettier debt in
  unrelated files untouched), `npx vitest run`: 224/224 passing.

### `RatingProgressBox.tsx`

The silent `Math.min(100, …)` display clamp is kept (float-noise safety net and a
reasonable display-rounding guard), but no longer hides overflow silently: if a real
score ever exceeds `1 + 1e-4` again, a `console.warn` fires naming the actual value —
turning a masked bug into a visible one if this fix is ever wrong for some account, or
a slack-heavy contradictory session pushes past tolerance in a way not seen in this
session's verification data.

### Not changed

- `computeSolverAccuracy` / `accuracyTiers.ts` — untouched, per the scope decision above.
- `.min`/`.max` per-value ranges — still independent per-variable solves, unchanged.
- The known levels-2–5 flatness / `MAX_AMBIGUOUS_GAP` scaling questions in
  `deferred-work.md` — unaffected by this fix, still open.
