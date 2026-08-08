# Criteria Calibration: dominance filter for candidate pairs

Branch: `criteria-calibration-dominance-filter`, off `master`.

## 2026-08-09 — Diagnostic (prior session) and this session's fix

Confirmed and reproduced (this session, re-reading `elicitationDriver.ts` fresh): with
no dominance check, `generateCandidatesForSubset` draws each criterion's level
independently for both profiles in a candidate pair. A dominated pair — profile B weakly
≥ profile A on every varied criterion, strictly > on at least one — offers no real
trade-off; PAPRIKA's own elicitation method only asks undominated ("ambiguous") pairs.
Live-observed once (Dan's own session, round 16: Innovation tied at "Groundbreaking",
Performance "Skilled" vs "Excellent" — B strictly dominates A) and reproduced
systematically: a repro script driving `nextAction` with a naive-sum-consistent oracle
over the production 6-criteria/5-level shape found **12 dominated/tied pairs across 59
simulated questions** (baseline, pre-fix — re-confirmed this session by temporarily
reverting the fix and re-running the same script). No dominance filter had ever existed
in this code path (confirmed via `elicitationDriver.ts`'s full git history — only two
prior commits touched the file, neither added one). `rankCandidatesByAmbiguity` can rank
a dominated pair as high-priority when solver estimates are still imprecise — precisely
the low-accuracy state where asking a wasted question matters most.

## Placement decision

Filter inside `generateCandidatesForSubset`, immediately after the existing
`keyA === keyB` full-tie `continue`, not in `buildRefinementCandidatePool` alongside
`hasBeenAsked`/`isImplied`. Reasoning: dominance, like the full-tie check, is a property
of the candidate pair itself — it needs no session state. `hasBeenAsked`/`isImplied` are
session-state checks applied *after* generation with no backfill (if they filter
candidates out, the pool for that subset just ends up smaller — no retry). Placing
dominance in the generation loop instead lets the existing retry-until-6-or-120-attempts
logic naturally replace a rejected draw with a fresh random one, the same way the
full-tie check already does.

## Dominance check

```
isDominatedPair(profileA, profileB, subset):
  sawAStrictlyGreater = false
  sawBStrictlyGreater = false
  for idx in subset:
    if profileA[idx] > profileB[idx]: sawAStrictlyGreater = true
    if profileB[idx] > profileA[idx]: sawBStrictlyGreater = true
  return sawAStrictlyGreater !== sawBStrictlyGreater
```

Both flags true → genuinely incomparable (ambiguous) → keep. Exactly one true → one
side dominates → reject. Neither true → full tie, already caught by the caller's
`keyA === keyB` check before this runs (unreachable in practice, but correct
defensively). No overlap/conflict with the existing tie check — they run back-to-back as
two independent `continue` guards in the same generation loop.

## Post-fix verification

- **Repro re-run** (same script, same 59-question oracle-driven scale, production
  6-criteria/5-level shape): **0 dominated/tied pairs across 47 questions** — the run
  naturally exhausts (reaches degree 6, the max degree for 6 criteria, with
  `canEscalate: false`) before hitting 59, which is itself expected — the dominance
  filter didn't change exhaustion behavior, 47 is just where this shape's driver run out
  of anything left to ask.
- **Retry-attempt margin** (this session's addition to the plan, not in the original
  brief): instrumented a copy of the post-fix `generateCandidatesForSubset` to report
  attempts-to-fill-6-candidates per subset, across every degree-2 through degree-6
  subset of the production shape (all degrees reachable in a real run). Worst case:
  degree 2, avg 16.5 attempts, max 25 — against the existing 120-attempt cap
  (`CANDIDATES_PER_SUBSET * 20`), roughly 5x margin at the worst-case subset. No subset
  at any degree hit the cap or came back short of 6 candidates. Dominance pressure drops
  as degree increases (avg 16.5 → 11.3 → 8.1 → 6.8 → 6.0 for degrees 2→6) — more varied
  criteria means a random draw is less likely to have one profile lead on all of them.
  Cap has real headroom at current criteria/level counts; worth re-checking if either
  grows substantially.
- **Medium-threshold impact** (real 31-answer historical session, replayed via
  `buildRealSessionAnswers()` — the same fixed-answer replay Brief 1 used to report
  "first fires at answer 19"): **unchanged, still answer 19 (accuracy 0.8715)**. This is
  expected and was confirmed rather than assumed: the replay uses Dan's fixed historical
  answers in fixed order, never calling `nextAction`/`generateCandidatesForSubset` at
  all, so a fix to candidate *generation* has no way to touch it. An oracle-driven
  simulation (driver-selected questions, not fixed history) would be the methodology
  where this fix could plausibly move the number — not run here since Brief 1's own
  reported number used the fixed-replay method, and matching that method was what "if
  comparable" called for.

## Implementation

- `isDominatedPair` (private) + the `continue` guard: `elicitationDriver.ts`.
- `generateCandidatesForSubset` exported (was private) for direct unit testing, same
  pattern as the module's other small exported helpers (`enumerateCriterionPairs`,
  `coldStartProfilesForPair`, `buildCanonicalDegree2Pairs`). Not used outside this
  module.
- Tests: `elicitationDriver.test.ts` — a direct unit test asserting
  `generateCandidatesForSubset` never emits a dominated/tied pair across a range of
  degree-2 through degree-4 subsets; a second asserting the filter still fills all 6
  candidates per subset (no silent starvation); a regression test appended to the
  existing oracle-based-simulation describe block asserting `nextAction` never surfaces
  a dominated/tied pair across a full driver-paced run.
- `tsc --noEmit` clean, `eslint` clean on changed files, full suite 225/225 passing
  (pre-existing jsdom/Chakra CSS-parse stderr noise in unrelated component tests,
  present before this change, not a failure).

## Out of scope (per brief)

Progress ring / accuracy display (separate brief, separate branch —
`criteria-calibration-progress-ring-accuracy`). `MAX_AMBIGUOUS_GAP`'s value/role
unchanged. No UI copy/layout changes.
