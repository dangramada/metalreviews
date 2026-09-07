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
scope its assertion to what it actually protects (no *checkpoint* screen shows an unearned tier)
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
