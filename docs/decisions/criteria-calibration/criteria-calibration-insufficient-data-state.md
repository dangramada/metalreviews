# Insufficient-data score/rank state

Implements the 2026-09-20 "Insufficient-data score/rank state" brief. Prerequisite reading:
`criteria-calibration-restart-stale-state-diagnostic.md` (same day, read-only) — the root cause
is established there and is not re-derived here.

Branch: `insufficient-data-score-state`.

## The problem, in one line

After Restart the persisted `user_calibration_status.tier` stays frozen behind the guarded RPC
while `user_criterion_weights` is overwritten unconditionally with a zero-answer solve, so Album
Evaluation and Favorites could show "Sharp" beside a near-arbitrary score at the same time.

## The signal, and why it is not what the brief first proposed

The brief specified computing degree-2 coverage live from `user_calibration_answers`, reusing
`isDegreeCoverageComplete`. Step 1 of the plan (diagnostic-first, per house convention) killed
that on two independent grounds:

1. **It is not cheap.** `isDegreeCoverageComplete` (`elicitationDriver.ts:415`) takes the LP's
   solved `values`, not just touch counts. `computeTouchCounts` is only half the gate. An honest
   live read therefore costs a full answer-log fetch **plus a `solveValues()`** on every Album
   Evaluation and Favorites mount — the same solve whose triple-recompute per commit was the
   direct cause of the round-50 UI blocking (`commitComputation.ts`'s header) and which carries
   the near-singular breakdown history that `criteria-calibration-solver-crash-safety-net.md`
   exists to contain.
2. **It is far wider than the bug.** In normal operation "degree-2 coverage not complete" is
   exactly `tier === 'none'`. Adopting it would have stripped the score and rank from every
   pre-degree-2 user, reversing `album-rating-soft-gate.md`'s 2026-08-09 hard→soft decision —
   and, combined with the brief's own §4 "no bypass, ever" constraint, would have **permanently**
   trapped the four preference shapes that never exhaust degree 2 (`degreeTiers.ts`'s module
   header; `DEGREE_2_FREEZE_ANSWER_THRESHOLD = 78` exists precisely because that state is
   reachable). Those users would have had no score, ever, and no way out.

Both were put to Dan before any code was written. He chose the narrower signal (option A):

```ts
hasInsufficientData = liveAnswerCount < persistedStatusAnswerCount;
```

**Why this is equivalent for the bug, not an approximation of it.** The persisted tier already
_is_ the degree-coverage signal — `degreeTiers.tierForPosition` is what writes it. The only thing
that makes it lie is the guard freezing it, and the diagnostic established (Q2, plus Scenarios
2–4 live, including Undo and a degree-boundary promotion) that the frozen window is precisely
`live < stored`. Outside that window the guard has released at `>=` and the stored tier is
current. So this reads the same fact the expensive computation would have, via the one number
Restart cannot leave stale.

Cost: one `head: true` count query added to the `Promise.all` already in `useCalibrationGate`.
No LP, no helper extraction from `elicitationDriver.ts`, no second implementation of the
coverage gate to keep in sync with the first.

## What changed

**`src/hooks/useCalibrationGate.ts`** — `status` select widens to `tier, answer_count`, a third
parallel query counts `user_calibration_answers`, and the hook returns `hasInsufficientData`. The
derivation and the rejected alternative are recorded in the hook itself, since that is where a
future reader will be tempted to "upgrade" it to a real coverage read.

**`src/theme.ts` + `design-tokens.md`** — new `status.info.bg` / `status.info.text`
(`blue.900` / `blue.200`), tokenizing the raw pair `FavoritesPage.tsx`'s confirmation dialogs
have used since before the token existed. This closes the gap `design-system-audit-2026-08.md`
flagged and proposed by this exact name. `status.warning`, which that audit also proposed, is
deliberately **not** defined — nothing in the app renders in a warning tone yet, and an unused
token is one more thing `designTokensDoc.test.ts` has to be kept honest about for no benefit.

**`src/AlbumRatingPage.tsx`** — a `status="info"` `Alert` above both layouts when the signal is
true, placed as a page-level sibling exactly like `CriteriaCalibrationPage.tsx`'s resume banner
so neither rating layout has to make room for it internally. It carries a `Link` to
`/calibration` using the existing "Go to calibration" wording verbatim, with no `returnAlbumId`
(that continuity gap is pre-existing and explicitly out of scope, per the brief's §5).

**No dismiss control**, unlike the calibration resume banner it is modeled on. That banner
reports a suggestion; this one reports a state the user can only leave by calibrating, and
dismissing it would leave the dashes below it with no explanation on screen.

**`src/components/album-rating/RatingProgressBox.tsx`** — Score, Rank and the score-level value
all take the `'—'` the missing-summary case already used, rather than a third visual state;
there is genuinely no number either way and the banner distinguishes the two. The segment bar
empties completely. The calibration `IconButton` stays **accented** even at a stale `very_high`:
its mute means "nothing left to gain", and this is the state with the most left to gain. The
prop threads through `DesktopRatingLayout`/`MobileRatingLayout`, which is why both changed.

**`src/FavoritesPage.tsx`** — `rankOverlayBadge` renders `'—'` in place of the rank, and
`confidenceWarningBadge` now fires on `hasInsufficientData` as well as `tier === 'none'`. Its
plain `!` character becomes `LuOctagonAlert` at 16px per the project's Lucide-only convention for
new UI. The badge's copy is one shared constant across both breakpoints (desktop `Tooltip`,
touch `title`/`aria-label`) so the two cannot drift: "No score yet. Answer a round of comparisons
in calibration." It names what to do rather than how settled the old score was, because there is
no old score left to describe.

## What was deliberately not touched

Per the brief's §3, and worth restating because each is a plausible "while we're here": the
guarded `upsert_calibration_status` RPC and its monotonic `answer_count`; the unconditional
`user_criterion_weights` overwrite; `deleteAllAnswers`; the hard/soft `CalibrationGateDialog`
gates; and the calibration page's own resume banner (this adds the same idea to two surfaces,
it does not extract a shared component for three).

This is a **display-layer workaround, not a fix**. The persistence layer's own correctness
remains open — see `deferred-work.md`.

## What NOT to change

- **Do not "upgrade" `hasInsufficientData` to a live degree-2 coverage read** without re-reading
  the two objections above. The performance one is fixable in principle; the soft-gate reversal
  and the permanently-trapped freeze shapes are product decisions that would need Dan's sign-off
  first.
- **Do not add a bypass** ("view score anyway"). Explicit constraint from the brief: unlike the
  soft gate, calibration alone decides when a score becomes displayable.
- **Do not mute the calibration action on `very_high` without checking `hasInsufficientData`.**
  The muted state means "nothing left to gain" and a stale `very_high` is the opposite.

## Verification

54/54 test files, 437/437 tests on the branch. Lint clean on every touched file (the repo-wide
`npm run lint` and `npm run type-check` baselines are both already dirty on `master` — see
`deferred-work.md`). The `status.info` pair was confirmed resolving live in the running dev
server to `rgb(20, 32, 74)` / `rgb(191, 219, 254)`.

New tests: three cases in `RatingProgressBox.test.tsx` (no score/rank/tier name, empty segment
bar, action stays accented at a stale `very_high`) and two in `FavoritesPage.test.tsx` exercising
`FavoriteListItemRow` directly, since the rank badge only renders alongside a `ratingSummary` the
page derives from a live fetch.

Both changed surfaces sit behind `RequireAuth` and no credentials are stored anywhere in this
project, so the brief's §6 replay (mature session, then Restart, on the disposable QA account) is
Dan's step, not one this session could run.

## Urgent follow-up (same day) — Restart's own status write never landed either

Dan's §6 replay found the fix above doing exactly what it was built to do — showing
insufficient-data correctly — but the state never cleared: mature session → Restart →
re-calibrated past Blurry (degree 2 complete, +5 into degree 3) → still insufficient-data,
unchanged, one more answer later too.

**Root cause.** `handleRestart` calls `applyCommitComputation(computation)` on the
freshly-emptied local answer array before touching the database. That function's own status
write goes through the guarded `upsert_calibration_status` RPC, carrying `tierRef.current` — a
ref that still holds the OLD session's tier at this exact instant, since it only updates on a
later render — at `p_answer_count: 0`. Against any mature session's stored `answer_count`, the
guard's `0 >= stored` is false, so the RPC rejects it outright. This is not new: the original
diagnostic (`criteria-calibration-restart-stale-state-diagnostic.md`, Q2) already described this
exact write and its rejection. What was missed at plan time is that **nothing else in Restart
ever attempted to reset `user_calibration_status`** — `deleteAllAnswers` only ever touched
`user_calibration_answers`. So Restart's only status write was this one, doomed write, and the
row was never actually cleared, regardless of how much progress the new session made. The
exposure window this bug produces is tied to how mature the OLD session was (the guard only
releases once the new session's answer count catches back up to the old one), not to real
progress in the new session, which is exactly what Dan observed.

**Fix.** New `resetCalibrationStatus(userId)` in `persistence.ts`: a plain client `.upsert()` on
`user_calibration_status` setting `{ tier: 'none', accuracy_value: 0, answer_count: 0 }`,
bypassing `upsert_calibration_status` entirely. This is safe because the table's own RLS policy
(`for all using/with check auth.uid() = user_id`) already permits a plain client upsert — the
RPC's guard is application logic layered on top of that policy for the guard's own purpose
(rejecting a stale write racing a fresher one within a live session), not a security boundary,
and Restart is the opposite case: a deliberate full reset, not a race.

**Why ordering, not just calling the new function, was the actual fix.** If
`resetCalibrationStatus` ran BEFORE the stale-tier write settles, its own `answer_count: 0` would
make the guard newly PERMISSIVE for that still-in-flight write (`0 >= 0` is true), so the stale
write could land second and clobber the correct reset right back to the old tier — the same bug,
now racing instead of failing outright. `applyCommitComputation` was changed to return its write
promise (previously fire-and-forget, already internally `.catch()`-guarded so it never rejects),
and `handleRestart` — now `async` — awaits it before calling `deleteAllAnswers` and
`resetCalibrationStatus`, guaranteeing the reset is the temporally last write to the row.

**Untouched, still.** `upsert_calibration_status`'s guard itself, `user_criterion_weights`'s
unconditional overwrite (already correct — Restart really does want a fresh zero-answer solve
there), and every other item in "What was deliberately not touched" above.

**Verification.** New regression test (`CriteriaCalibrationRestart.test.tsx`) drives a real
Restart click (confirm dialog included) against a resumed 29-answer session and asserts both that
`resetCalibrationStatus` is reached and that it lands strictly after the stale-tier write —
resolving both mocks synchronously would have let a same-tick reordering bug pass, so the
stale-tier mock resolves on a real delay. 55/55 test files, 439/439 tests.

## Second follow-up (same day) — the reset itself was correct, the signal's boundary wasn't

Dan logged into the running dev server directly (disposable QA account) and did a real Restart.
The reset fix above worked exactly as designed — confirmed by reading `user_calibration_status`
and `user_criterion_weights` straight from the Supabase REST API, not through the UI:
`answer_count: 0`, `tier: 'none'`, 0 rows in `user_calibration_answers`, and 30 weight rows all
sitting on the flat zero-answer ramp. But Album Evaluation and Favorites still showed a real
score and rank (87%/64%, mathematically confirmed to be a live recomputation off exactly those
ramp weights, not a cached leftover) instead of dashes.

**Root cause.** `hasInsufficientData`'s condition was `liveAnswerCount < persistedAnswerCount`.
Right after a Restart that reset correctly, both sides are 0, and `0 < 0` is false — the reasoning
at the time ("the persisted tier is honest at that instant, so there's no staleness to catch")
was true but answered the wrong question. The signal was built to catch a STALE TIER, but the
actual failure mode here is a MEANINGLESS SCORE: at live count 0, `user_criterion_weights` is
_always_ the flat, information-free ramp — no other write path leaves weight rows sitting at 0
answers, since both the very first commit and every Restart write weights unconditionally from
whatever's in `session.fullLog` at that moment. A tier label being honest about "zero answers"
does not make a percentage computed from zero-information weights meaningful to show.

**Fix.** Added a second, independent condition, `weightsPresent && liveAnswerCount === 0`,
alongside the existing staleness check (`useCalibrationGate.ts`). `weightsPresent` is required so
a genuine brand-new account (no weight rows at all, already hard-gated elsewhere before reaching
either surface) doesn't trip the Restart-specific banner copy it never earned — same reasoning as
the original `<=`-would-be-wrong argument in the first follow-up, just now scoped correctly to
the one condition that actually needed it instead of the whole comparison.

**Verification.** `useCalibrationGate.test.ts`'s boundary suite was rewritten (5 cases: the (0,0)
post-reset boundary now asserts TRUE; brand-new-account still asserts false; the original
guard-rejection bug; a healthy caught-up mid-session; Undo dropping live behind persisted).
56/56 files, 444/444 tests. Re-verified live on the QA account after the fix: `/rate/:albumId`
shows the info banner with dashed Score/Rank/score-level and zero filled segments;
`/favorites` shows a dashed rank badge on both rows. Dan's exact §6 replay (re-answer past Blurry
after Restart and confirm the state clears at the right point) is still owed.
