# AOTY Hub Population — Decision Record

**Status:** Discovery complete (structural concept + naming pass). This is the original
discovery-derived decision record — frozen as written; Contenders implementation status,
corrections, and every later decision live in `aoty-contenders-implementation.md` instead. See
`docs/decisions/aoty-summary.md` for current overall status.
**Date:** 2026-09-22

---

## Context

Slant Take has Favorites (loose, low-intent) and Scored albums (deliberate, 6-criteria)
but no mechanism to turn either into an explicit AOTY candidate list. This feature adds
an intermediate stage — **Contenders** — between Favorites and the final **AOTY** list.

Flow: **Favorite → Contenders → AOTY**. Movement is explicit at every step, with one
deliberate exception: any scored album auto-enters Contenders.

---

## Decisions

*(2026-09-21/22, from discovery)*

- Two distinct screens/clusters, not merged: **Contenders** (unordered candidate pool)
  and **AOTY** (final, automatically-ranked list).
- Contenders → AOTY is always an explicit user action (**"Select for AOTY"**), never
  automatic.
- Entry into Contenders: automatic for any scored album; manual add from Favorites
  (scored or not) via a new bulk picker, distinct from `AddAlbumDrawer`.
- AOTY ordering is fully automatic, driven by the existing calibration engine's score.
  No manual reordering — confirmed as the deliberate point of the feature.
- Removing an album from AOTY returns it to Contenders — never a hard delete.
- Desktop and mobile intentionally diverge (not a shared responsive layout):
  - **Desktop** — two-column simultaneous layout (Contenders | AOTY); checkboxes and a
    bulk action bar are desktop-only.
  - **Mobile** — AOTY is the home screen (single task: view the result); Contenders is a
    temporary, full-screen task entered/exited explicitly via **"Contenders →"**; no bulk
    actions, one album/one action at a time.
- No bypass on either platform: an empty AOTY's CTA always routes through Contenders,
  never directly to Favorites (bypassing would recreate the automatic-inclusion problem
  rejected at Understand the Problem).
- `TierAccuracyBadge` must appear on the AOTY hub, more prominent (banner-scale) than its
  current small/inline use on Favorite. A conditional full-width banner shows only while
  calibration tier = Unfocused.
- V1 imposes no year restriction on what can enter Contenders.

### Naming (2026-09-22 pass)

| Item | Decision |
|---|---|
| Nav label | **AOTY** |
| Intermediate pool (was "Shortlist"/"Lobby") | **Contenders** |
| Contenders → AOTY action | **Select for AOTY** |
| Mobile nav button to Contenders | **Contenders →** |
| Personal score label (AOTY/Contenders scope only, not a global rename) | **Your Score** |

---

## Data model implications — claims to verify against live schema

- A **list** may eventually need to be its own entity (with settings: year, genre), even
  though v1 ships a single hardcoded-scope list — flagged during discovery as worth
  keeping architecturally open. Verify whether anything list-like already exists, or
  whether this is net-new.
- Contenders membership needs its own tracked state (flag / join table / status field) —
  distinct from Favorite and Scored. Neither Favorite nor Scored may be reused as a proxy
  for Contenders membership (explicitly rejected in discovery: favoriting is too broad,
  scoring is sometimes just curiosity).
- AOTY membership (the final, explicit selection) needs its own state, distinct from and
  coexisting with Contenders membership, per album per year.
- Contenders row display needs a per-album Score — confirm the calibration engine's score
  is queryable in the shape this requires (see Dependencies below; not yet built).
- The provisional tie-break rule (highest-weighted criterion first, then alphabetical)
  assumes per-criterion weights are exposable and a deterministic secondary sort is
  feasible — verify before implementing. Whether real ties occur in current data is still
  an open question (see below).

---

## Non-goals / deferred (v1)

- Multi-list by year and/or genre — must not be architecturally blocked, but not built now.
- Public share page (`/aoty/:shareId`) — undesigned, sequenced as a separate thread.
- Manual reordering of the AOTY list — ordering is always automatic by score.
- Renaming "Favorites" — parked as its own future naming thread (same rigor as this one).
- Percent-based Score → letter/number grade conversion — parked, separate larger thread
  touching Album Rating and Favorites too.

---

## Open questions / TBDs

- Reference year for Contenders/AOTY membership: album release year vs. evaluation year —
  Dan leans release year, not validated.
- Mobile empty-state CTA copy — "Build your AOTY" was rejected as redundant with the page
  title; no replacement decided yet.
- Does the calibration engine produce real ties in practice, or is the tie-break rule
  theoretical? Technical question — answer from real data, not discovery.
- Visual treatment (banner, badge, spacing) — deferred entirely to Figma.

---

## Dependencies

- **Favorite page needs a Score display update** — it currently shows no score for
  evaluated albums; Contenders rows need the same treatment. Small, separate thread — not
  part of this feature's build, but a blocking dependency for the row design above.

---

## References

- `docs/discovery/aoty-hub-population/understand-the-problem.md` — Project Knowledge only,
  gitignored locally (`docs/discovery/`), not in this repo — see
  `documentation-governance.md`'s two-layer rule
- `docs/discovery/aoty-hub-population/lightning-demos.md` — same
- `docs/discovery/aoty-hub-population/information-architecture.md` — same
- `docs/discovery/aoty-hub-population/concept-draft.md` — same
- `docs/discovery/aoty-hub-population/naming-decision-record.md` — same
- Related, not superseded: `docs/decisions/criteria-calibration-terminology-and-gate-unification.md`
  (calibration gate mechanism behind the tier logic referenced above)
- Implementation status, corrections, and every decision made after 2026-09-22: see
  `aoty-contenders-implementation.md` in this folder, and the gateway
  `docs/decisions/aoty-summary.md`
