# Checkpoint copy rewrite + permanent tier badge

Branch: `criteria-calibration-checkpoint-copy-rewrite`, cut from `master` (does not depend on
the still-unmerged `criteria-calibration-freeze-checkpoint` branch — see "Coordination with the
freeze-checkpoint branch" below). Rewrites all four existing checkpoint screens' copy and adds a
fifth variant's copy shell (`'frozen'`, for the freeze checkpoint's own trigger logic on the
other branch), per Dan's brief. Solver logic (`MAX_VALUE_RANGE_FOR_COVERAGE`,
`isDegreeCoverageComplete`, the 78-answer freeze threshold, `isDegree2Frozen`) is untouched.

## What changed, and why

The pre-rewrite copy (2026-08-18, `criteria-calibration-degree-tiers-and-progress.md`) was long,
justificatory in tone ("that's what Blurry means, nothing more and nothing less"), and only
showed the tier name inline in the headline text — never as a separate visual element, and never
at all for the `'exhausted'` screen or the (previously silent) degree-5 boundary. Dan rewrote the
copy against six rules, all load-bearing for any future edit:

1. No em dashes.
2. Never say "label" as a noun in body text — the tier name is a badge, seen not read about.
3. The accuracy percentage never appears bare — always attached to an explicit subject
   ("you're N% clear on what matters most to you", never a lone "N%").
4. No phrasing that reads as failure or wasted effort at a low percentage, even at the top tier
   (Sharp at 60% is a real, valid outcome — the percentage measures how DETERMINATE the
   preference model is, not how well the user answered).
5. Pausing is always mentioned, but as the last sentence, short, never parenthetical, never
   equal in weight to the reason to continue.
6. At most 3 short CONTENT sentences per body — see "Rule 6 and Tip 4's fourth sentence" below
   for how this was reconciled with the literal brief text.

## Where the copy lives

`src/lib/criteria-calibration/checkpointCopy.ts` — new file, same single-source-of-truth pattern
as `accuracyTierLabels.ts` (verified before creating it: no existing checkpoint-copy constants
file, the copy lived inline in `CalibrationCheckpoint.tsx`'s `headline()`/`body()` functions).
Every string is a named export; the two interpolated bodies (percentage) are named functions
returning a single joined string, not an array of stacked paragraphs — the brief's own
formatting reads each tip's body as one continuous paragraph, so `CalibrationCheckpoint.tsx` now
renders it as a single `<Text>`, not `.map()` over multiple blocks like before.

## Rule 6 and Tip 4's fourth sentence

Tip 4 as given has four sentences, not three. Reconciled by reading rule 6's cap as applying to
CONTENT sentences only, excluding the always-trailing pause sentence (rule 5 already treats it
as separate and always-last). Under that reading every tip is consistent:

| Tip | Content sentences | Pause sentence | Total |
|---|---|---|---|
| 1 (promotion) | 2 | 1 | 3 |
| 2 (ceiling) | 2 | 1 | 3 |
| 3 (terminal) | 2 | none (nothing left to pause before) | 2 |
| 4 (frozen) | 3 | 1 | 4 |

Flagged to Dan before implementation per the plan-before-code gate; proceeded on this reading
since it was not corrected.

## Old copy -> new copy, per variant

### Tip 1 — promotion (`'medium'`, `'high'` variants: degree-2 and degree-3 boundaries)

Old headline: `"2-criteria comparisons complete — Blurry"` (degree number and tier baked into
one string, tier only visible here).
New headline: `"You've compared everything at this level"` (generic — the badge carries the tier
now, permanently and separately).

Old body (`'medium'`, 3 paragraphs, ~80 words): explained what Blurry means, what going further
requires, restated the percentage with a caveat about when it updates.
New body (1 paragraph, 3 sentences): `checkpointPromotionBody` — states the percentage attached
to its subject, says a few more comparisons will make a felt difference, mentions pausing last.

Old buttons: `"Keep comparing"` / `"Stop here — evaluate albums"` (unequal visual weight: solid
orange primary + outline secondary).
New buttons: `"Continue"` / `"Pause here"`, equal visual weight, side by side (`flex="1"`, same
`maxW`, one solid one outline but same size and row position).

### Tip 2 — ceiling (`'veryHigh'` variant: degree-4 AND degree-5 boundaries, both now)

Old: only degree-4 exhaustion showed a screen (`'veryHigh'`, "Four criteria at a time, all
answered... the last label..."); degree-5 exhaustion was **silent** (`isLabelChangingDegree(5)`
returned `false`, auto-progression carried it with no screen at all).

New: both degree-4 and degree-5 exhaustion route to the SAME `'veryHigh'` variant and the same
`checkpointCeilingBody` copy — `isLabelChangingDegree` now returns `true` for degree 5 too (see
"Structural change" below). Headline is the same generic Tip-1 headline (the badge, not the
headline, is what tells the user they're at Sharp); body says continuing still sharpens the
percentage, without promising a tier change, then pauses.

Verified live (screenshot, see "Manual verification" below) that showing the identical Sharp
badge and identical body text at two consecutive boundaries reads as a plain confirmation, not a
glitch or a duplicate screen.

### Tip 3 — terminal (`'exhausted'` variant: degree-6 exhaustion, `canEscalate: false`)

Old headline: `"No comparisons left to ask"`.
New headline: `"You've compared everything, at every level"`.

Old body (3 paragraphs): neutral-cause statement, percentage, a note that weights are saved.
New body (2 sentences, no pause sentence — nothing left to pause before): percentage attached to
subject, `"That's as far as comparisons can take it."` The neutral-about-cause rule (rule 2 in
`CalibrationCheckpoint.tsx`'s header) is unchanged and still asserted by
`CriteriaCalibrationCheckpoints.test.tsx`'s "terminal copy blames neither..." test.

Old button: `"Evaluate albums"` (single, solid).
New button: `"Done, evaluate albums"` (single, solid) — same structural role, new text.

### Tip 4 — frozen (new `'frozen'` variant, copy only, no trigger wired here)

Headline: `"Your answers have stopped narrowing this down"`.
Body: percentage attached to subject, states recent answers aren't adding much at this level,
says moving to the next level can reveal what this one can't, pauses last.

Framed around INFORMATION, never around "ran out of questions" — the degree-2 candidate pool is
NOT empty when this fires (`criteria-calibration-freeze-checkpoint-step1-pool-check.md`: 54-62
candidates remain at round 90 across all four blocked shapes), so any "exhausted the questions"
framing would be false. Buttons: `"Continue"` / `"Pause here"`, same equal-weight layout as Tip 1
and Tip 2.

**Not wired to any trigger on this branch.** The badge for this variant is a separate `tier` prop
(see "Structural change" below), not derived from the variant — when the freeze-checkpoint
branch's `isDegree2Frozen` fires, it will pass whatever the actual current tier is (typically
`'none'`/Unfocused, since coverage never completes for the four blocked shapes), not a tier this
screen claims to have reached.

## Structural change: permanent badge + `tier` prop decoupled from `variant`

Before: the tier name was interpolated directly into the headline string
(`` `${degree}-criteria comparisons complete — ${ACCURACY_TIER_LABELS[variant]}` ``), so it only
ever appeared for the three variants where `variant` and `tier` were the same value by
construction, and never for `'exhausted'`.

After: `CalibrationCheckpointProps` takes `tier: AccuracyTier` as a prop SEPARATE from `variant`.
`variant` picks the body/headline template (4 templates map from 5 variants: `'medium'`/`'high'`
share the promotion template, `'veryHigh'` alone uses the ceiling template, `'exhausted'` uses
the terminal template, `'frozen'` uses the frozen template). `tier` controls only the visible
badge (a plain Chakra `<Badge>` plus a `[ⓘ]` `Tooltip` with the shared, always-identical tooltip
text) and is shown **unconditionally, every render**, no hiding logic. `CriteriaCalibrationPage`
already computed `tier` before this change (line ~421, `tierForCompletedDegrees(...)`) — passing
it to the checkpoint required no new computation, just one more prop on the existing call site.

This decoupling is what makes the freeze checkpoint's badge correct without any special-casing:
`'frozen'` will always receive whatever `tier` the page's existing derivation says is true right
now (typically `'none'`), rather than needing its own badge-selection logic.

## Structural change: degree 5 now shows a checkpoint (was silent)

`degreeTiers.ts`'s `isLabelChangingDegree` gains degree 5 (`2 || 3 || 4 || 5`, was `2 || 3 || 4`).
This is the one change in this branch that is not pure copy: before, degree-5 exhaustion
auto-escalated with no screen at all (`isLabelChangingDegree(5) === false`), the only degree
boundary the user could never see marked. Once the badge became permanently visible everywhere
else, hiding this one boundary because "the tier doesn't change" stopped making sense — a badge
that's honestly still Sharp is not noise, and the ceiling copy exists exactly to explain that.
`tierForCompletedDegrees` itself is UNCHANGED (still maps degree 4 and degree 5 to `'veryHigh'`
identically) — only whether a screen shows at all changed. Confirmed via the updated
`degreeTiers.test.ts` test (renamed from "shows a checkpoint only at the degrees whose completion
changes the label" to "shows a checkpoint at every degree boundary except the terminal one") and
`CriteriaCalibrationCheckpoints.test.tsx`'s new degree-5 test.

## Verification: weights don't reset, label doesn't retroactively promote

Both already true architecturally and unchanged by this branch (neither `checkpointCopy.ts` nor
the `tier`/`variant` decoupling touches `tierForCompletedDegrees`, `completedDegrees`, or the
solver). Restated here because the brief asked for an explicit check on the specific path where
it matters: a session that reaches degree 3 WITHOUT degree 2 ever having been marked complete
(the freeze-then-continue path the other branch's checkpoint produces).

`completedDegrees(currentDegree, atDegreeBoundary)` returns `currentDegree - 1` when
`atDegreeBoundary` is false — so while at degree 3 mid-comparisons (not yet at ITS OWN boundary),
`completedDegrees(3, false) = 2`, which maps to `tierForCompletedDegrees(2) = 'none'`
(Unfocused), REGARDLESS of whether the degree-2 boundary ever fired. Once degree 3 hits its own
real boundary, `completedDegrees(3, true) = 3` maps to `'high'` (Clear) — the badge jumps
Unfocused straight to Clear, skipping Blurry entirely, because Blurry is only ever assigned by
`completedDegrees` returning exactly 2 at a REAL boundary event, which never happened for this
session. No code change was needed to get this right; the existing degree-indexed mapping
already has no memory of the specific path degree got to `currentDegree`, only of the boundary
degree and the boundary flag. Verified by
`CriteriaCalibrationCheckpoints.test.tsx`'s `'skips the Blurry badge entirely when degree 2 was
never completed (the freeze-then-continue path)'` test: resumes a session at degree 3 (matching
what the freeze checkpoint's "Continue" will produce, without needing that trigger wired up),
fires the degree-3 boundary, and asserts the Blurry badge never renders and the headline never
names the skipped level.

Weight continuity: the solver (`solveValues`) re-runs against the full answer log on every
render regardless of what `degree` currently is — `degree` is a page-local pointer to which
comparisons to ask next, not solver state. Moving from degree 2 to degree 3 without a completed
boundary changes nothing about what gets passed to the solver; it only changes which comparisons
`nextAction` offers next. No test was added specifically for this since it follows directly from
`nextAction`'s signature (`session`, `levelsPerCriterion`, `degree`) never gating what the solver
sees on any notion of "degree completion" — the solver reads `session.fullLog` alone.

## Coordination with the freeze-checkpoint branch

`criteria-calibration-freeze-checkpoint` (Step 1 diagnostic committed, Step 2 implementation not
yet started) also needs to touch `CalibrationCheckpoint.tsx` to wire its trigger condition. To
avoid two branches editing the same file's variant logic, this branch:

- Cut from `master`, not from `criteria-calibration-freeze-checkpoint` (which is unmerged).
- Defines the full `'frozen'` variant (type, headline, body, badge behavior) here, even though
  no caller produces it yet on `master` — dead code until the freeze-checkpoint branch wires a
  condition to it.

Once this branch merges, `criteria-calibration-freeze-checkpoint` should rebase onto the updated
`master` and its Step 2 work becomes: add `isDegree2Frozen`/the 78-answer threshold, and one
`checkpoint = 'frozen'` branch in `CriteriaCalibrationPage.tsx`'s existing checkpoint derivation
plus a `handleFreezeContinue` handler — no further edits to `CalibrationCheckpoint.tsx` or
`checkpointCopy.ts` should be needed.

## Manual verification

Temporary dev-only route (`/dev-checkpoint-preview`, rendering `CalibrationCheckpoint` directly
with fixed props for all four tips plus the skip-Blurry case) added, screenshotted in-browser,
then removed before this commit — same "temporary preview harness, removed before merge"
convention as `/dev-rating-preview` on `album-rating-page-desktop-redesign`. Confirmed visually:

- Tip 1 (degree-2 and degree-3): badges "Blurry" and "Clear" render correctly, buttons equal
  width side by side.
- Tip 2 (degree-4 and degree-5): both show "Sharp" with identical body text — reads as a
  consistent confirmation, not a glitch or a stuck screen, side by side or one after another.
- Tip 3 (terminal): single "Done, evaluate albums" button, "Sharp" badge.
- Tip 4 (frozen): "Unfocused" badge, correct copy, equal-weight buttons.
- Tooltip: hovering the `[ⓘ]` icon on the Tip-1 card showed the exact shared tooltip text.

`npx tsc -p tsconfig.app.json --noEmit`: 491 errors before and after this change (identical
count via a stash/diff comparison) — all pre-existing, unrelated to any file this branch
touches; zero errors in `checkpointCopy.ts`, `CalibrationCheckpoint.tsx`,
`CriteriaCalibrationPage.tsx`, or `degreeTiers.ts`.

`npx vitest run`: 328/328 passing (one pre-existing test, `degreeTiers.test.ts`'s
degree-5-is-silent assertion, updated to match the new behavior; `CriteriaCalibrationCheckpoints.test.tsx`
substantially rewritten for the new copy/badge/button structure, plus new tests for the
permanent badge, the tooltip, and the skip-Blurry path).

## What's still not in scope

- Full visual styling of the checkpoint screens (border, colors, general layout) — same
  not-yet-styled status as before this branch.
- The freeze checkpoint's trigger logic, threshold, or `isDegree2Frozen` — owned by
  `criteria-calibration-freeze-checkpoint`.
- Any solver/coverage-gate logic.
