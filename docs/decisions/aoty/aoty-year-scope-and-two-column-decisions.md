# AOTY: year scope and two-column layout (planned, not implemented)

2026-10-03. **Status: decisions only. Nothing here is built.** Builds on
`aoty-list-implementation.md` (membership table, derived year/rank, decision 8 reversal). Gateway:
`../aoty-summary.md`.

## 1. Year as a shared scope (variant A)

One year scope applies to the whole AOTY hub (both columns), replacing today's AOTY-only year chips.

- **Derived, never stored.** Year comes from `albums.release_date` via the existing `getReleaseYear`,
  exactly as `buildAotyView` does now. No year column, no list row.
- **Default-year rule:** the year with the most AOTY members; if AOTY is empty, the year with the
  most contenders; ties go to the latest year. A user pick overrides it while it still has content.
- **Jan 2027 scenario:** the rule never reads today's date. On 2027-01-01 the default stays at
  whatever year has the most members (2026 if that is where the picks are); a 2027 release shows up
  as a selectable year and becomes the default only by out-counting 2026. (Contrast the 2026-09-21
  Metal Storm bug, where a calendar-year comparison silently flipped on a date boundary.)
- **No-year bucket:** albums with a null release date keep their own "No release year" bucket in
  both columns, as AOTY has today. They cannot be promoted until dated (see section 4).

## 2. List-as-entity: deferred

Today there is one implicit list per user, scoped by derived year. A stored "list" entity is
deliberately not built.

| Principle | Consequence |
|---|---|
| Store the minimum | Membership stays `(user_id, album_id)`; year, order, rank stay derived |
| Don't block the future | Discovery wants multi-list (year/genre, settings) possible later; nothing here forecloses it |
| Add the entity when a second dimension is real | Genre lists or per-list settings, not before |

**Migration path (indicative sketch, not a schema decision):** add a lists table (user, year or
genre, settings); give `aoty` a list reference backfilled from the derived year; keep the
`aoty` subset-of-`contenders` FK. The UI scope selector becomes "pick a list" instead of "pick a year".

**Contenders rule going forward:** Contenders = the pool minus members *of the displayed list*.
With one list per year-scope this equals today's "minus all AOTY members" for the scoped year only
if the rule is applied per displayed list; confirm when implementing (open item).

## 3. Two-column layout (option C) and the stacked row

- Desktop shows Contenders and AOTY side by side under the shared year scope (discovery's
  "two columns simultaneously visible"), option C of the layout review.
- When a column is too narrow the row **stacks** (a single-column row shape). The switch is driven by
  **container width**, not the viewport, because the same row sits in a wide single column on one
  screen and a half-width column on another. This would be the first container-query use in the
  codebase (`FavoritesPage` documents none today); the row currently uses viewport `@media`.
- Mobile keeps the existing separate screens (`/aoty`, `/aoty/contenders`).

## 4. Release date at promotion

Today an undated album cannot be selected ("No release date yet", disabled). Plan: collect the date
at promotion time, reusing the manual release-date input and the `fill_missing_release_date` RPC
already used when favoriting an existing album, so the album then lands in a year bucket. Not
built; until then the disabled state stands.

## 5. Motion plan

- Promote / Back to Contenders animate the row between columns (leave, then enter), short and
  eased.
- `prefers-reduced-motion`: no movement, instant swap.
- Reconcile refetches never animate and never move focus (focus moves once, as today).
- Motion must not delay the state change: the local-first update stays immediate.

## 6. Deviations from discovery

| Discovery (`docs/discovery/aoty-hub-population/`) | This plan |
|---|---|
| Lobby/Shortlist wording | Superseded by the naming record: Contenders / AOTY |
| Year scope open (release vs evaluation year; "Dan leans release year") | Release year, derived, shared scope |
| Reference year configurable per list | Not configurable; derived. Lists deferred |
| Candidate stays visible after selection (silent on coexistence) | Reversed 2026-10-03: promoted album leaves Contenders |
| Two columns simultaneously (concept draft) | Kept, desktop only |
| Multi-list "must not be blocked" | Kept open via section 2, not built |

## 7. Open items

- Option C's alternatives are not recorded in this repo; add them if the comparison matters.
- Confirm the per-displayed-list Contenders rule (section 2) when lists exist.
- Container-query adoption (section 3) needs a browser-support and testability check (jsdom does not
  evaluate container queries).
- Year selector placement and how the no-year bucket is offered as a scope.
- Exact promotion date flow (section 4): inline vs dialog.
- Performance diagnostic of the two-column page (both lists mounted) before building it; see
  `deferred-work.md`.
