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

## 2026-08-16 — Album Identity folder reorg + Album Rating summary block

A second, separate reorg pass in the same session as the Criteria Calibration one above,
same "meta" documentation-structure precedent, requested via a standalone brief covering
two independent clusters.

### What was done

**Album Identity folder + gateway.** The 7 `album-identity-*` decision docs (confirmed
against the live repo, not just the brief's list — all 7 matched) moved via `git mv` from
`docs/decisions/` into `docs/decisions/album-identity/`. A new gateway file,
`docs/decisions/album-identity-summary.md`, carries the feature description, current
shipped/live status of the dual-key (`mb_release_group_id` / `norm_key`) identity strategy,
the two named-but-unscheduled deferred items (admin merge tooling, live MusicBrainz
autocomplete on `AddAlbumDrawer`), and a pipeline-ordered index of the 7 files.
`CLAUDE.md`'s Past-decisions index collapsed the 7 individual lines to one pointer at the
gateway file. `branch-log.md`'s `album-identity-migration` path was updated to match.

**Reference sweep.** A repo-wide grep (not limited to `docs/`) found `album-identity-*.md`
path references in `deferred-work.md`, `finished-work.md`, `architecture.md`,
`favorites.md`, `favorites-view.md`, `manual-albums.md`, `roundup-skip-fix.md`,
`unknown-band-collision-audit.md`, `scripts/ingest.ts`, `scripts/musicbrainz.ts`,
`scripts/normalizeKey.ts`, `src/dbMapping.ts`, `src/__tests__/useFavoritesList.test.ts`,
4 `scripts/migrations/*.ts` files, and 7 `supabase/*.sql` files — all updated to the new
`album-identity/` path. Matching was scoped to the 7 exact moved filenames so that unrelated
files whose own names happen to contain "album-identity" (the 4 `scripts/migrations/2026-07-
album-identity-*.ts` migration scripts themselves) were left untouched — only path
references *to* the moved docs inside their comments changed, not their own filenames. One
untracked, gitignored personal backup file (`CLAUDEbk2.md`) was caught by the sweep's grep
and edited, then reverted before commit — it's outside the repo and outside this pass's
scope.

**Album Rating summary block.** No folder — only 4 files exist
(`album-rating-page.md`, `album-rating-page--concept-draft.md`, `album-rating-drawer.md`,
`album-rating-soft-gate.md`) and one already holds most of the weight, so this got the same
prepended-summary treatment as `ingest-trigger-and-security.md` and
`unknown-band-collision-audit.md` instead of a folder+gateway. A summary block was prepended
to the top of `album-rating-page.md` stating current status (soft-gated, not hard-gated,
since the 2026-08-09 reversal) and pointing to what each of the other 3 files covers. The
other 3 files were left untouched and un-moved, per the brief.

One correction to the brief's own assumption: it expected the 4 `album-rating-*` files to
already have minimal one-line entries in `CLAUDE.md`'s Past-decisions index (asking to leave
them alone if so). They don't — none of the 4 files are indexed in `CLAUDE.md` at all. Left
as-is per the brief's explicit scope boundary (adding a missing index is a separate
decision); flagged to Dan rather than silently fixed.

### Verification

Repo-wide grep for the old `docs/decisions/album-identity-*.md` path form (outside the new
folder) returned zero matches. No application code behavior changed — all source-file edits
were comment-text path strings.

### Scope boundary respected

No application logic changed, and the `album-rating-*` files' locations and CLAUDE.md's
(non-)indexing of them were left exactly as found, per the brief.

## 2026-08-26 — Raw data files split out of `docs/decisions/` into `docs/data/`

**Why.** Project Knowledge (claude.ai) syncs from this repo via the GitHub connector, whole
folders at a time. `docs/decisions/` held both prose decision docs and large raw-data dumps
(CSV/JSON output from calibration diagnostic scripts) that add no value as arbitrary search
snippets and were eating into Project Knowledge capacity. Not an application need — pure
repo hygiene so Dan can deselect a `docs/data/` folder in the connector's file picker without
losing anything else.

**Moved (11 files, all under `criteria-calibration/`, `git mv` — history preserved):**

| Before | After |
|---|---|
| `docs/decisions/criteria-calibration/accuracy-threshold-final-region-determinacy-2026-08-17.json` | `docs/data/criteria-calibration/accuracy-threshold-final-region-determinacy-2026-08-17.json` |
| `docs/decisions/criteria-calibration/accuracy-threshold-recalibration-2026-08-17.csv` | `docs/data/criteria-calibration/accuracy-threshold-recalibration-2026-08-17.csv` |
| `docs/decisions/criteria-calibration/accuracy-threshold-recalibration-fits-2026-08-17.json` | `docs/data/criteria-calibration/accuracy-threshold-recalibration-fits-2026-08-17.json` |
| `docs/decisions/criteria-calibration/degree-tier-recon-2026-08-18.csv` | `docs/data/criteria-calibration/degree-tier-recon-2026-08-18.csv` |
| `docs/decisions/criteria-calibration/escalation-signal-oracle-trajectories-postharris-2026-08-16.csv` | `docs/data/criteria-calibration/escalation-signal-oracle-trajectories-postharris-2026-08-16.csv` |
| `docs/decisions/criteria-calibration/escalation-signal-real-session-trajectories-2026-08-16.csv` | `docs/data/criteria-calibration/escalation-signal-real-session-trajectories-2026-08-16.csv` |
| `docs/decisions/criteria-calibration/normalized-coverage-diagnostic-output-2026-08-25.txt` | `docs/data/criteria-calibration/normalized-coverage-diagnostic-output-2026-08-25.txt` |
| `docs/decisions/criteria-calibration/normalized-coverage-threshold-window-2026-08-25.csv` | `docs/data/criteria-calibration/normalized-coverage-threshold-window-2026-08-25.csv` |
| `docs/decisions/criteria-calibration/normalized-coverage-widths-2026-08-25.csv` | `docs/data/criteria-calibration/normalized-coverage-widths-2026-08-25.csv` |
| `docs/decisions/criteria-calibration/second-session-accuracy-trajectory-2026-08-15.csv` | `docs/data/criteria-calibration/second-session-accuracy-trajectory-2026-08-15.csv` |
| `docs/decisions/criteria-calibration/synthetic-oracle-trajectories-2026-08-16.csv` | `docs/data/criteria-calibration/synthetic-oracle-trajectories-2026-08-16.csv` |

Flat destination — 11 files under one existing cluster didn't warrant further sub-splitting.
No files were found at `docs/decisions/` root level or under `album-identity/`; the entire
raw-data footprint was in `criteria-calibration/`.

**Deliberately excluded: `docs/decisions/backups/`.** That folder is gitignored
(`.gitignore:16`, "personal preference data — kept on disk, deliberately not versioned") —
it never reaches GitHub and therefore never reaches the GitHub connector or Project
Knowledge. Moving it would not serve this change's stated goal and it's a different kind of
data (Dan's real calibration answers, not a reproducibility dump), so it was left exactly
where it is, confirmed with the user before proceeding.

**Reference sweep.** Repo-wide grep (not limited to `docs/`) for each moved filename, both
bare and as a full `docs/decisions/criteria-calibration/...` path. Updated:
- Functional path constants (not just comments) in 5 scripts: `degree-tier-recon-2026-08-18.ts`,
  `normalized-coverage-width-diagnostic-2026-08-25.ts`,
  `accuracy-threshold-recalibration-2026-08-17.ts`,
  `accuracy-threshold-final-region-determinacy-2026-08-17.ts`,
  `synthetic-calibration-oracles-2026-08-16.ts` — each writes (and some read) one or more of
  the moved files via a `DOCS`-style constant or hardcoded path. Their separate reads of
  `docs/decisions/backups/pre-reset-dan-account-2026-08-15.json` were untouched, since that
  file didn't move.
- Prose pointers in 9 decision docs (`criteria-calibration-accuracy-threshold-recalibration.md`,
  `criteria-calibration-degree-tiers-and-progress.md`, `criteria-calibration-freeze-checkpoint.md`,
  `criteria-calibration-freeze-checkpoint-step1-pool-check.md`,
  `criteria-calibration-escalation-signal-candidates.md`,
  `criteria-calibration-normalized-coverage-width-diagnostic.md`,
  `criteria-calibration-second-session-reset.md`,
  `criteria-calibration-1000minds-comparative-research.md`,
  `criteria-calibration-synthetic-oracles.md`) and 2 index/tracker files
  (`criteria-calibration-summary.md`, `deferred-work.md`). Most were bare filename mentions
  (no path prefix) — each was given an explicit `docs/data/criteria-calibration/...` prefix so
  the new location is unambiguous, matching the fuller-path style already used elsewhere in
  those same docs.
- `CLAUDE.md` and `finished-work.md` needed no changes — neither references any of these
  files by path.
- `.gitignore` needed no changes — none of the moved files were gitignored.

Two files turned out to be unreferenced anywhere in the repo before this move
(`docs/decisions/backups/calibration-archive-2026-08-10.json` and
`docs/decisions/backups/ranking-stability-log-2026-08-10.jsonl` /
`-2026-08-11.jsonl`) — noted for completeness; they're in the excluded `backups/` folder
regardless, so this didn't affect the move itself.

### Verification

- `npx tsc -p tsconfig.app.json --noEmit` — same pre-existing Chakra v3 typing errors as on
  unmodified `HEAD` (confirmed via `git stash`/`stash pop`), zero new errors. None of the
  affected files (`Header.tsx`, `LoginPage.tsx`, `StyleGuide.tsx`, `supabaseClient.ts`,
  `theme.ts`) were touched by this change.
- `npx vitest run` — 333/333 passed, same count as before the move.
- Final repo-wide grep for `docs/decisions/criteria-calibration/<moved-filename>` — zero
  matches outside `docs/data/`.

### Scope boundary respected

File moves and path-string updates only. No application logic, script computation, or data
content changed — every moved file is byte-identical to its pre-move version (`git mv`, no
edits to file contents).
