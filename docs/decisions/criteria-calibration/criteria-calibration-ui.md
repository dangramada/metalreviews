# Criteria Calibration screen — UI-only pass (Phase 7)

Branch: `criteria-calibration-ui`. Scope: markup/styling/local interaction state only.
No scoring-engine (preference graph, LP solver) or Supabase wiring — that is a
separate, future brief. All data on this screen is mock/placeholder.

Terminology: this feature was called "tie-break" in earlier discovery docs. That
term is retired — this doc and all code/comments use "Criteria Calibration"
throughout. (Discovery docs for this feature, e.g. `aoty-ranking--*.md`, live only
in Project knowledge on claude.ai, not in this repo — intentional, not an oversight.)

## Layout, top to bottom

1. `QuestionPrompt` — fixed heading, no edit affordance.
2. `ProgressHeader` — `RoundGaugeGroup` (Progress ring + Accuracy status) + "Stop
   here". Never fades; only its values update.
3. `ComparisonRow` — two `OptionCard`s + `VsDivider`, no "Card A"/"Card B" labels.
4. `EqualButton`.
5. `HistoryActions` (`UndoAction` + `RedoAction`).

## Why `RadioCard` was dropped

Chakra's `RadioCard.Item` is a native radio input + label; clicking anywhere in
`ItemControl` toggles the hidden input. The spec requires the *only* click target
to be a dedicated full-width `SelectAction` button, not the whole card or a corner
indicator — those two behaviors conflict. `OptionCard` is a plain `Box`; `selected`
is local boolean state, not native radio-group state (this flow isn't really a
persistent radio group — it's "pick one, then the pair changes").

## Selected-state contrast handling

The active-state convention (`bg="accent.border"` + `color="accent.ink"`, same as
the active nav tab and the score-slab high-score threshold) is reused directly, as
required. One thing the brief didn't spell out: `CriterionRow`'s child `Text`
elements each set their own explicit `color` (`text.primary`/`text.dim`/
`text.muted`), so a parent-level color override doesn't cascade to them. `selected`
is threaded down through `CriterionLevelList` → `CriterionRow` → `CriterionBadge` so
all three text pieces (badge, level name, description) switch to `accent.ink` when
their `OptionCard` is selected, instead of staying light-on-light against the ember
fill. Same convention, just applied consistently to descendant text — not a new
color treatment.

## Selection → Hold → Transition state machine

`CriteriaCalibrationPage` drives an explicit `phase`: `idle → holding →
fading-out → fading-in → idle`. Timing constants (top of the file, easy to tune):

- `SELECTION_HOLD_MS = 500` — hold after selection before the fade starts.
  Starting point in the requested 400ms–1s range; not treated as final, flagged
  for Dan to test live and adjust.
- `FADE_MS = 180` — opacity-only, linear, per side of the transition. Starting
  point in the requested 150–200ms range, same tuning caveat.

`ComparisonRow` owns the actual `opacity`/`transition` style; `ProgressHeader` is a
plain sibling, never wrapped by the fading region — its round/progress/accuracy
values update via props exactly when `commitAdvance()` runs, which happens at the
fully-transparent midpoint of the sequence, giving the "static anchor, instant
value update" effect the spec asks for.

`prefers-reduced-motion` is read via a new hook, `src/hooks/useReducedMotion.ts`
(`window.matchMedia('(prefers-reduced-motion: reduce)')`). This is a JS-level
equivalent of the `_motionReduce` CSS prop pattern already used by
`LoadingIndicator`'s equalizer bars — that pattern is CSS-only and sufficient for a
pure CSS animation, but this transition is orchestrated with `setTimeout` (the hold
delay, then fade-out/fade-in), so the delays themselves need to be skipped in JS,
not just the CSS transition. When reduced motion is on, the hold delay still runs
(it's a UX pause, not motion) but the fade collapses to an instant swap, per spec.

**Not exercised live in this pass:** the reduced-motion branch was verified by code
review (the boolean directly gates whether the fade timeouts run), not by forcing
the OS/browser `prefers-reduced-motion` setting — the preview tooling available in
this session has no way to emulate that media feature. Worth a manual check
(devtools rendering emulation or an OS-level toggle) before this ships for real.

`QuestionPrompt` + `ComparisonRow` are wrapped together in one `aria-live="polite"`
`Box` in `CriteriaCalibrationPage`, per spec, so screen readers announce the new
question rather than a silent visual swap. This wrapper is inline (a single Chakra
prop), not a new named component — no new UI to name.

## Undo/Redo model (mock)

`historyStack: Snapshot[]` + `historyIndex` pointer. A new selection truncates any
redo tail and appends a new snapshot; Undo/Redo just move the pointer — no
recomputation, fully deterministic for this mock. Both disabled while a
transition is in flight (`phase !== 'idle'`), and Undo/Redo don't themselves
trigger the hold/fade sequence (spec doesn't call for it there).

## Mock content

`MOCK_PAIR_POOL` cycles 3 templates (3-criteria, 1-criterion, 6-criteria) to cover
the "1 to 6 rows per card" range from the DoD. `accuracyForRound`/`progressForRound`
are two independent placeholder curves — Accuracy (cumulative, thresholded
Low/Medium/High) deliberately doesn't move in lockstep with Progress (round-based),
so the two metrics visibly diverge across rounds, matching "two different metrics,
both visible, not collapsed into one."

## Not built / not touched

- No scoring engine, no Supabase changes.
- Existing album card (`sourceBadge`/`scoreSlab`/`genreBadge` on the review grid)
  untouched; `genreBadge`'s visual convention is reused (not the component) for
  `CriterionBadge`.
- Equalizer-bar loading indicator untouched, not repurposed.
- No delete/remove affordance on `OptionCard` — engine-generated content, not
  user-owned, so "delete" has no clear meaning here (explicitly out per spec).
- No navigation entry point — screen is reachable only via the dev-only
  `/criteria-calibration` route added in `main.tsx`. Where this screen is actually
  entered from (onboarding? `/favorites`?) is a separate IA decision, deferred.
- Header layout itself needs a broader reorganization pass — out of scope for this
  pass; logged in `deferred-work.md` (section C) rather than actioned here.

## Files

`src/CriteriaCalibrationPage.tsx`, `src/hooks/useReducedMotion.ts`, and
`src/components/criteria-calibration/`: `QuestionPrompt`, `ProgressHeader`,
`RoundGaugeGroup`, `RoundCounter`, `AccuracyStatus`, `ComparisonRow`, `OptionCard`,
`CriterionLevelList`, `CriterionRow`, `CriterionBadge`, `SelectAction`, `VsDivider`,
`EqualButton`, `HistoryActions`, `UndoAction`, `RedoAction`. `TradeoffCard.tsx`
(previous pass's RadioCard-based card) deleted, superseded by `OptionCard.tsx`.
