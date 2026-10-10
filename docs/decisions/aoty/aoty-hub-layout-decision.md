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

## Corrections and added figures, 2026-10-10

Appended; the text above is left as written. Four statements are wrong or incomplete:

1. "Drawer (option B): not built; no measurement was made" (options table, and the "Numbers"
   section's silence on drawers). Drawer findings exist (below).
2. "Smallest width at which the desktop row tree fits: not measured". It was measured (below).
3. "No URLs are recorded ... or were available" (Precedents). The links are below.
4. The `deferred-work.md` lint item (2026-10-10), which says a brief's "74 files and 22
   prettier-only" differs from the measured "87 / 64". They do not differ; they are different
   definitions of the same lint run (see Lint definitions). That item carries a correction note.

### Added figures: [H0]

**[H0]** = CC investigation reports 2026-10-08, harness, synthetic data, stub header; relayed to
this session, not re-measured. They were produced in separate Claude Code investigation sessions
with throwaway harnesses that were deleted; they cannot be reproduced from the repo.

**Row fit** (desktop tree, row width W):

| Figure | Value |
|---|---|
| Meta column width | Contender W - 429px; AOTY W - 248px; mobile (stacked) tree W - 132px |
| AOTY desktop row acceptable (no overflow, date on one line) | from 400px; 156px tall at 400, 139px at 480, 132px from 520 |
| Dated Contender desktop row acceptable | from about 640px (139px tall); the 132px floor is reached at 720px |
| Undated Contender desktop row acceptable | from 720px (145px tall) |
| Contender desktop row at 400px | overflows by 31px |
| Mobile (stacked) tree, 400 to 720px | no overflow; 240px tall, 284px when the footer wraps (below 520px for Contenders) |
| Footer | needs a row of at least 332px (labels hidden below a 400px viewport) |
| Hiding genres on a stacked row | saves about 43px per row |
| AOTY full page, desktop row: container at viewports 768 / 1024 / 1280 / 1512 | 720 / 960 / 1216 / 1376px |
| Same, meta column | 428 / 668 / 924 / 1084px |
| Same, row and list | row 132px; list 852px for 6 albums and 3012px for 21 at 1512x850 |

**Drawer** (Chakra 3.36, Zag dialog 1.41.2, headless Chrome):

- `modal={false}` is the default and sets `trapFocus`, `preventScroll` and `closeOnInteractOutside`
  to false. The page behind stays interactive.
- Focus moves into the drawer on open but is not restored on close (it ends on BODY after Escape).
  Escape closes it, even when typing in a page input.
- Sizes: `sm` 448px, `md` 512px.
- Nested: a modal 512px picker over a 512px drawer covers it fully; focus is trapped in the child;
  Escape closes the child first; z-index 1500 and 1501.
- Stacked row in a drawer, 15px scrollbar, checkbox column, 21 albums (heights are genres on / off;
  visible rows are counted before subtracting about 130px of header and bulk bar):

| Drawer width | Row width | Footer | Row height | Rows visible |
|---|---|---|---|---|
| 420px | 355px | wraps | 284 / 241px | 2 / 3 |
| 480px | 415px | one line | 240 / 197px | 3 / 4 |
| 560px | 495px | one line | 240 / 197px | 3 / 4 |

- A 480px drawer at 1512 covers x=1032 to 1512, while the AOTY desktop row spans x=68 to 1444, so
  the row's actions would sit behind the drawer.

### Where [H0] agrees or differs with the earlier figures

- Agrees: footer minimum 332px ([H1]); row heights 240 / 284px ([H1]); AOTY container widths and the
  132px row ([H1], [H2]: panel 720 / 960 / 1216 / 1376px at 768 / 1024 / 1280 / 1512); list heights
  852px and 3012px are what 6 and 21 rows of 132px with 12px gaps give.
- Close but not equal: a stacked Contender row in a 480px drawer is 415px ([H0]) against the
  frozen branch's about 410px in a 468px column at 1024 ([frozen]); different containers.
- **Differs, not reconciled:** [H1] row heights in the tabs panel at 768 were 132px (panel height
  1188px for 7 Contenders, the same as at 1280), where the row width is about 620px by geometry
  ([est]: 720px panel, minus 2px borders and 32px padding on each side, minus a checkbox column).
  [H0] puts a dated Contender row at 139px around 640px and unacceptable below it. The two
  measure different things: [H1] measured height only, with short synthetic titles, and did not
  check overflow or whether the date stays on one line; [H0]'s criterion is no overflow and a
  one-line date. [H0] is the better source for fit; [H1] stands for heights of rows with short
  titles. Not re-measured.
- "Stacked card: no overflow down to 272px" ([frozen]) and "footer needs 332px" ([H0], [H1]) do not
  conflict: one is overflow, the other is whether the four footer buttons stay on one line.

### Precedent sources (searched 2026-10-08)

- Mercury Prize 2026 shortlist: https://new.newcastle.gov.uk/news/2026/mercury-prize-2026-album-year-shortlist-announced
- Greenhouse, bulk move: https://support.greenhouse.io/hc/en-us/articles/360028064592-Move-Candidates-to-Another-Stage-in-Bulk
- GoodTime, kanban: https://support.goodtime.io/articles/1026621882-agent-job-pipeline
- Instahyre, kanban: https://help.instahyre.com/en/article/kanban-view-xn72h9
- Letterboxd: https://letterboxd.com/welcome/

The Mercury shortlist has 12 albums and then a winner. The discovery notes' wording "shortlist of 12
→ finalists → winner" (`docs/discovery/aoty-hub-population/lightning-demos.md:32`) is not confirmed
by these sources: no separate finalist stage was found. That file is Project-Knowledge-owned and
was not edited.

### Lint definitions (measured 2026-10-10 with `npx eslint . -f json`, read-only)

Same run, five definitions; nothing was fixed.

| Definition | Files |
|---|---|
| Total linted files | 303 |
| Files with at least one error | 87 |
| Files whose errors are all `prettier/prettier` (at least one error) | 64 |
| Files with at least one `prettier/prettier` error | 74 |
| Files whose every message, errors and warnings, is `prettier/prettier` | 22 |

Totals: 1532 errors (1445 `prettier/prettier`), 486 warnings. The brief's "74 files, 22
prettier-only" is the fourth and fifth rows (any prettier error; nothing but prettier). The earlier
"87 / 64" in this branch's docs is the second and third rows. By area (`src` / `scripts` / other),
files with an error 52 / 34 / 1, with only prettier errors 41 / 23 / 0.
