# AOTY Hub — summary & index

## What this is

The AOTY hub adds an explicit **Album of the Year** flow on top of the existing Favorites and
Album Rating features: **Favorite → Contenders → AOTY**. Favorites stays loose/low-intent;
scoring an album (the existing 6-criteria calibration flow) auto-enters it into **Contenders**,
an unordered candidate pool; moving from Contenders into the final, automatically-ranked
**AOTY** list is always an explicit user action. Desktop and mobile intentionally diverge
rather than sharing one responsive layout. Full rationale, naming decisions, and the
structural/mobile/desktop concept: `aoty/aoty-hub-population.md`.

## Current status

**In progress:** the Contenders stage only, on branch `feature/aoty-contenders`, not yet
merged. New `/aoty/contenders` route + nav entry, `contenders` Supabase table (already run
against the live project), bulk picker to add from Favorites, single and bulk remove,
auto-add-to-Contenders on reaching a full (6/6) rating. Scoped deliberately to Contenders only
— no AOTY final-list screen this pass, per `aoty-contenders-implementation.md`'s first dated
section. 914/914 tests, `tsc` clean, lint clean as of the last commit on that branch.

**Not built yet:** the AOTY final-list screen itself (ranking display, "Select for AOTY"
action, the desktop two-column Contenders|AOTY layout, the mobile AOTY-home/Contenders-subtask
split), the public share page (`/aoty/:shareId`), and all visual design (no Figma exists for
any of this yet — flagged as a real risk in `aoty-contenders-implementation.md`).

**Open follow-ups**, tracked in `docs/decisions/deferred-work.md` §B rather than only here:
- Extract `ContendersPage`'s calibration-gate `handleRate` logic (duplicated from
  `FavoritesPage.tsx`) into a shared hook — deferred until the AOTY screen is a third call site.
- Audit empty-state treatments across the app for consistency — Contenders now uses the shared
  `EmptyState` component, `FavoritesPage.tsx`'s matching one doesn't yet.

## Index (pipeline order)

1. `aoty/aoty-hub-population.md` — discovery decision record (2026-09-22): the Favorite →
   Contenders → AOTY structure, naming decisions, data-model implications, non-goals. Frozen as
   written; superseded facts are corrected in the file below, not rewritten here.
2. `aoty/aoty-contenders-implementation.md` — Contenders stage implementation record
   (2026-09-28, ongoing): the Favorites-Score dependency correction, code-review fixes
   (accessibility bug, non-idempotent insert), the `Alert`-component banner revision, the
   `EmptyState` adoption, and this docs restructure itself.
