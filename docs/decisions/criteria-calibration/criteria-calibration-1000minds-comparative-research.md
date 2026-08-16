# 1000minds comparative research — calibration UX

**2026-08-16.** Dan ran a parallel PAPRIKA-style calibration on 1000minds
using the identical criteria/levels model as Slant Take (6 criteria × 5
levels — see aoty-ranking--paprika-scoring-model.md), captured via
screenshots through round 29 (27 rounds of degree-2 trade-offs + 2 rounds
into degree-3), to compare the felt experience against the punctuated
accuracy growth already observed in this session
(second-session-accuracy-trajectory-2026-08-15.csv).

## Structural differences observed (verified directly from screenshots)

**Accuracy visibility, not accuracy behavior, is the main difference.**
1000minds shows ONLY a raw "Progress: X%" counter throughout all of
degree 2 (rounds 1–27) — no accuracy number at all, confirmed by direct
re-inspection of multiple screenshots (round 6, round 25) after an initial
mis-read. Accuracy first appears at an explicit interstitial screen exactly
when degree 2 completes:
"You've finished making trade-offs," Accuracy: Medium, 91%, with plain-
language explanation of what the tier means and two explicit choices —
"Go to results" or "Make more trade-offs." Only after this screen does
degree 3 begin, and only then does the header show Progress and Accuracy
together, continuing (not resetting) from where degree 2 left off:
Progress 50%→64%, Accuracy 91%→92% over rounds 28–29.

**Concrete comparison point (both sides real data, not extrapolated):**
at round 27, still degree 2 on both products — Slant Take showed 76.1%
(from this session's CSV), 1000minds showed 91% (first reveal). ~15pp gap.
Cannot attribute this confidently to a "better" algorithm vs. a different
accuracy formula vs. a display-timing artifact — no access to 1000minds'
internals. Flagged as an open question, not a conclusion.

Post-degree-2 growth rate is slow on both: 1000minds 91%→92% over 2
rounds, consistent with Slant Take's own documented plateau pattern
(additive-model-degree-sufficiency.md) — degree 3+ adds precision, not
structurally new information.

## Dan's assessment of the 1000minds experience (qualitative, product opinion)

**Works well, worth learning from:**
- "Delete — this combination is impossible": a per-candidate delete
  action with explicit tooltip, letting the user discard a randomly-
  generated pair that doesn't make logical sense, rather than forcing an
  "equal" answer that misrepresents the real judgment. Slant Take has no
  equivalent today — an awkward auto-generated pair currently has no exit
  besides "about equal," which conflates "genuinely indifferent" with
  "this pairing doesn't make sense."
- The degree-2-completion interstitial itself: explains the number in
  plain language, gives real choice (not forced auto-continue), states
  the effort/accuracy trade-off explicitly.
- "They are equal" is first-class UI, not a secondary/hidden option —
  Slant Take already has parity here.

**Weaker, or at least questionable:**
- Progress% is visibly non-linear with no explanation (e.g. 17%→26% in
  one answer, 3%→8% in another) — likely the same "denominator changes
  with coverage" mechanism already known on Slant Take's side
  (deferred-work.md), but 1000minds doesn't acknowledge or explain it at
  all, so it reads as inconsistent/buggy rather than intentional.
- Hiding accuracy entirely through degree 2 is a blunt fix for "confusing
  number," not a nuanced one — it avoids the problem by giving zero
  qualitative signal for 27 rounds, rather than solving it. Dan's take:
  neither "show a confusing number" nor "show nothing" is the right
  target — the confidence/coverage split idea already logged (2026-08-15
  session) would beat both approaches, not just imitate one.
- No visible structure/context during degree 2 — no "X questions left in
  this degree," no map of criteria coverage. Purely sequential.

**Overall:** 1000minds wins on reveal-timing and explanation; loses on
continuous transparency. These read as two different trade-offs on the
same axis, not one being simply superior — reinforcing that Slant Take's
already-proposed direction (live confidence + coverage signals, explained)
would outperform both rather than copy either.

## Status
Research only. Feeds into the future Concept Draft for the calibration
results page / accuracy display redesign — no design or implementation
decision made here. Cross-referenced from the existing accuracy-
conflation entry in deferred-work.md.
