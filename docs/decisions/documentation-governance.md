# Documentation governance

## Two-layer ownership rule

Design-discovery output — HMW docs, lightning demos, research reviews, IA drafts, Concept
Drafts, algorithm maps, and anything else produced in a design/strategy chat rather than in
Claude Code — lives **only** in Project Knowledge. Never duplicate the full content into
`docs/decisions/`. If the implementation side needs a pointer to it, add a short stub instead
— see `album-rating-page--concept-draft.md` (and `criteria-calibration-summary.md`'s "Not in
this repo" section) for the existing pattern.

Conversely, any file describing **live implementation status** belongs only in
`docs/decisions/` (it reaches Project Knowledge via the GitHub connector sync). Never keep a
separately-maintained manual snapshot of implementation status in Project Knowledge — nothing
keeps a second copy like that in sync with the repo, so it silently goes stale.

## Indexing rule

Every new file added to `docs/decisions/` gets an index entry — its own line, or folded into
an existing gateway/summary file — in the **same commit** that adds the file. Don't defer
indexing to a later cleanup pass.

## Why this doc exists

Two documentation-organization gaps surfaced in the same session (2026-09-05), both already
corrected as one-off fixes:

1. `album-rating-page--concept-draft.md` had been fully duplicated into `docs/decisions/` as
   design-discovery content instead of staying Project-Knowledge-only. Fixed by retiring the
   duplicated Project Knowledge copy (`aoty-phase7-current-state.md`) and replacing the repo
   file with a pointer stub.
2. Four files sat unindexed in CLAUDE.md's Past-decisions index for weeks — flagged twice in
   earlier sessions, not actually fixed until this one added the missing index lines for the
   four `album-rating-*` files.

Both were addressable in isolation, but neither had a written rule to catch it earlier. This
doc is that rule, so future sessions check it rather than repeating the same two mistakes.
