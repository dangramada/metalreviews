# AOTY hub layout: tabs chosen, two columns and drawer parked

2026-10-10. **Status: decision record, frozen as written.** Branch `feature/aoty-tabs` (ready, not
merged). Gateway: `../aoty-summary.md`. The two-column build is kept, frozen, on
`feature/aoty-two-column` (tip `e03fcf3`); its docs are not rewritten here, read them there:
`aoty/aoty-year-scope-and-two-column-decisions.md` (status update 2026-10-07),
`aoty/aoty-list-implementation.md` ("Two-column hub"), `deferred-work.md` ("New items, 2026-10-07"),
`home-grid-virtualization.md` (addendum).

## Decision

The hub is one route, `/aoty`, with two tabs chosen by `?view=aoty|contenders` (default `aoty`),
styled like the Criteria Calibration page (outline Tabs, framed panel). Not two columns, not a
drawer.

## Why (Dan's reasons, 2026-10-10)

1. About 2 stacked rows per column at 1512x982. **Estimate**: not measured by any source below. The
   nearest measurement is the frozen branch's 352px column viewport at 1366x768, about 1.4 stacked
   rows, and 304px at 1280x720.
2. Nested scroll behaves inconsistently on Windows. Reported by Dan; not measured here.
3. Two simultaneous lists are too dense.
4. "Add from Favorites" would be a nested overlay inside a drawer (the picker is itself a Drawer,
   `AddToContendersPicker`).

## Options considered

The 2026-10-03 plan called two columns "option C of the layout review". This record uses new
letters; the old "C" is **A** here.

| | Option | Outcome |
|---|---|---|
| A | Two columns, AOTY beside Contenders, each scrolling | Built and frozen on `feature/aoty-two-column`; not merged |
| B | Drawer (one list on the page, the other in a drawer) | Not built; no measurement was made in this work and none exists in the docs |
| C | Separate screens (`/aoty`, `/aoty/contenders`, nav buttons), the state before this work | Replaced by tabs; the nav buttons are gone |
| F | AOTY is home; "Add from Contenders" picker on AOTY; Contenders a separate screen with a breadcrumb and "Add from Favorites" | Not built; the picker is deferred (`deferred-work.md`) |
| T | Tabs on one route | **Chosen**, built on `feature/aoty-tabs` |
| T+F | T plus the AOTY picker | Picker deferred |

## Precedents named by Dan

Letterboxd welcome page; Greenhouse bulk-move article; GoodTime and Instahyre kanban articles.
**No URLs are recorded in this repo or were available in this session**; add them here. The repo's
own discovery notes on Letterboxd are `docs/discovery/aoty-hub-population/lightning-demos.md`
(lines 39 and 63).

## Numbers

Source labels:
- **[frozen]**: the frozen branch's docs (dev browser, fake REST data, as written there).
- **[H1]**: harness, synthetic data, stub header (first session; real row components, a placeholder
  header about 72px tall).
- **[H2]**: harness, synthetic data, real `Header`, the real hub with mocked data hooks,
  `<html class="dark">`.
- **[est]**: estimate.

Where sources disagree the measured one is used and the difference is stated.

### Two columns (A)

| Figure | Value | Source |
|---|---|---|
| Content width at a 1280 viewport | 1216px, so each column about 596px | [frozen] |
| Content width at the 1440 cap | 1376px, column about 676px | [frozen] |
| Column width at 1024 | 468px | [frozen] |
| Stacked Contender card beside its checkbox at 1024 (15px classic scrollbar) | about 410px; AOTY card 442px | [frozen] |
| Narrowest card with no overflow | 272px | [frozen] |
| Column viewport height (Header, year toolbar, pinned Footer included) | about 352px at 1366x768; about 304px at 1280x720; roughly 1.4 stacked rows | [frozen] |
| Rows per column at 1512x982 | about 2 | [est] (Dan); no source measured this viewport |
| Window scroll in two-column mode | none; the columns scroll | [frozen] |

### Row fit and heights (used to choose the panel treatment)

| Figure | Value | Source |
|---|---|---|
| Desktop row height | 132px, 12px gap | [H1], [H2] |
| Mobile-tree row height | 240px with the footer on one line; 284px when the footer wraps | [H1] |
| Smallest row width that keeps the 4-button Contenders footer on one line, viewport under 400px (labels hidden by the 399px rule in `FavoritesPage.tsx`) | 332px (328px wraps) | [H1] |
| Footer at 375px by row width | 343px one line; 315px and 299px two lines | [H1] |
| Footer at viewports of 400 to 430px | two lines at every row width tried up to 420px, with no frame | [H1] |
| Footer at a 600px viewport | one line at 524px and wider, two lines at 420px | [H1] |
| Footer at 360px (row 328px) | two lines, with no frame | [H1] |
| Smallest width at which the desktop row tree fits | **not measured** | none |

### Tabs (T) and single screens (F, C)

| Figure | Value | Source |
|---|---|---|
| Panel at 1280, 6 AOTY rows / 7 Contenders rows / 21 Contenders rows | 1216px wide; 920px / 1188px / 3204px high | [H1] |
| Panel inner padding | 32px from `md`; row width 1148px at 1280 | [H1] |
| Rows fully visible on a first screen of 850px | AOTY 4, Contenders 3 (the add button row and the 64px bulk bar come first) | [est] from the geometry above |
| Page scroll | always, at every width | [H1] |
| Bulk bar (64px) inside the Contenders panel | fits at 768, 1024, 1280, 1512; no horizontal overflow; the 768 image was not looked at | [H1] |
| Document height, 6 / 7 / 21 rows | 1168 / 1436 / 3452px (tabs); 1094 / 1370px (F, 6 AOTY / 7 Contenders) | [H1] |
| Tab list width | 204 to 207px at 375 (6/7 or 3-digit counts), 231px and 266px at 768 | [H1] |
| Year select beside the tabs, 3-digit counts | 0px spare at 375 (207 + 16 + 120 = 343); no wrap at 375 or 768 | [H1]; not seen in any image |
| Shipped panel below `md` | top border only, no side padding: row 343px wide at 375, footer on one line | [H2] |
| Reads per route | 9 on `master` (`/aoty` reads contenders twice), 8 with the hub | test, `AotyHubReads.test.tsx` |

### Screenshots

Session-local (the scratchpad may not outlive the session), under
`/private/tmp/claude-501/-Users-gdi-Developer-metalreviews/452ad35b-2ece-4c57-8b6a-02414260e6f3/scratchpad/`:
- `shots/`: [H1] tabs and F variants at 768, 1024, 1280, 1512 (and 375 for `T-aoty`, `T-cont`,
  `F-cont`), named `<variant>_n<rows>_w<width>.png`.
- `tabs/`: the 10 shipped-hub [H2] images (AOTY and Contenders at 375, 768, 1280, 1512; the two
  empty states at 1280).
- `shots/tabs375_999.png`: the 3-digit-count tab bar at 375.

The [H1] button text is very dim in the images because that harness had no dark class; judge
layout, not contrast.

## What the tabs branch took from the frozen branch

Taken: `4319215` (members from the pool), `4b80c4f` (permanent bulk bar), `a6aa5c4` (the hub,
without two columns). Parked: `af36d25` (`useMediaQuery`), `2180c72` (stacked row and compact
actions), `b6a07fc` (column headers). `e03fcf3` (docs) is replaced by the files named in this
commit.
