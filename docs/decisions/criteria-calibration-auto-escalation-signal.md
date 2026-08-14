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

## Manual QA (no live Supabase session available from this environment)

Verified via 281 automated tests (unit + integration) plus an oracle-driven synthetic
simulation script (not committed), substituting for live E2E:

- **Full 2→6 degree run-through** (ignoring the stop signal, to exercise every degree
  transition): reached true pool-empty exhaustion at degree 6 after 161 answers, tapering
  cleanly (`{2:120, 3:15, 4:8, 5:12, 6:6}`), no crashes or anomalies. Closes the previously-
  flagged gap that no full oracle-to-termination trace existed for the current 6-criteria
  shape (only the older 5-criteria model had one).
- **Leftover questions at firing**: a separate, fully-consistent synthetic run fired at n=111,
  never having escalated past degree 2, with 9 real degree-2 questions still available. Above
  the "2-3, no action needed" bar — flagged, not resolved. Two caveats limit how much this
  number should be trusted: the synthetic oracle is unrealistically clean (zero noise/
  contradiction — a real session's messier answers would likely escalate past degree 2 much
  earlier, as Dan's real 71-answer trace did), and 9 leftover questions *at the degree already
  in progress* reads differently under gate-only-the-jump than 9 leftover questions after a
  forced escalation would. Not independently checked against real production data.

## Before merging

- Run both SQL migrations manually in the Supabase SQL editor (not auto-applied).
- No live-browser verification has been done — worth a real run-through before merge, ideally
  against Dan's actual account so the leftover-questions caveat above can be resolved with
  real data instead of a synthetic oracle.
