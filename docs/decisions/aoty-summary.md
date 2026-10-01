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

**Merged:** the Contenders stage (`feature/aoty-contenders`, merged to `master` `--no-ff` at
`3ac157b` on 2026-09-29, 923/923 tests): `/aoty/contenders`, the `contenders` table, bulk picker,
single/bulk remove, auto-add on a full (6/6) rating.

**In progress:** the AOTY list screen, on branch `feature/aoty-list`, not yet merged: `/aoty`, the
`aoty` membership table (`supabase/aoty.sql`, to be run by Dan), derived year/order/rank,
"Select for AOTY" on Contenders. Detail: `aoty/aoty-list-implementation.md`.

**Not built yet:** the desktop two-column Contenders|AOTY layout, the mobile AOTY-home split, the
public share page (`/aoty/:shareId`), and all further visual design (no Figma exists; rank
is an overlay badge since 2026-10-01 — see `aoty-list-implementation.md`).

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
3. `aoty/aoty-list-implementation.md` — AOTY list screen record (2026-09-30): membership-only
   `aoty` table, derived year/order/rank, tie-break spec, Step 0 accuracy check, no-backfill and
   display-rounding decisions.
