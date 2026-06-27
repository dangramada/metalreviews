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
