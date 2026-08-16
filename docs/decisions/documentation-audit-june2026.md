# Documentation audit — June 2026

## What was audited

Every file in `docs/decisions/` plus `CLAUDE.md`, checked for:
- Dangling references to files that don't exist
- Cross-file contradictions on yes/no gates
- Stale main bodies whose behavior was changed in a later session but never appended-to

## What was found and fixed

### Item 0 — Confirmed-missing file: `chakra-v3-datepicker-feature-brief.md`

This file was referenced by name in `CLAUDE.md` (gaps bullet + index entry) and
`chakra-v3-migration-plan.md` (two spots) as the authority on DatePicker
implementation/verification status. It does not exist and was never written.

**Fixes applied:**
- `CLAUDE.md` gaps bullet: replaced the dead pointer with a reference to the real
  location of implementation detail (`favorites-view.md`, AddAlbumDrawer section)
  and an explicit note that no verification-checklist file exists.
- `CLAUDE.md` index: removed the entry entirely (index should only list files
  that exist).
- `chakra-v3-migration-plan.md` line ~173: rewrote the paragraph that named the
  brief as the authority — now points to `favorites-view.md` and `CLAUDE.md`'s
  gaps list instead.
- `chakra-v3-migration-plan.md` line ~175: "Current status" line updated to same
  real pointers.
- `chakra-v3-migration-plan.md` "What NOT to do" bullet: the "Step 8 DatePicker"
  rule was a migration-era constraint, now moot — rewritten as a historical note.

**What was NOT done:** the missing brief's content was not fabricated from
inference. If a real DatePicker verification checklist is wanted, that is
separate, explicitly-requested future work, not something this audit session did.

### Item 1 — Contradictory gate in `chakra-v3-foundation-audit-brief.md`

The brief's opening blockquote said "Do not run this until... Step 8 (DatePicker
feature shipped)." `chakra-v3-migration-plan.md` explicitly states the migration
ends at Step 7 and the foundation audit is eligible to start now. Two files gave
opposite answers to "is this blocked right now?"

**Fix applied:** replaced the opening blockquote with the correct, unblocked
framing already established in `chakra-v3-migration-plan.md`.

### Item 2 — Stale `header-redesign.md`

The file described `sx={{ '&[aria-expanded=true]': {...} }}` as the live
mechanism for Menu whiteAlpha-flash suppression. This was confirmed broken under
Chakra v3 (silently ignored, not just renamed) and fixed to `css` during the
migration. Menu components were also rewritten to v3's compound pattern. The
original doc was never appended.

**Fix applied:** dated follow-up section appended (append-only, main body
untouched).

### Item 3 — Stale `auth-routing.md`

The file described route protection as "not yet built" and `/list/:shareId` as
the reserved slot. Both were superseded by the favorites-view session: `RequireAuth`
(`src/RequireAuth.tsx`) now guards `/favorites`, and the reserved route was
renamed to `/aoty/:shareId`. The original doc was never appended.

**Fix applied:** dated follow-up section appended (append-only, main body
untouched).

### Item 4 — Two `CLAUDE.md` index one-liners missing staleness flags

`refresh-button.md` and `genre-data.md` carry internal "this part is superseded"
or "this bug was fixed" banners, but their one-line summaries in the index didn't
surface this — a reader trusting the index alone wouldn't know to look for the
banner.

**Fix applied:** NB clauses appended to both index lines, matching the pattern
already used by `persistent-history-superseded.md`.

## Scope boundary respected

Zero application code was touched. All changes are in `docs/decisions/*.md` and
`CLAUDE.md` only. All decision-doc changes are append-only (follow-up sections)
or targeted pointer-fixes — no main body was rewritten.

---

## 2026-08-16 — Criteria Calibration folder reorg + deferred-work.md split

Not a re-audit of everything above; a separate, requested reorg pass logged here
per this doc's own precedent for "meta" documentation-structure sessions.

### What was done

**Criteria Calibration folder + gateway.** All 23 calibration-related decision
docs plus one supporting CSV moved (via `git mv`, history preserved) from
`docs/decisions/` into `docs/decisions/criteria-calibration/`. The file list was
compiled fresh from the actual repo rather than trusted from the requesting
brief — the brief's own list of 17 was short by 9 real files (5 already indexed
in `CLAUDE.md` under a different grouping, 4 that had never been indexed at all
despite existing and being referenced from `deferred-work.md` and source
comments). A new gateway file, `docs/decisions/criteria-calibration-summary.md`,
now carries the feature description, current shipped/live status, the single
statement of the one open correctness risk (`last_eligible_top10`/
`last_change_answer_index` write-race, previously duplicated across `CLAUDE.md`
and `deferred-work.md`), and a grouped index of the folder's contents.
`CLAUDE.md`'s Past-decisions index collapsed ~21 individual calibration lines to
one pointer at the gateway file; its Active-branches carry-forward section kept
the most recent branch's detail inline and collapsed two older carry-forwards to
a pointer at the same gateway file. `branch-log.md`'s calibration paths were
updated to match.

**Reference sweep.** A repo-wide grep (not limited to `docs/`) found calibration
doc-path references in `.gitignore`, 5 `supabase/*.sql` migration-comment files,
5 `scripts/*.ts` files, and ~15 `src/` files (calibration lib modules, tests,
`CriteriaCalibrationPage.tsx`) — all updated to the new path. One of these
(`scripts/analyze-second-session-2026-08-15.ts`'s `CSV_PATH` constant) was an
actual functional path, not a comment; left unfixed it would have made a future
run of that script write a stray duplicate CSV at the old location instead of
the moved one.

**`deferred-work.md` / `finished-work.md` split.** 17 items confirmed fully
closed (shipped, verified, resolved, or retracted, with no open follow-up inside
the entry itself) relocated verbatim into a new `finished-work.md`. Four entries
that mix a done sub-clause with a real open follow-up in the same paragraph
(Unknown Band collision, AMG non-review content scope, Automatic degree
escalation, LP solver hardening) were deliberately left whole in
`deferred-work.md` rather than split — splitting would have meant rewriting,
which this pass avoided. One factual correction applied during the move (not a
rewrite of a finding): the "Favorites row mobile redesign" entry's "not yet
merged" clause was stale against `branch-log.md`'s own record of the 2026-08-07
merge, noted via a bracketed `[2026-08-16 reorg note: ...]` rather than silently
edited.

### Verification

`tsc --noEmit` clean; `npx vitest run` 297/297 passing throughout (all source
edits were comment-text path strings except the one `CSV_PATH` constant fix
above). Final repo-wide grep for the old `docs/decisions/criteria-calibration-*`
and `docs/decisions/two-phase-simplex-rewrite.md` path forms returned zero
matches outside the new folder.

### Scope boundary respected

No application logic changed. Source-file edits were limited to comment-text
path strings (updating where a "why" comment points) and the one CSV output
path constant noted above.
