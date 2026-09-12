# Criteria Calibration Page Redesign

Branch: `criteria-calibration-page-redesign`. **Not yet merged to `master`** as of this
writing — see "Verification" below for why (no live authenticated browser pass was possible
this session; automated coverage is thorough, but the plan called for a QA-account browser
pass too, and that step is still open).

## Source

`criteria-calibration-information-architecture-v4.md` / `criteria-calibration-concept-draft.md`
(design-discovery chat, 29 Aug 2026 — Project Knowledge, not this repo). The brief itself made
several assumptions about "current" code that turned out to be wrong (it assumed the page was
built on Chakra `Steps`, and that `ProgressHeader`/`HistoryActions` were already scoped away
from checkpoints) — two research passes plus a direct read of `CriteriaCalibrationPage.tsx`
corrected those before implementation; see the plan file's "Context" section (superseded by
this doc now that the work has shipped) for the corrections.

## What shipped

**Routing (Pass 0).** Route renamed `/criteria-calibration` → `/calibration`; the old path
redirects (`CalibrationRouteRedirect` in `main.tsx`), preserving the query string. `?step=
guide|calibration|results` lives in the URL via `useSearchParams`, not local state — a refresh
or shared link preserves which tab is showing. Default when absent: `calibration` if the
resumed session already has answers, `guide` otherwise.

**Header (Pass 1–2).** `CalibrationPageHeader` — breadcrumb (via the newly-shared
`resolveFromSource` helper, extracted from `AlbumRatingPage.tsx`'s own copy on its second use),
a `TitleStatusRow` (heading + `TierAccuracyBadge`, badge hidden until the session has actually
started), and Chakra's `Tabs.Root` (first use of `Tabs` anywhere in the app) — persistent
across all three tabs, always clickable, no forward-blocking.

`TierAccuracyBadge` replaces two ad hoc renderings (`AccuracyStatus`'s "Detail: X" text pair,
and a bare `<Badge>` on the checkpoint with no percentage) with one two-section compound
component (tier label + percentage, shared border, no connecting word) reused at two sizes —
`sm` in the header, `lg` and centered on checkpoint screens. **Ships with a neutral placeholder
color for all four tiers** (`src/lib/criteria-calibration/tierColors.ts`) — the brief flagged
tier colors as undecided and said not to invent them; Dan's call this session was to ship inert
and log the real-palette decision to `deferred-work.md` rather than block or guess.

**Work content (Pass 3–4).** `WorkStatusRow` (round counter + linear progress bar, replacing
the old circular `ProgressCircle`) and `ActionRail` (icon Undo/Redo/Restart, `react-icons/lu`,
replacing text-only `HistoryActions`) are now scoped to the `ask` branch only — **a real,
previously-unbuilt fix**: the old `ProgressHeader`/`HistoryActions` were rendered
unconditionally, siblings of the checkpoint/question conditional, so neither was actually
removed from the DOM during a checkpoint despite the brief assuming otherwise.
`commitAdvance()` already updates `progressPercent` to the new degree's baseline before a
checkpoint renders, so showing that jumped number there would have had no visible cause — this
is why the scoping matters, not just tidiness.

Restart (new): full reset — clears the answer log (local + server, via the new
`deleteAllAnswers` in `persistence.ts`), back to round 1 / degree 2 / solver reset from
scratch. Gated behind a confirm dialog reusing Favorites' remove-confirm pattern verbatim
(`DialogRoot role="alertdialog"`, `initialFocusEl` on the safe action).

Checkpoint screens (Pass 4) gained focus-on-mount (a `tabIndex={-1}` ref moved to the headline)
so screen readers reliably announce them — `aria-live="polite"` alone doesn't guarantee that if
focus is sitting elsewhere. `CalibrationCheckpoint`'s single `onFinish` prop (previously used
for both the non-terminal "Pause here" and the terminal "Done, evaluate albums") is split into
`onPause` (→ Results tab, stays on `/calibration`) and `onFinish` (→ `navigate(exitDestination)`,
unchanged) — a real behavioral divergence the brief called for, not previously built.

**Pause (Pass 5).** The old `stopped` boolean + inline "Calibration paused" text is replaced
entirely by `PauseDialog` — universal copy (not tier-variant, since pausing isn't tied to a
specific event the way a checkpoint is), `initialFocusEl` on "Keep going" (matching the
Favorites confirm-dialog convention: the safe action gets default focus, not the exit action).
Confirming always goes to the Results tab, no grade-conditional routing — the Results tab's own
soft gate handles "not enough data."

**Guide + Results tabs (Pass 6), both new — no prior screen of either kind existed.** `GuideTab`:
intro copy + a criteria-preview carousel (`CriteriaCarousel`, built on Chakra's previously-unused
Carousel scaffold; `slidesPerPage` is a real Carousel.Root prop, not something hand-rolled) +
"Start Calibration" CTA. Each card shows all 5 levels directly, no accordion — a mid-session
refresher (e.g. round 40) needs the explanation immediately, not behind a tap. Content pulled
from the criteria catalog, including a **new `description` field** (`criteria.description`,
already seeded in the DB, just not previously surfaced by `useCriteriaCatalog`/
`criteriaCatalog.ts` — plumbed through, not new copy). `ResultsTab`: minimal — a below-grade-2
soft-gate message + CTA when `hasWeights` is false (checked locally via `answers.length > 0`
rather than re-fetching `useCalibrationGate`'s own Supabase query, since the page already knows
this), otherwise a one-line "coming soon" placeholder. **The full Results IA is explicitly out
of scope** — this is a placeholder, not a design.

**Recovery unmount-safety (Pass 7).** A real, confirmed gap: the solver-recovery `useEffect`
(trim → delete row → resync weights/status, up to 5 attempts) had no guard against firing
`setState` after the page unmounts mid-sequence. Traced to exactly one place —
`usePendingWritesGuard.ts`'s `setHasPendingWrites` — every other step in the sequence either
runs synchronously while still mounted, or only mutates a ref (safe regardless). Fixed once,
inside the hook itself (an `isMountedRef` + cleanup effect), covering every `beginWrite`/
`endWrite` call site uniformly rather than requiring each caller to pass its own guard.

## Follow-up pass, 2026-09-08 — UI integration against Album Evaluation

Three problems found in the first authenticated browser pass, all layout/integration rather
than behaviour. No calibration logic changed.

**1. The page was narrower than the rest of the app.** Every return path nested a
`Container maxW="4xl"` (896px) inside the outer `container.xl`, so the header spanned the full
viewport while the content sat in a squeezed centre column. `AlbumRatingPage.tsx` — the page
this one is meant to sit alongside — uses `container.xl` alone. The inner container is gone;
blocks that genuinely want a reading measure (the Guide intro, checkpoint copy) cap their own
width locally instead.

**2. Tab content had no frame.** Album Evaluation puts its content in a flush 2px card
(`surface.ratingCardFill` + `border.ruleStrong`, square corners — `DesktopRatingLayout.tsx:66`,
`MobileRatingLayout.tsx:396`). Calibration now uses the same treatment around the tab body.
Two deliberate differences: the frame carries its own padding (the rating layouts' sections are
designed to sit flush and supply their own; these tab bodies are ordinary prose and controls),
and it wraps the content only — not the breadcrumb/title/tab bar above it, since boxing the tab
bar in with the panel would make it look like it belongs to the panel it switches.

**3. The Guide carousel was not a carousel.** It rendered all six criteria squashed side by
side at ~162px each with `xs` level text, and had no visible controls.

Root cause, worth recording because it will bite anything else built on `components/ui/carousel.tsx`:
**Chakra 3.36 ships no slot recipe for `carousel`** (nothing under
`@chakra-ui/react/dist/esm/theme/slot-recipes`). Every Carousel part therefore renders
completely unstyled, and that scaffold had been committed unused and never rendered, so nobody
had hit it. Concretely:

- `PrevTrigger`/`NextTrigger` collapsed to `0x0` — the chevron SVGs were in the DOM the whole
  time, the buttons just had no size. They now carry explicit `IconButton` styling.
- `ItemGroup`/`Item` consumed none of the `--slides-per-page` / `--slide-item-size` variables
  zag publishes on the root, so `slidesPerPage` appeared to do nothing and every item laid out
  at its natural width. The group is now the scroll/snap container and items size from
  `--slide-item-size`.
- `spacing="4"` was interpolated raw into `--slide-item-size`'s `calc()`, producing
  `calc(100% / 3 - 4 * 2 / 3)` — a unitless number subtracted from a percentage, which is
  invalid and voided the whole expression. It must be a real CSS length; it is now `1rem`.

Sizing: 4 cards per page became 3, and level descriptions `xs` became `sm`. With the page now
full-width that roughly doubles each card's measured width (~162px to ~425px).

One test-only consequence: the item group is a real scroll container now, so zag calls
`el.scrollTo` on it, which jsdom does not implement (it defines scroll methods on `window`
only). That surfaced as two _unhandled_ errors rather than failures — the kind Vitest warns can
mask false positives — so `src/__tests__/setup.ts` gained no-op `Element.prototype.scrollTo` /
`scrollBy` stubs, alongside the existing `ResizeObserver`/`IntersectionObserver` ones.

Verified live at 1440px, 800px and 375px on the QA account: full-width layout, framed panel on
all three tabs, and the carousel paging correctly (`scrollLeft` 0 to 441.5 on Next, arrows
enabling/disabling at the ends). 339/339 tests, no new type errors (203 to 205 repo-wide, both
new ones the same pre-existing react-icons `TS2786` class as `ActionRail`'s `LuUndo2`), and
lint on the touched files dropped 37 errors to 2 — `carousel.tsx` was a generated file that had
never been Prettier-formatted; the 2 remaining are the page's known pre-existing
`set-state-in-effect` pair.

## Design-review pass, 2026-09-11 — header

Dan compared five header variants in Figma and picked a direction that differs from the first
build. Scoped to the header area plus one button; tier derivation, checkpoints, routing and the
Guide/Results tabs are untouched.

**1. Visible page title removed, replaced by a visually-hidden heading.** The active tab now
anchors "you are here", and the old title repeated the breadcrumb's last segment. The hidden
heading is an **h2, not the h1 the brief asked for**: the global `Header` already renders the
page's one `<h1>` ("Slant Take"), and the visible title being replaced was itself an h2 (Chakra's
`Heading` defaults to h2). h2 is the exact replacement; an h1 would give the page two top-level
headings. `TitleStatusRow.tsx` is deleted — the title and badge were all it held — and
`TierAccuracyBadge` moved onto the tab row, still inside `data-testid="calibration-header"`.

**2. Active tab is a filled, bordered folder tab instead of an underline** (stronger non-text
contrast on the active state). How it is built matters, because the first attempt was wrong:

- Chakra styles Tabs through a **slot recipe** (`tabs`: slots root/list/trigger/content/indicator;
  variants line/subtle/enclosed/outline/plain), not through props on each trigger.
- First attempt: the default `line` variant with inline overrides on every `Tabs.Trigger`, plus
  deleting `<Tabs.Indicator />` and hiding the list's baseline. That left a **2px white bar** under
  the active tab, because `line` draws its selected indicator as a `::before` on the _trigger
  itself_ (`layerStyle: indicator.bottom`), independently of the separate `Indicator` part.
  Measured live: `content: ""`, 2px, white.
- Now: the built-in **`outline` variant** — the folder-tab behaviour from the Chakra docs demo —
  restyled once in `theme.ts`'s existing `slotRecipes` block (next to the `drawer`/`dialog`
  overrides). The component is just `<Tabs.Root variant="outline" size="lg">` with plain triggers.
  An override of `outline` rather than a new variant name because this repo does not run Chakra
  typegen, so a new name would not exist in the prop types.
- Two departures from stock `outline`, both commented in `theme.ts`: the list's own baseline is
  hidden (the panel's 2px top border is the baseline), and the list's `minH` is released. The base
  `list` slot sets `minH: var(--tabs-height)`, equal to the trigger's height, which absorbed the
  trigger's `-2px` overlap inside the list — **measured 0px overlap, the panel's border still
  visible under the active tab**. With `minH: auto` it overlaps by 2px and a hit-test on that
  border pixel lands on the tab. The selected trigger paints its bottom edge in the panel's fill.
- Consequence: an `outline` Tabs must sit directly on a panel with that border. So the page
  renders the header and panel with no gap, and **"Saving…" moved from between them to below the
  panel** — otherwise it would break the join on every answer.

**3. Breadcrumb separated by spacing only, 16px below the header, on every breadcrumb page.**
The spacing was produced independently by each page and had drifted to 76px (calibration: 12px
header margin + 24px stack gap + 40px `py={10}`) and 36px (Album Evaluation). Breadcrumbs are now
handed to the global `<Header breadcrumb={...} />`, which alone owns the 16px from its bottom rule.
Pages without one render as before — the header's 12px bottom margin just moved onto a wrapper
(re-measured on Favorites: 36px, unchanged). Calibration's extra `py={10}` is gone from all four
return paths. The breadcrumb for this page is `CalibrationBreadcrumb`, exported from
`CalibrationPageHeader.tsx`.

**4. `EqualButton` has full visual weight** — same solid primary style as "This one" (measured
identical fill). Label left as "About equal"; see open items.

**Verification.** Live on the QA account:

- **Spacing:** header rule → breadcrumb is 16px on both Calibration and Album Evaluation. Favorites is unchanged at 36px.
- **White bar:** gone.
- **Tab join:** the active tab overlaps the panel border by 2px and covers it. The inactive tabs overlap it with transparent bottoms, so the rule shows under them.
- **Hidden heading:** present in the accessibility tree, and visually clipped (`position:absolute`, 1px, `clip:rect(0,0,0,0)`).

339/339 tests with no test changes needed.

Type-check compared by error message against HEAD, in a temporary worktree rather than `git stash` so the live page wasn't hot-reloaded mid-measurement: +1 `theme.ts` TS2741 "`slots` missing" on the tabs override, the same class the existing `drawer`/`dialog` overrides already produce (Chakra deep-merges these at runtime); −1 `Header.tsx` unused `React` import, now used. Net unchanged at 205. Lint on touched files shows only the page's two pre-existing `set-state-in-effect` errors.

**Follow-ups settled 2026-09-12, all three verified manually by Dan:**

- **Breadcrumb → tabs is 24px** (was 36px). The 12px came from the header wrapper's bottom
  margin sitting on top of the page stack's 24px gap; that margin is now dropped when a
  breadcrumb is present, since the breadcrumb is what follows the header and is already spaced by
  `breadcrumbTop`. Pages without a breadcrumb keep it (verified: home unchanged at 12px / 36px).
- **The 16px is a named token.** `spacing.breadcrumbTop` in `theme.ts`, consumed as
  `mt="breadcrumbTop"`, verified live as the CSS var `--chakra-spacing-breadcrumb-top: 1rem`. It
  is a layout contract one component owns across every breadcrumb page, which is what earns a
  name. The 24px is deliberately NOT tokenized — it is the page stack's existing `gap={6}`, the
  same rhythm between every block on the page; naming it would imply a breadcrumb-specific rule
  that does not exist.
- **Equal button reads "They are equal"** (was "About equal"); the solver-crash test's click
  target was updated with it.
- **Breadcrumb depth stays "Favorites / Criteria Calibration"** — confirmed correct as-is.

## Design-review pass, 2026-09-12 — calibration tab content

Second design-review delta, scoped to the Calibration tab's own content. Nothing about the
driver, checkpoints, tiers or persistence changes.

**Two shared text styles, not per-component font props.** The design uses one size for the
question title and each card's level name, and a second, smaller one for the round counter and
the progress percentage. Those are now `textStyles.cardTitle` (Inter 18px/500) and
`textStyles.statusReadout` (Inter 14px/700) in `theme.ts`, rather than four independent
font/size/weight decisions that drift apart. The counter and percent were briefly on `cardTitle`
and read far too large next to the question — hence the split, which is the honest shape of the
design anyway: content type and readout type are different roles.

The question title had to stop being a `Heading`: that recipe hardcodes the display face and
overrode the shared style. It is `Text as="h2"` now — same element, same document outline, type
the token can actually control.

**Sentence-case level names cost one line.** The labels are already stored sentence case
("Groundbreaking", "Some fresh ideas"); the shouting was purely a `textTransform` in
`CriterionRow`. No data change.

**Progress bar colours and height.** Progress is a slot recipe (track/range) that, like tabs
before it, had no theme layer — so it rendered Chakra's defaults: a `bg.muted` track invisible on
this panel and a white range. `theme.ts` now overrides the DEFAULT `outline` variant (putting
them in `base` would be silently overridden by it): track `ink.700`, range `ink.300`. Height is
`size="lg"`, which is the recipe's own 12px track (xs 6 / sm 8 / md 10 / lg 12 / xl 16px) — the
size token rather than a hardcoded height that would drift from the recipe.

**Panel fill is `ink.900`, via its own `surface.tabPanel` token.** Deliberately not reusing
`ratingCardFill` (sand.900, Album Evaluation's card), and deliberately a token rather than an
inline value: the tabs slot recipe needs the identical value twice — the active tab's fill, and
the bottom edge it paints over the panel's border. That join only reads as a join while the two
match, so they must be one token, not two equal literals.

**The separator under the progress row is gone**, and the title carries 32px above and below.

**The status row's spacing is two nested gaps, not one flat gap plus a nudge.** The design groups
it as [counter / bar / percentage] at 16px internally, with 24px between that whole group and
Pause. Expressed with an inner flex group, so each number states what it is rather than one of
them being the sum of the other and a correction. Measured live: 16 / 16 / 24, with all four
elements sharing a vertical centre.

The percentage reserves no width. It was briefly `minW="4ch"` + right-aligned so the bar's
length could not jitter as the number gained a digit, but that puts two characters in a
four-character box — a gap visible every single round, to avoid a reflow that happens exactly
twice in a session (9->10, 99->100). The gap is permanent; the shift is not.

**The action rail aligns to the cards, exactly, without a magic offset.** The requirement was
both "rail level with the top of the cards" and "title centred over the cards" — a flex row can
only do one, because the rail aligns to whatever starts the column, so keeping the title there
would need the rail pushed down by the title's exact rendered height. That offset would go wrong
the moment the title's size changed, which this very pass changes. The row is now a two-column
grid: the title occupies row 1 of the card column only (so it centres on the cards), and the rail
and cards share row 2 (so they align by construction, at any title height). Rail buttons moved
from ghost to `outline` at size `md`.

**Copy:** "Which of these **two** alternatives do you prefer?" (was "2");
`CriteriaCalibrationFreezeCheckpoint.test.tsx` asserts that string and was updated with it.

**Verified live** on the QA account: counter and percent Inter 14px/700; bar track 12px with
range `rgb(189,189,189)` and track `rgb(58,58,58)`; panel `rgb(19,19,19)`; separator `0px`; 32px
above and below the title; **rail top vs card top = 0px**; level name rendering "Groundbreaking"
with `text-transform: none`.

339/339 tests. `tsc` goes 205 -> 206: one more "Property 'slots' is missing" on the new progress
recipe override, the identical class the existing `drawer`/`dialog`/`tabs` overrides already
produce (Chakra deep-merges these at runtime, which is why those work). Declaring `slots`
explicitly would silence all four but risks REPLACING rather than extending each recipe's slot
list, so the established precedent is kept.

**Still open:** the Guide tab shows the same level labels and still uppercases them, so the two
views now disagree about the same words. A two-line fix (drop its `textTransform`, put its level
names on `cardTitle`) is proposed; the wider Guide restructuring Dan mentioned is its own pass.

## What deliberately did NOT change

Per the plan's explicit boundaries, respecting two prior decision docs'
`criteria-calibration-degree-tiers-and-progress.md` and
`criteria-calibration-tiered-checkpoints.md` "What NOT to change" sections:

- Tier derivation (`degreeTiers.ts`'s `tierForCompletedDegrees`/`completedDegrees`), checkpoint
  variant→tier mapping, and checkpoint precedence.
- The progress-fill formula (`computeProgressPercent`, `computeDegreeCoverageFill`,
  `clampFillMonotone`) — only how it renders (bar vs. ring) changed.
- Checkpoint copy (`checkpointCopy.ts`) and the six copy rules it enforces.
- `acknowledgedBoundaryDegree`'s non-persistence.

## A discovered (not introduced) quirk, surfaced but not fixed

The header's continuous `tier` value uses `completedDegrees(currentDegree, atDegreeBoundary)`,
which assumes "being at degree d implies degrees 2..d-1 were exhausted." The freeze-checkpoint's
`handleFreezeContinue` breaks that assumption on purpose (it advances degree without exhaustion),
so for one transitional window — immediately after continuing past a freeze, before the next
real checkpoint or exhaustion — the header can show a promoted tier (e.g. "Blurry") that hasn't
actually been earned by real exhaustion. This is **pre-existing, unchanged by this branch** —
the header already computed and displayed this same value before (as "Detail: Blurry" text); it
was only invisible to `CriteriaCalibrationFreezeCheckpoint.test.tsx`'s exact-string assertion
because the old text format didn't match a bare `'Blurry'` query. `TierAccuracyBadge` renders
the label as its own standalone text node, which made the existing test notice. Test updated to
scope its assertion to what it actually protects (no _checkpoint_ screen shows an unearned tier)
rather than the whole page, per `CalibrationPageHeader`'s new `data-testid="calibration-header"`.
Not fixed here — tier-derivation is out of this branch's scope — but worth a line for whoever
next touches `completedDegrees` or the freeze-checkpoint's degree-advance logic.

## Verification

- `npm run type-check`: clean.
- `npx vitest run`: 339/339 passing (45 pre-existing files + 1 new,
  `CriteriaCalibrationTabsAndGuide.test.tsx`, covering the new default-landing behavior, "Start
  Calibration", the Results tab's soft gate, and Guide being reachable mid-session).
- `npm run lint`: no new errors beyond the codebase's large pre-existing baseline (confirmed by
  diffing lint output against `master` — 3439 pre-existing problems vs. 3442 after this branch's
  changes at first pass, and the 3 new ones were this branch's own formatting, since fixed).
- jsdom needed an `IntersectionObserver` stub added to `src/__tests__/setup.ts` (same pattern as
  the existing `ResizeObserver` stub) — Chakra's Carousel machine calls it, and this is the
  first component in the app to use Carousel.
- Live browser: confirmed the old `/criteria-calibration?from=favorites` URL redirects to
  `/calibration?from=favorites` and then correctly hits the `RequireAuth` gate (→ `/login`,
  no session), with no console errors. **Did not** get further — no QA-account credentials were
  available this session to drive the authenticated flow (Guide carousel, Pause dialog, Restart
  confirm, checkpoint focus, Tab keyboard nav) live in a real browser. The plan's own
  verification checklist calls for that pass; it's the one open item before merge.

## Not in this branch

- Full Results tab design (needs its own IA session).
- Real tier-color palette (neutral placeholder shipped; logged to `deferred-work.md`).
- Toaster re-skin to the app's own design tokens (found while checking the error-states section
  of the brief; global/cross-cutting, logged to `deferred-work.md` rather than bundled in here).
- AOTY breadcrumb entry point (only the `resolveFromSource` plumbing was built).
