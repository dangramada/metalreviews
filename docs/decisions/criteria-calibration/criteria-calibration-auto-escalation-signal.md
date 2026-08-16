# Criteria Calibration — Brief 3: auto-escalation stop signal

Branch: `criteria-calibration-auto-escalation-signal` (not yet merged to `master` as of
2026-08-14). Implements the design validated in
`criteria-calibration-ranking-stability-analysis.md`'s Pass 2-4: a tier-gated top-10 set
stability signal that switches Criteria Calibration's degree escalation from automatic to
manual once the ranking has settled.

## Premise correction (before any code)

The originating brief assumed an *existing* automatic-degree-escalation mechanism just
needed a new stop trigger. That was wrong: degree escalation was 100% manual before this
branch — the user always clicked "Add more detail" at every degree, unconditionally. There
was no auto-stop trigger to replace. Confirmed read-only before writing anything; this
branch **builds** automatic escalation from scratch, gated by the signal below — the
originally-intended design, per Dan, just never implemented.

## The signal (`rankingStabilitySignal.ts`)

- `computeTop10Set` — scores `RANKING_TEST_SET`'s 13 albums against live weights, reusing
  `computeScore`/`rankAlbum`'s tie-break convention from `scoreAndRank.ts`.
- `advanceStabilityWindow` — the tier-gated K=2 window itself.

**K-window semantics — a real bug caught before shipping.** The literal reading of "fire
when 2 consecutive tier-eligible checkpoints have an identical top-10 set" is NOT "compare
the two most recent eligible checkpoints" — that reading fires 3 answers early (n=36 on the
real Pass 4 trace, which is actually where K=1 fires). The correct semantics: K is a run
length of consecutive checkpoint-to-predecessor MATCH EVENTS. Verified against the real
frozen Pass 4 data (`PASS4_RANKING_STABILITY_CHECKPOINTS` in `fixtures.ts`, extracted from
the gitignored raw `.jsonl` logs) before finalizing the implementation — the correct
semantics reproduce Pass 4's documented n=39 exactly; the naive reading doesn't. Full worked
example in `advanceStabilityWindow`'s own comment.

## Resume-safety (persistence layer)

`stabilityWindow` is **path-dependent** — unlike accuracy/weights (recomputed fresh from the
current answer list via one LP solve, correct regardless of history), the window needs the
actual trajectory of past checkpoints. Naively replaying that trajectory on resume — the same
pattern `session` uses — would mean re-solving the LP once per historical answer count, which
is not viable given the documented, still-unresolved superlinear solve cost
(`criteria-calibration-reload-glitch-and-sluggishness-fix.md`, 2.2s+ at n=59 for a *single*
solve).

Instead, the compact running state is persisted directly (`user_calibration_status`, two
migrations: `-add-stability-window.sql` then `-add-previous-window.sql`) and read back in
O(1) on resume:

- `fired` gets an atomic `fired = fired OR excluded.fired` in the upsert RPC
  (`upsert_calibration_status`) — the documented, still-open weights/status write-race
  (`criteria-calibration-weights-write-race.md`) could otherwise let a stale out-of-order
  write silently regress an already-fired signal back to unfired on resume, reintroducing the
  exact bug this feature exists to prevent via a different path. Scoped to `fired` only —
  every other field stays subject to the broader race, since their staleness only delays
  firing, never falsely un-fires it.
- A single-Undo-immediately-after-resume gap (roll back only if the specific undone answer
  was itself the change-causing commit, not unconditionally) needed a third persisted field
  (`last_commit_changed_window`) beyond the originally-scoped two — a single `previous`
  snapshot alone can't distinguish "the last commit changed the window" from "a no-op
  happened after an earlier change." Two or more consecutive Undos with zero intervening
  commits is an accepted, explicitly proven-safe gap: any resulting staleness can only make
  the window look *more* fired/settled than the strict truth (never a false un-fire), proven
  algebraically (fired is monotonic; the first Undo is always exactly correct) and by test
  (`rankingStabilitySignal.test.ts`'s "two consecutive undos" cases).

## UI wiring (`CriteriaCalibrationPage.tsx`)

- `windowHistory` (one `StabilityWindowState` per answer) seeded via
  `seedWindowHistoryOnResume`, popped via `popWindowHistory` on Undo, pushed on every real
  commit/redo.
- Auto-escalation is a `useLayoutEffect`, not `useEffect` as originally specified — deliberate
  substitution: `useEffect` would let the browser paint the "degree exhausted" screen for one
  frame before flipping to the next question on every auto-escalation, a visible flash
  `useLayoutEffect` avoids by resolving before paint. Needed a targeted
  `react-hooks/set-state-in-effect` suppression, matching the existing precedent in
  `App.tsx`/`FavoritesPage.tsx` for the same rule.
- Gate-only-the-jump: firing stops automatic degree *escalation* only — real questions still
  in the current degree's pool keep flowing normally.
- Degree-exhausted copy splits pre/post-fired; post-fired copy is framed around calibration
  confidence only, never ranking/stability — same standing rule as `ProgressHeader.tsx`'s exit
  copy.
- Per-degree clarification text derived from `answers.filter(...).length === 0` rather than a
  separate flag, so an Undo back to a degree's first comparison naturally re-shows it.

## Manual QA, pass 1 (synthetic only — superseded by pass 2 below)

Verified via 281 automated tests (unit + integration) plus an oracle-driven synthetic
simulation script (not committed), at a point where no live Supabase session was available
from the working environment:

- **Full 2→6 degree run-through** (ignoring the stop signal, to exercise every degree
  transition): reached true pool-empty exhaustion at degree 6 after 161 answers, tapering
  cleanly (`{2:120, 3:15, 4:8, 5:12, 6:6}`), no crashes or anomalies. Closes the previously-
  flagged gap that no full oracle-to-termination trace existed for the current 6-criteria
  shape (only the older 5-criteria model had one).
- **Leftover questions at firing**: a separate, fully-consistent synthetic run fired at n=111,
  never having escalated past degree 2, with 9 real degree-2 questions still available. Above
  the "2-3, no action needed" bar — flagged, not resolved at the time. Caveat raised then: the
  synthetic oracle is unrealistically clean (zero noise/contradiction), so this number's
  trustworthiness was unclear pending real data.

## Manual QA, pass 2 — live verification (2026-08-14, same day)

A later session found live/browser capability, Supabase credentials, and a dev server were
all actually available (the "no live session" limitation above did not hold — see that
session's capability check). Verified on a disposable test account
(`dgramada07@gmail.com`, distinct from Dan's real account, created specifically for this;
reset to clean state after):

- **Schema/RPC check**: both migrations confirmed live — all 10 expected columns select
  successfully, and `upsert_calibration_status` confirmed to exist with the exact committed
  10-argument signature (via a call that deliberately hit the FK constraint rather than a
  "function not found" error — zero rows written).
- **Per-degree clarification text**: confirmed both directions live — appears on the first
  degree-3 comparison, gone on the second; Undo back to that first comparison correctly
  re-shows it.
- **Undo**: confirmed correct — `answersLength`/`windowHistoryLength` both decrement by
  exactly 1, `fired`/`consecutiveMatchRun` correctly preserved.
- **Refresh-resume**: confirmed correct — `fired`/`consecutiveMatchRun` survive a hard reload
  exactly; `windowHistoryLength` correctly reseeds to 1-2 entries (not the full history, as
  designed). `degree` came back at 2 instead of the in-memory 3 in this specific run — not a
  bug, and not introduced by this branch: the one degree-3 answer had been Undone (and its DB
  row deleted) just before the refresh, so the persisted log genuinely only had degree-2
  answers; `useCalibrationResume`'s pre-existing `maxDegree` inference (unrelated to Brief 3)
  correctly recomputed degree 2 from that real data.
- **Genuine pre-fired auto-escalation**: **not directly observed**, across 4 independent
  trials (1 synthetic + 3 live, with progressively more inconsistent/noisy/random answer
  patterns). All 4 fired while still at degree 2, before the pool ever ran dry. See
  `criteria-calibration-additive-model-degree-sufficiency.md` — this turned out to be a real,
  reproducible property of the additive value model on this 6-criterion catalog, not a test
  artifact: degree-2 comparisons, given adequate coverage, transitively determine the full
  trade-off structure this model can express, so degree-3+ escalation may simply be rare for
  real users under this model. The underlying mechanism (the effect's shared `handleEscalate`
  code path) was confirmed working live via the manual "Add more detail" trigger; the
  automatic branch specifically was not.
- **Real leftover-questions-at-firing**: three real numbers, not the pass-1 synthetic "9"
  alone — **0** (live, moderate noise, pool exhausted the same commit that fired), **7** (live,
  higher noise), **9** (pass-1 synthetic). A real range, not a stable "2-3" — resolves pass 1's
  open caveat: yes, it varies with answer consistency, sometimes to zero.
- **Real 70-answer replay** (Dan's actual production answer sequence, replayed programmatically
  against the current solver — see the additive-model doc for the full analysis): reproduces
  the historical accuracy trajectory exactly (n=9: 0.7228, matching
  `criteria-calibration-ranking-stability-analysis.md`'s numbers to 4 decimal places). Exact
  real firing point: **n=28** — a correction to Pass 4's retrospective every-3rd-sample
  estimate of n=39; the current, fixed system converges to firing faster than that estimate
  suggested.

## Before merging

- Both SQL migrations confirmed **already applied and live** on the database (see pass 2's
  schema/RPC check) — nothing further needed here.
- Genuine live pre-fired auto-escalation remains unobserved directly (see pass 2) — not
  blocking (the mechanism is verified correct via automated tests plus the shared manual code
  path), but worth knowing before treating it as fully proven in the field.
