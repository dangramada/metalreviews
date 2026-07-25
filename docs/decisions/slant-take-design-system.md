# Slant Take design system

**Summary:** Full visual redesign of the app (colors, fonts, radii, badge components,
header wordmark), née "Graded Slab" during exploration. Reference spec:
`design-system-spec-slant-take.md`. Shipped as three sequential passes on branch
`design-system-slant-take`, one concern per pass, per project convention. Rollback tag:
`pre-slant-take-design-system` (on `master` at `5a71d40`).

| Pass | Scope | Status |
|---|---|---|
| 1 | Colors + fonts in `theme.ts` | ✅ Complete, verified |
| 2 | Radii (zero, everywhere) | ✅ Complete, verified |
| 3 | Badge restructure (badge → slab), header wordmark, **+ typography cleanup** | ✅ Complete, verified |
| 4 | Chrome polish: card/control borders, grid gap, badge padding, header divider, active-nav color, album color, hover border | ✅ Complete, verified |
| 5 | Rename: "Metal Reviews" → "Slant Take" | ✅ Complete, verified |
| 6 | Loading indicator: circular spinner → "marching text" | ⚠️ Superseded by pass 7 — see below, entry kept as historical record |
| 7 | Loading indicator, unified: marching text + default spinners → one equalizer-bar component at both section and button scale | ✅ Complete, verified |
| 8 | Footer: "Last updated" (relative) + Reviews/Favorites nav + copyright | ✅ Complete, verified |
| 9 | Consistency + hover redesign: form-element borders app-wide, no decimal font sizes, style-guide gap closed, card hover → artwork-only zoom (+ favorites) | ✅ Complete, verified |

Reference mockup for all three passes: **`~/Downloads/03-graded-slab-void-accent_1.html`**
(the row-gap iteration — see the correction note at the top of
`design-system-spec-slant-take.md`; the spec's original "kept over 04-graded-slab-row-gap"
line was wrong, and no file by that name exists).

---

## Pass 1 — colors + fonts

### What shipped

- `src/theme.ts`: added `theme.tokens.colors.{ember,ink,sand}` (full 50–950 ramps) and
  `theme.tokens.fonts.{heading,body,mono}`.
- Semantic token values repointed (names unchanged): `surface.page/card/raised/darkest`,
  `text.primary/dim/muted`, `accent.border/text` now reference the new ramps.
  `accent.start`/`accent.end` repointed to `ember.300`/`ember.600` (not removed —
  `Header.tsx`'s gradient still consumes them, untouched this pass).
- New tokens added, unused by any component yet except where noted: `surface.cardHover`,
  `border.rule`, `border.ruleStrong`, `accent.ink`, `slab.bg`, `slab.text`.
- `border.default`/`border.hover` deliberately left on old gray values, per spec §2 — two
  parallel border systems exist until a future pass migrates consumers over.
- Badge tokens (`badge.source.*`, `badge.score.*`, `badge.genre.*`) untouched — still old
  purple. Expected: pass 3 (badge restructure) fixes them.
- `primaryButton` → `colorPalette: 'ember'`.
- Fonts loaded in `index.html`: Inter + JetBrains Mono via Google Fonts, Clash Display via
  the Fontshare API link (`https://api.fontshare.com/v2/css?f[]=clash-display@600,700`).
  No prior font `<link>`s existed in the repo (Inter was **not** already loaded, despite the
  brief assuming it might be — the app had been running on Chakra's default font stack).

### Bugs found and fixed during verification

`theme.fonts` (top-level) is silently ignored by Chakra v3 — `createSystem`'s config only
reads font tokens from `theme.tokens.fonts`, same nesting as `theme.tokens.colors`. Placing
`fonts` as a sibling of `tokens` compiles fine (no type error, no runtime error) but headings
rendered in the fallback stack (Inter) instead of Clash Display. Caught by checking
`getComputedStyle(heading).fontFamily` in the browser, not by `tsc` or the test suite — worth
remembering for the radii pass (spec's own gotcha note in §4 about `radii` needing raw CSS
strings, not scale references, is the same category of "compiles clean, wrong at runtime"
failure).

A second instance of the same category: adding the `ember`/`ink`/`sand` **ramps** under
`theme.tokens.colors` was not sufficient to make `colorPalette: 'ember'` work on `<Button>`.
Chakra v3's component recipes read a second layer — `colorPalette.solid`, `.contrast`, `.fg`,
`.muted`, `.subtle`, `.emphasized`, `.focusRing`, `.border` — which built-in palettes
(`gray`, `purple`, `red`, ...) get for free from Chakra's own `semantic-tokens/colors.js`,
but a custom ramp does not get automatically. Without it, `colorPalette-solid` silently
resolved to a hardcoded `#FFFFFF` fallback — buttons rendered white, not orange, with no
error anywhere. Fixed by adding an `ember` block under `semanticTokens.colors` mapping those
eight sub-tokens onto the ramp (mirroring Chakra's own `red`/`orange` dark-mode pattern),
with `contrast` set to the new `accent.ink` (`#140a03`) to match the score-slab high-state
treatment planned for pass 3. This was anticipated by the spec (§1: "`ember` needs
registering as a full palette... for Chakra's built-in hover/active/disabled states to
work") but easy to under-scope as "just add the ramp."

### Verification

- `tsc --noEmit` clean.
- `npx vitest run` — 166/166 passed, no test referenced a renamed/removed token (none were
  renamed or removed).
- Visual check at `/style-guide` (local dev server): background true black, text warm
  off-white, accent orange on `accent.border`/`accent.text` swatches, badges confirmed still
  purple (expected). Heading font confirmed via `getComputedStyle` to resolve to
  `"Clash Display", sans-serif`; body to `Inter, sans-serif`. All button variants
  (solid/outline/surface/subtle/ghost/plain, all sizes, default+disabled) confirmed
  rendering in ember orange with correct contrast text, not the pre-fix white.

### Not done (explicitly out of scope this pass)

Radii, badge component restructure (`sourceBadge`/`scoreBadge`→slab/`genreBadge`), and the
`Header.tsx` wordmark/gradient retirement — all deferred to passes 2 and 3 per the spec and
brief. Style-guide swatch label text (e.g. "gray.900", "purple.300") is stale — still
describes the old token values, not touched since it's copy inside `/style-guide` markup,
not a token or theme file.

---

## Pass 2 — radii

### What shipped

A `radii` block under `theme.tokens` (same nesting as pass 1's `colors`/`fonts`), zeroing
**seven** keys as raw `'0px'` strings: `none`, `xs`, `sm`, `base`, `md`, `lg`, `full`.
`2xs`/`xl`/`2xl`/`3xl`/`4xl` left at Chakra defaults — nothing in the app, and no recipe
reachable from it, consumes them.

### The audit finding that changed the scope

The pass-2 brief specified four keys (`none`/`base`/`md`/`lg`), carried forward from
`design-tokens.md`. The audit found that list insufficient in two independent ways:

**1. `base` is not a real Chakra v3 token.** v3's radii scale is
`none, 2xs, xs, sm, md, lg, xl, 2xl, 3xl, 4xl, full` — no `base`. It's a stale v2-era key
that survived the v3 migration in three call sites (`sourceBadge`, `genreBadge`, the
favourites thumbnail). Before this pass it resolved to nothing, which produced *two
different* visible outcomes depending on whether a recipe backstopped it:

- `sourceBadge`/`genreBadge` are `<Badge>`s, so they fell through to the Badge recipe's own
  `borderRadius: "l2"` and stayed rounded.
- The favourites thumbnail is a plain `<Box>` with no recipe, so it rendered square.

Both confirmed by direct observation before the change. Defining `base` makes all three
resolve consistently — to zero — for the first time.

**2. Chakra's recipes don't read the numbered keys at all.** They go through a semantic
layer (`@chakra-ui/react/theme/semantic-tokens/radii.js`): `l1 → xs`, `l2 → sm`, `l3 → md`.
Every component reachable from the live app resolves through it:

| Component | Recipe default | Resolves via |
|---|---|---|
| Button, Input, NativeSelect, Toast | `l2` | `sm` |
| Badge base recipe (**`scoreBadge` sets no `borderRadius` prop at all** — every card's score badge depends solely on this) | `l2` | `sm` |
| Dialog content (discard-confirm), Drawer content (AddAlbumDrawer) | `l3` | `md` |

Zeroing only the brief's four keys would have zeroed Dialog/Drawer (via `l3 → md`) while
leaving every button, input, select, toast and score badge visibly rounded, because `xs` and
`sm` weren't in the list. Adding them is what actually makes `l1`/`l2` go to zero. This is
the same "compiles clean, wrong at runtime" category as pass 1's two bugs — caught in the
audit this time rather than after the edit.

### `full` — decided, not assumed

Zeroed. Single consumer app-wide: the circular heart-favourite toggle over card artwork
(`App.tsx`), now square — consistent with the mockups, which contain no circular elements.
Tradeoff accepted knowingly: this removes Chakra's standard "make this a circle" escape
hatch globally, so a future component wanting a circle needs a dedicated token rather than
`borderRadius="full"`.

### Verification

- `tsc --noEmit` clean; `npx vitest run` 166/166.
- **Programmatic sweep** (stronger than eyeballing, given pass 1's runtime-only bugs): walked
  every element on each page comparing computed `borderRadius`. Home page **0 of 3612**
  elements non-zero; `/style-guide` **0 of 445**; `/login` **0 of 63**.
- Token vars confirmed at runtime: `none/xs/sm/base/md/lg/full` **and** the semantic
  `l1/l2/l3` all report `0px`.
- Swept every CSS rule in the emitted stylesheet: the only `border-radius` declarations that
  exist anywhere are `var(--chakra-radii-l1)` and `var(--chakra-radii-l2)` — no literal px
  radius is emitted by any recipe, so nothing can bypass the zeroed tokens.
- Visual: home page (cards, source/score/genre badges, heart buttons, controls-bar
  inputs/selects, active nav button) and `/login` (inputs + primary button) confirmed square
  by screenshot. `/login` is the meaningful visual proof of the `l2 → sm` path.

**Not verified visually:** Drawer and Dialog content, and the toast. All three are behind
`RequireAuth` on `/favorites` (`/favorites` redirects to `/login`), and reaching them would
require creating or entering credentials. They are covered by token-level proof instead —
`l3` and `l2` both resolve to `0px`, and no recipe emits a literal radius — but that is a
deduction, not a screenshot. Worth an eyeball next time someone is logged in locally.

### Flagged, deliberately not fixed this pass

No hardcoded raw-value radii (literal `'4px'` etc.) exist anywhere in the live app — every
radius goes through a token. Five files under `src/components/ui/` do contain raw/oddly-keyed
radius values (`rich-text-editor.tsx`, `prose.tsx`, `password-input.tsx`, `toggle-tip.tsx`,
`carousel.tsx`), but an import-graph check confirmed **none of them are imported anywhere** —
they're unused Chakra CLI scaffold, dead code that ships in no bundle. Cleaning up unused
`src/components/ui/` scaffold is its own follow-up, unrelated to radii.

Also unchanged, as scoped: `design-tokens.md` still documents the old v2 `base`/`md`/`lg`
radii story and pass 1's colour values. It needs a broader refresh once pass 3 lands rather
than a piecemeal edit per pass.

---

## Pass 3 — badge restructure + header wordmark + typography cleanup

**Scope expanded** from the original spec split. Passes 3 and 4 were folded together at
Dan's request: the badge restructure, the header wordmark, and two typography gaps found
while reviewing pass 2 all serve the same goal ("make the app actually match the mockup"),
so splitting them would have meant two passes touching the same files for the same reason.

### What shipped

**Badges (`theme.ts` + `App.tsx`)** — all three rebuilt per spec §7:
- `sourceBadge`: page-level bg, mono uppercase, 2px top+right borders only.
- `scoreBadge` **removed**, replaced by `scoreSlabBase`/`scoreSlabHigh` plus a new
  `ScoreSlab` component in `App.tsx` — two child nodes (display-face number + dimmed mono
  `/10`), not a single string.
- `genreBadge`: transparent, 1px border. The 1px is intentional and now documented inline
  so a future "consistency" pass doesn't bump it to 2px.

**Positioning fix (not in the brief, required for the treatment to work).** The spec's
partial borders only read correctly flush into the card corner — that is the whole point of
a "flush corner slab". The markup had the badges inset at `bottom={2} left={2}/right={2}`,
which would have rendered floating boxes with two arbitrary ruled edges. Changed to
`bottom={0}` + `left={0}`/`right={0}`, and the multi-source `Wrap` gap from `1` to `0` so
stacked badges form a continuous segmented strip. Verified flush at exactly 0/0 at runtime.

**Header wordmark (`Header.tsx`)**: gradient retired, flat two-tone — "Metal" in
`text.primary`, "Reviews" in `accent.border`. Kept the app's real name rather than switching
to "Slant Take"; a full rename is a much larger separate job (see deferred-work).

**Typography** — five elements moved off Inter/heading onto their mockup faces: band
(→ Inter, split from album), album (→ Inter, own line), release date, review date, review
counter (all → mono, uppercase where the mockup uppercases), and the account nav label
(→ mono).

### The three audit findings that changed the plan

**1. The brief's mockup filename doesn't exist.** `04-graded-slab-row-gap.html` is nowhere on
disk. The row-gap iteration is `03-graded-slab-void-accent_1.html` — an unrenamed browser
duplicate, and the *later* of the two 03 files. The spec's claim that 03 was "kept over 04"
is backwards; corrected at the top of `design-system-spec-slant-take.md`.

**2. `Header.tsx` never consumed `accent.start`/`accent.end`.** The gradient was hardcoded
`purple.400 → gray.300`. Pass 1's stated reason for keeping those two tokens ("still
consumed by Header.tsx's title") was factually wrong, inherited from the spec and never
checked against the file until now — which is also why the wordmark stayed purple through
passes 1 and 2. Consequence: retiring the gradient needed **zero** token work.
`accent.start` remains genuinely used by 3 spinners, 2 links and 2 Header hover states, so
it stays regardless.

**3. The score slab had no number to render for single-review cards.** The brief assumed a
numeric `score` and hardcoded `/10`. Reality: only the 2+ review path had a normalised
number (`averageScore`). The 1-review path used `reviews[0].score`, a **raw source string**
in whatever scale the site used — `"3.5/5.0"`, `"8/10"`, `"85/100"`. No `.toFixed(1)` to
call, and the denominator isn't always `/10`.

Decision: **drive the slab from `averageScore` on both paths.** A single-review album's
average *is* that review's normalized score, so both layouts now render identically. Parsing
a denominator out of the raw string would have been reimplementing normalisation badly, and
the 8.0 threshold is meaningless without normalising first anyway. Accepted consequence: a
source-reported `3.5/5.0` now displays as `7.0` — a consistency improvement, not a data
error. When `averageScore` is null no slab renders at all, which is the right call: a badge
with no data behind it is worse than no badge.

### Open item resolved: multi-source badge stacking

Checked against a real 2-source album (Black Sites — Angry Metal Guy + The Progressive
Subway), at both desktop (badges side-by-side on one line) and mobile 375px (forced onto two
lines). **It holds up.** Flush at 0/0 in both cases; adjacent badges share edges cleanly and
read as one segmented strip rather than detached chips.

One cosmetic note, reported rather than "fixed" since the mockup gives no guidance: stacked
badges have different widths, so the two-line case has a ragged right edge (a staircase).
It reads as intentional-ish against the ledger aesthetic, but if it grates, equalising widths
within the `Wrap` would be the fix. Not done unilaterally — it would be inventing design the
mockup never specified.

### Test changes (2 updated, 1 added)

Both updates were forced by intentional structural changes, and both keep the original
assertion's intent rather than loosening it:
- `Header.test.tsx` — the wordmark is now two `<span>`s, and `getByText` only reads an
  element's *direct* text-node children, so it can no longer match the whole string on the
  `<h1>`. Switched to `toHaveTextContent(/^Metal Reviews$/)` on the heading role, which still
  pins the exact title. **Added** a second test asserting two coloured spans and no
  `background-clip: text`, so the gradient can't silently come back.
- `App.favorites.test.tsx` — the single-review card asserted `getByText('9/10')`, the raw
  source string. That element no longer exists. Now asserts `9.0` and `/10` as separate
  spans; the fixture's `normalized_score: 90` makes this the same grade, normalised.

### Verification

- `tsc --noEmit` clean; `npx vitest run` **167/167** (166 + 1 new).
- Computed-style sweep on the live home page: wordmark Clash Display with spans at
  `#cac6bb`/`#ff6a1a`; band **Inter 19px** (the bug, fixed); album Inter; release date,
  review date, counter and source badges all **JetBrains Mono**; counter uppercase at
  `#666460`. Source badge borders 2px top+right, 0 left; genre tag 1px.
- Slab threshold verified inclusive at exactly **8.0** across live cards: `>= 8.0` renders
  `#ff6a1a` on `#140a03`, below renders `#f2f2f0` on `#0c0c0c`.
- `/style-guide` updated to show the slab in both states; renders clean, no console errors.

### Not done

`naming-decision-record-v2.docx` **does not exist on disk** — it was never a `.md` in
`docs/decisions/` like every other decision record, and appears never to have made it into
the repo at all. Its dated follow-up (accent colour is now ember, no longer "Purple —
unchanged") therefore could not be appended. Recreated as `docs/decisions/naming-decisions.md`
instead, so the append-only convention has somewhere real to live going forward.

## Pass 4 — chrome polish

Container-level chrome that hadn't been assigned to any prior brief, plus a handful of small
fixes surfaced from live screenshot review during pass 3.

### What shipped

- **Card + controls-bar borders**: `cardStyle` (`App.tsx`) and `controlFieldStyle` (the
  search `Input` and all three `NativeSelect.Field`s) both changed from a 1px
  `border.default` to `border: '2px solid'` / `border.ruleStrong` — matching the mockup's
  structural-rule weight instead of Chakra's thin default.
- **Grid gap**: `SimpleGrid gap={6}` (24px) → `gap={2}`, resolving to `space.2` (8px) via
  Chakra's numeric spacing shorthand — a token reference, not a literal `8px` string, so it
  stays theme-driven.
- **Badge/slab padding**: all three brought onto the 4px grid per the brief's table
  (`sourceBadge` 8/4, `genreBadge` 8/4, `scoreSlab*` 12/8/4).
- **Header divider**: `borderBottom: '2px solid'` / `border.ruleStrong` added to the header's
  root `Flex`. Also added `pb={4}` (not in the brief's snippet) — without it the rule sat
  flush against the wordmark's descenders with no breathing room, and the mockup itself
  carries `padding-bottom: 18px` alongside its divider. Flagged rather than silently
  bundled: this is the one place this pass added something beyond the letter of the brief.
- **Active nav color**: confirmed bug, fixed. `text.primary` → `accent.ink` on both the
  "Reviews" and "Favorites" links' active state (bg and hover-while-active), matching the
  score slab's own "dark text on any accent fill" rule.
- **Album name color**: `text.dim` → `text.primary`, matching the band heading. Size (18px
  vs 19px) and weight (500 vs 700) remain the only distinction between the two lines.
- **Card hover border**: now conditional via a new `cardHoverBorderColor(averageScore)`
  helper — `accent.border` at/above the 8.0 threshold, `slab.bg` below **and** when
  `averageScore` is null (no score to "earn" the accent with; not specified by the brief,
  judgment call). The existing `transform: scale(1.02)` was left untouched by merging
  `cardStyle._hover` rather than replacing it.

### Two things the brief got wrong, checked before editing

**The "refresh button" doesn't exist.** It was removed in commit `ccb09ba` ("move ingest
trigger to GitHub Actions cron, remove refresh button"), well before any design-system pass.
Grepped for it to confirm before writing anything. The controls-bar border fix was applied
to the four elements that actually exist (search input + 3 selects) instead.

**`Header.tsx:26`'s `borderRadius: 'md'` — verdict: stale screenshot, not a bug.** Checked
`getComputedStyle` at runtime: `border-radius: 0px`. Pass 2's zeroed `md` token is correctly
applied; whatever screenshot showed it rounded was outdated, not a live re-check. This is the
inverse of pass 2's own two findings (both real "compiles clean, wrong at runtime" bugs) —
here the token resolution was already correct, and the discrepancy was in the observation,
not the code.

### Verification

- `tsc --noEmit` clean; `npx vitest run` **167/167**, unchanged from pass 3 — this pass
  touched no test-covered behavior (no new/changed assertions were needed).
- Computed-style sweep on the live home page: active "Reviews" tab `color: rgb(20, 10, 3)`
  (`accent.ink`) on `background-color: rgb(255, 106, 26)` (`accent.border`) — legible
  dark-on-accent, confirmed by direct pixel value, not by eye. Search input and card border
  both `2px solid rgb(58, 58, 58)` (`border.ruleStrong`). Grid gap `8px` exactly. Header
  `border-bottom: 2px rgb(58, 58, 58)`. Active-tab `border-radius: 0px`, settling the
  `Header.tsx:26` question above.
- **Hover border-color conditional verified via the emitted stylesheet**, not by trying to
  trigger a real `:hover` through automation (unreliable for CSS-in-JS pseudo-classes):
  found two distinct hover rules, one per card style-hash. Ripper (6.0) and Feralia (7.0)
  share one class whose hover rule resolves `border-color: var(--chakra-colors-slab-bg)`;
  Mike Murray (8.0) gets a separate class resolving
  `border-color: var(--chakra-colors-accent-border)`. Both rules keep
  `transform: scale(1.02)` alongside the border-color declaration, confirming the zoom
  behavior survived the merge untouched.
- Album name confirmed rendering at the same color as the band heading.

## Pass 5 — rename

Dan's decision: ship the live rename now rather than wait on the formal naming gates (friend
test, domain check, trademark search) documented in `naming-decisions.md`, to get real
feedback on the live app under its real name. **This supersedes those gates — it does not
mean they were cleared.** None of the three has been done.

### Audit first, same pattern as pass 2's radii audit

Grepped the whole repo (not just `src/`) for "Metal Reviews" and case variants, then
categorized every hit before touching anything:

- **Live user-facing surface** (in scope): `index.html`'s `<title>` — the only meta tag of
  any kind in the file, no `og:title`/description existed to also update; `Header.tsx`'s
  two wordmark spans; an inline comment in `Header.tsx` describing the span-splitting trick
  by citing the exact old text.
- **Build/package metadata — audited, found nothing to change.** The brief assumed
  `package.json`'s `name`/`description` needed updating. They didn't: `name` was already
  `"scraper"`, `description` was `"Scraper application project."` — neither ever named the
  app "Metal Reviews" in the first place. Reported rather than silently skipped, since it
  contradicted an explicit brief item.
- **Test assertions** (in scope): `Header.test.tsx` — test name, `toHaveTextContent` regex,
  and the old-name guard, all updated together.
- **`CLAUDE.md`** (in scope where current-state): had zero prior mentions of "Metal
  Reviews"; added a naming note pointing at pass 5 and the still-superseded gates.
- **`docs/decisions/*.md` historical bodies** (NOT in scope, confirmed untouched):
  `artwork.md`, `header-redesign.md`, `ingest-trigger-and-security.md`,
  `slant-take-design-system.md`'s own pass-3 section (describing the *old* test string),
  and `naming-decisions.md`'s pre-existing "not yet reflected" paragraph — corrected with an
  added note below it, not edited in place, per that file's own append-only convention.
- **`deferred-work.md`'s "still ships as Metal Reviews" bullet** — the one exception: not a
  historical record, an open tracked item this exact pass resolves. Closed out with the
  file's existing `~~strikethrough~~ — DONE` convention (already used for the GitHub Actions
  cron item), not deleted.

**Two categories the brief's framework didn't name, extended by the same "don't falsify
history" logic and flagged rather than silently applied:**
- `artifacts/superpowers/metal_reviews_aggregator/*.md` (4 files) and
  `docs/superpowers/plans/*.md` (5 files) — pre-`docs/decisions/` planning archives, July
  4–20, never touched since, not referenced by `CLAUDE.md`'s living index. Same "records
  what happened at the time" problem as `docs/decisions/*.md`, just outside the folder the
  brief named it for. Left untouched.
- `docs/_specs/project_specification.md` — a July 4 snapshot so stale it still describes a
  "teal → blue" gradient header, predating even the pre-Slant-Take purple gradient. Left
  untouched for the same reason.
- **`scripts/musicbrainz.ts`'s `MB_USER_AGENT` string** (`'MetalReviewsDashboard/1.0 (...)'`)
  — didn't fit any of the brief's five categories: live code, but not user-facing (an
  outbound API identifier MusicBrainz's etiquette policy requires, never seen by an app
  user). Flagged for a decision rather than assumed either way. Dan chose to update it for
  consistency (now `SlantTake/1.0`); no test covers the literal string.

### Infra/domain references — listed, not acted on

`.github/workflows/ingest.yml` still targets `https://metalreviews.onrender.com/api/ingest`;
the same hostname appears in two historical decision-doc entries (left untouched) and one
completed `deferred-work.md` bullet (left untouched). No GitHub repo name appears in-repo
beyond that hostname. None of this was changed — domain/repo/Render-service renames are
account-level actions outside what a code change can safely do, and a GitHub repo rename
specifically risks breaking Render's existing deploy hook.

### Favicon — reported, not built

`public/favicon.svg` is a custom bar-chart icon in old teal (`#81e6d9`) — not Vite's
default, but predating every design-system pass and matching none of it (not the ember
accent, not the concentric-rings mark `naming-decisions.md` locks in). Needs real artwork
built around the rings mark; that's a design-asset task, not a text rename. Tracked in
`deferred-work.md`, not done here.

### Verification

- `tsc --noEmit` clean; `npx vitest run` **167/167**, unchanged in count — the `Header.test`
  update replaced an assertion rather than adding one.
- Visual check: header renders "Slant" (`text.primary`) / "Take" (`accent.border`) in the
  same flat two-tone structure as pass 3 (two spans, no gradient) — the pass-3 test asserting
  exactly that structure still passes unmodified, confirming the rename didn't regress it.
  Browser tab title confirmed reading "Slant Take".
- Repo-wide grep re-run after editing: no live user-facing surface still shows "Metal
  Reviews" — every remaining hit is inside a historical decision-doc body, a superpowers/spec
  archive, or an infra hostname, all deliberately untouched per the categorization above.
- Confirmed no `docs/decisions/*.md` historical body was altered — the one edit inside a
  decision doc (`naming-decisions.md`) was a new dated entry plus an additive correction
  note, not a rewrite of existing prose.

## Pass 6 — loading indicator

> **Superseded, 2026-07-25 (pass 7):** the marching-text component and its "leave button-level
> states on Chakra's default spinner" decision, both described below, were replaced by a
> single equalizer-bar component used at both section and button scale. This section is left
> exactly as originally written — a historical record of what shipped and why at the time —
> per this file's append-only convention. See pass 7 below for the current implementation.

New design work, not a fix-to-match-mockup — no mockup ever covered a loading state.
Direction (`LOADING...`, mono, animated dots, zero circular elements) came out of the
design-discovery chat, consistent with the rest of the system's stance (the heart-toggle
button was squared off in pass 2 for the same reason; radii are zero everywhere).

### Audit, before any edit — every loading indicator, categorized by size context

**Section-level (large, centered, ample room) — converted:**
- `App.tsx` — reviews grid initial load
- `FavoritesPage.tsx` — favorites list load (already had `role="status"`)
- `AuthCallback.tsx` — full-page "Signing you in…"

**Button/icon-button-level (small, width-constrained) — flagged, not converted:**
`FavoritesPage.tsx`'s remove-favorite `IconButton` (icon-only, no room for text at all),
`FavoritesPage.tsx`'s "Look up" and "Confirm" buttons (compact width), and both `LoginPage.tsx`
and `AuthCallback.tsx`'s full-width submit buttons (height-constrained even though wide
enough). All five use Chakra's `Button`/`IconButton` built-in `loading` prop, which renders
its own small ring sized to the button. "LOADING..." doesn't fit any of them without either
overflowing or forcing an oddly tall button — exactly the "don't force-fit" case the brief
called out. Left on Chakra's default compact spinner. Judgment call, not unilaterally
decided: a button-scale ring reads as a standard, expected micro-interaction symbol rather
than the kind of decorative circular chrome the "zero circular elements" principle was
reacting to (a large, obviously-round heart button) — but building a compact non-circular
button variant is a separate design decision beyond this brief, not built here.

**Dead code — found, left alone:** `components/ui/toaster.tsx` has a `toast.type ===
"loading"` branch rendering a `Spinner`, but `useFeedbackToast.tsx` only ever creates
`success`/`error`/`info` toasts — unreachable in the live app. Converting unreachable code
has no verifiable effect, so it wasn't touched.

### What shipped

`src/LoadingIndicator.tsx` — a new shared component (top-level `src/`, matching the
project's convention of flat cross-page components like `Header.tsx`, not nested under
`components/ui/`, which is reserved for Chakra CLI snippets):
- `LOADING` (uppercase) + three `.` characters, not circular bullet glyphs — literal
  typographic dots, chosen specifically because a round dot glyph would have reintroduced
  the exact circular-chrome problem this whole direction exists to avoid.
- `fontFamily="mono"`, `letterSpacing="0.08em"` — matching the review counter's existing
  mono-metadata treatment, not a new value.
- Each dot: `@keyframes` opacity pulse, `animation-delay` staggered `0.2s` apart, infinite.
- `_motionReduce={{ animation: 'none', opacity: 1 }}` per dot — Chakra's style-prop
  condition, compiles to a real `@media (prefers-reduced-motion: reduce)` rule.
- Outer container: `role="status"` + `aria-live="polite"`. The dots sit in a separate
  `aria-hidden="true"` wrapper — only the word "LOADING" is meaningful to a screen reader,
  per the brief's explicit note.

Applied at the three confirmed section-level sites, replacing the `Spinner` import (and
its `size`/`color`/`thickness`/`speed` props) entirely in `App.tsx` and `AuthCallback.tsx`.
`FavoritesPage.tsx` keeps its `Spinner` import — still needed for the five button-level
`loading` props that weren't converted. `AuthCallback.tsx`'s "Signing you in…" text line was
kept alongside the indicator rather than removed: it's more specific/useful context than the
generic label, and nothing in the brief asked for it to go.

### Verification

- `tsc --noEmit` clean; `npx vitest run` **167/167**, unchanged — no test asserted anything
  about the old Spinner's visual props, and `FavoritesPage.test.tsx`'s existing
  `getByRole('status')` check keeps passing against the new component's own `role="status"`.
- **Visual, forced into view rather than caught by chance:** the reviews-grid fetch resolves
  fast enough locally that the loading state doesn't linger on a normal page load. Verified by
  monkey-patching `window.fetch` in-browser to add an artificial delay, then triggering a
  remount via client-side navigation away and back (so the patched `fetch` — which a full
  page reload would have discarded — was still in effect). Caught and screenshotted
  "LOADING..." rendering with the dots visible mid-pulse.
- **Computed-style confirmation while the delayed state was up:** `role="status"`,
  `aria-live="polite"`, `font-family: "JetBrains Mono", monospace`, `color: rgb(202, 198,
  187)` (`text.primary`), `letter-spacing: 1.12px` (exactly `0.08em` at the rendered
  font-size), `text-transform: uppercase`, dots wrapper `aria-hidden="true"`, and all three
  dots confirmed with `animation-name: slant-take-marching-dot`, `animation-delay` at
  `0s`/`0.2s`/`0.4s`, `iteration-count: infinite`.
- **`prefers-reduced-motion` — verified as the actual CSS the browser will apply, not just
  confirmed present.** Read the parsed CSSOM directly: found one `@media
  (prefers-reduced-motion: reduce)` rule per dot's generated class, each resolving to
  `animation: ... none ...` plus `opacity: 1` — i.e. animation fully disabled, dots pinned
  static at full opacity. Being precise about what this does and doesn't prove: it confirms
  the exact declarations the browser will apply under that media state, which is stronger
  than "the query exists in the source" — but it is not the same as toggling the OS-level
  reduced-motion setting and screenshotting a live before/after. No tooling available in this
  session exposes that emulation (no CDP media-feature override, and jsdom doesn't evaluate
  real CSS media queries), so that specific form of proof wasn't possible here.
- **FavoritesPage's instance of the component was not visually reachable.** `RequireAuth`
  redirects logged-out users to `/login` before `FavoritesPage` ever mounts, and creating or
  entering credentials to get past that is out of bounds. Coverage for that site rests on
  two things instead: it's the identical `<LoadingIndicator />` already visually confirmed
  at the App.tsx site with no per-site customization, and `FavoritesPage.test.tsx`'s
  `role="status"` assertion still passes in jsdom.
- Repo-wide grep after editing: no `<Spinner` JSX remains in any non-test file except the
  confirmed-dead `toaster.tsx` branch.

## Pass 7 — unified loading indicator (equalizer bars)

> **Follow-up, 2026-07-25 (small, standalone — not a numbered pass):** two tweaks to the
> equalizer shipped below, without reopening this section. (1) Bar thickness (the `%` width
> values only, in every keyframe step) changed **20% → 16%**; the height values that drive
> the wave motion are untouched. (2) Button-scale colour is no longer hardcoded — confirmed
> via `button.js`'s recipe that every Button variant sets a real, inherited CSS `color` on
> the `<button>` element (`colorPalette.contrast` for solid, `colorPalette.fg` for the rest),
> so `LoadingIndicatorBars` now omits its own `color` prop entirely and lets `currentColor`
> pick up whatever that specific button is actually rendering its label in, rather than
> assuming one universal token. Section scale (`LoadingIndicator`, no button ancestor) is
> unaffected — still passes `color="text.primary"` explicitly, as it must. Verified live:
> the primary/ember "Log in" button's bars matched its label's `accent.ink` exactly
> (`rgb(20, 10, 3)` both), and 16% width was confirmed via computed `background-size` at
> both scales. The ghost-variant remove-favorite `IconButton` (`text.muted`) was not
> independently reachable live — same auth-gating limitation as passes 6 and 7 — but the fix
> is generic CSS inheritance with no per-variant branching, so the one live confirmation plus
> the recipe-source read is the evidence this rests on for that case.

Not a bug fix — a direction change. Pass 6 shipped marching text at section scale and
deliberately left five button-level `loading` states on Chakra's default ring, since text
didn't fit them (see pass 6 above, kept as-written). Decision now: one visual language
everywhere, sized per context, rather than two different loading treatments depending on
where you look.

### Audit, before any edit — re-verified pass 6's report against the live code, not assumed

- `LoadingIndicator` unchanged since pass 6: same marching-text implementation, same three
  call sites (`App.tsx`, `FavoritesPage.tsx`, `AuthCallback.tsx`), `AuthCallback.tsx` still
  pairing it with the "Signing you in…" text line.
- All five button-level `loading` states confirmed still present exactly as pass 6 described:
  the remove-favorite `IconButton`, "Look up", "Confirm", and both auth-form submit buttons.
- Keyframe-animation convention confirmed: exactly one pattern exists anywhere in the
  codebase — an inline `@keyframes` object nested in Chakra's `css` prop (what pass 6's
  marching dots used, and the only other animation in the app, `App.tsx`'s artwork-skeleton
  fade, toggles). Emotion's `keyframes()` helper is never imported anywhere despite
  `@emotion/react` being a dependency (transitive via Chakra). Followed the established
  inline pattern rather than introducing `keyframes()`.
- One assumption in the brief that didn't hold: "pass 6's tests asserted marching-text-
  specific things (dot count, staggered animation names)" — **no such test existed.** Pass 6
  never added a dedicated test file for `LoadingIndicator`; the only indirect coverage was
  `FavoritesPage.test.tsx`'s `getByRole('status')`. Reported rather than silently working
  around it — there was nothing to literally "update," so a new test file was written
  instead (see Tests below).

### What shipped

`src/LoadingIndicator.tsx` rewritten in place — the marching-text implementation and its
dot-animation logic (`DOT_COUNT`, `STAGGER_S`, the per-dot `@keyframes`) removed entirely,
no dead code left behind. New exports:

- **`LoadingIndicator()`** — section scale. A `role="status"`/`aria-live="polite"` region
  containing the equalizer bars (`aria-hidden="true"`, purely decorative) plus a
  visually-hidden text node reading "Loading" — the accessible content, since (unlike pass
  6's literal word) an icon has nothing for a screen reader to read on its own. Used at the
  same three section-level sites, no call-site changes needed beyond the import.
- **`LoadingIndicatorBars()`** — button scale. Passed as the `spinner` override to Chakra's
  `Button`/`IconButton` `loading` prop. Purely decorative on its own; each call site adds
  `aria-label={loading ? 'Loading' : undefined}` on the *Button itself*, applied at all five
  confirmed button-level sites (`FavoritesPage.tsx` remove-favorite/Look-up/Confirm,
  `LoginPage.tsx`, `AuthCallback.tsx`'s Update-password).
- **`EqualizerBars`** (internal) — the actual bars, one element, three-layer `background`
  (`linear-gradient(currentColor 0 0)` × 3, positioned at 0%/50%/100%), each layer's height
  independently driven by `background-size` across the six-step `eqbars` keyframe wave.
  `color="text.primary"` feeds `currentColor` — nothing hardcodes a colour, matching the
  brief's explicit requirement.

**The `@keyframes slant-take-eqbars` rule lives in `theme.ts`'s `globalCss`, not inline in
the component** — see the bug below for why.

### A real bug, caught by verification rather than shipped

First implementation nested the `@keyframes` object inside the same `css` prop object as
the `_motionReduce` override, exactly matching pass 6 dots' pattern. Live-testing it crashed
the entire app on mount: `TypeError: Cannot create property '@keyframes slant-take-eqbars'
on string '20% 50%, 20% 50%, 20% 50%'`, thrown deep in Chakra's prop-merge internals
(`mergeByPath`). Root cause: combining an `@keyframes` at-rule declaration with a
`_motionReduce` condition in the same `css` object confuses Chakra's style-prop merge in a
way three-layer-`background`'s repeated `backgroundSize` key apparently triggers (pass 6's
simpler per-dot `opacity` keyframe didn't hit this). Fixed by moving `@keyframes
slant-take-eqbars` to `theme.ts`'s `globalCss` (the same location the project already uses
for its other global rules) and referencing it by name from the component — the component's
`css` prop no longer contains an `@keyframes` key at all, and the crash doesn't reproduce.
Caught before this ever reached a "ship it" state, entirely because the brief's verification
step was followed rather than skipped after a clean `tsc`.

### Section scale — 48×64px, as specified

Not negotiable per the brief; applied as given. Matches the reference's exact 0.75 aspect
ratio, both dimensions on the 4px grid.

### Button scale — 16×16px, verified live, not picked and assumed

Checked against the widest real button (`LoginPage`'s 320×40 "Log in") via
`getBoundingClientRect()` before and after triggering `loading`: box stays exactly 320×40 in
both states, bars render clearly, not crowded. The tightest real context — the
remove-favorite `IconButton` at `size="sm"` — turned out to be **36×36px** per Chakra's own
button recipe (`h`/`minW: "9"` = 2.25rem), not the ~32px eyeballed during the pass-6/7 audit;
16×16 (under half that box) has clear margin there without needing to test it directly.

The reference's exact 3:4 ratio has no 4px-grid pair that both reads as three distinct bars
and fits comfortably at button scale: 12×16 is too small to register as separate bars,
24×32 leaves little margin even in the 36px IconButton. 16×16 (square, not 3:4) is the
deliberate deviation, in the sizing latitude the brief explicitly left open for button scale.

### Accessibility — verified via the actual accessibility tree, not assumed

- **Section scale:** `read_page`'s accessibility-tree dump (not just computed CSS) showed
  `status` → `generic "Loading"` — the bars produce no separate node, confirming
  `aria-hidden` is doing its job and "Loading" is the only accessible content.
- **Button scale:** confirmed empirically, not just reasoned about — Chakra's `Loader`
  (which the `loading` prop delegates to) wraps the original button children in a
  `visibility: hidden` span when a custom `spinner` is supplied. `visibility: hidden`
  content is excluded from accessible-name computation, so without an explicit
  `aria-label` the button's name would genuinely vanish while loading — checked before
  writing the aria-label props at each call site, not assumed from the brief's framing.
  Live-tested a real submit: `aria-label` reads `null` in the resting state (falls back to
  the visible "Log in" text correctly) and `"Loading"` once `loading` fires.
- **Width-lock:** because `Loader` keeps the original children laid out (hidden, not
  removed) while the custom spinner is absolutely-centered over them, the button's box
  naturally can't shrink to fit the much-narrower bars. Verified this holds, not assumed:
  same before/after `getBoundingClientRect()` check above showed 320×40 unchanged.

### `prefers-reduced-motion` — verified at both scales independently

Read the parsed CSSOM directly (same technique as pass 6) at **both** scales, since section
and button scale generate distinct CSS classes (different `w`/`h` values): both resolved to
`animation: ... none ...` plus `background-size: 20% 50%, 20% 50%, 20% 50%` — the static,
even-height frame, not a frozen mid-animation state. Same honest caveat as pass 6: this
confirms the exact declarations the browser will apply under that media state, which is
stronger than "the query exists in source," but isn't a live OS-toggle screenshot — no
tooling in this session exposes that emulation.

### Tests

No existing test asserted marching-text internals to "update" (see audit above). Wrote
`src/__tests__/LoadingIndicator.test.tsx` instead — 4 new tests covering what jsdom
*can* reliably verify (structure and accessibility: `role="status"`/`aria-live`/hidden-text
content at section scale; no stray role at button scale; a real `Button` swapping its
accessible name between visible-text and `aria-label="Loading"` across a loading-state
rerender). `prefers-reduced-motion` is deliberately not asserted here — jsdom doesn't
evaluate real CSS media queries, so that verification lives in the browser-based check
above, not in the test suite. `FavoritesPage.test.tsx`'s pre-existing `role="status"` check
required no changes — the new component keeps the same role.

### Verification

- `tsc --noEmit` clean; `npx vitest run` **171/171** (167 + 4 new).
- Section scale confirmed live via the same fetch-delay-and-remount technique as pass 6, at
  the reviews grid: 48×64 bars, `role="status"`, hidden "Loading" text, all six keyframe
  steps' `background-size` values present in the animation, `animation-name:
  slant-take-eqbars`.
- Button scale confirmed live on a real form submission (`LoginPage`): `aria-label` correct
  in both states, 16×16 bars, zero layout shift, `prefers-reduced-motion` rule present on
  that scale's own CSS class.
- Old marching-text implementation and its dot logic fully removed — `grep` for
  `marching`/`DOT_COUNT`/`STAGGER_S` returns only this doc's own prose and one explanatory
  code comment, no executable leftovers.
- No `<Spinner` JSX remains anywhere except the pass-6-confirmed-dead `toaster.tsx` branch,
  unchanged.

### Not done

FavoritesPage's section-scale instance still not visually reachable in this session, same
reason as pass 6 (`RequireAuth` redirects logged-out users before it mounts; not creating
credentials to get past that). Same mitigating coverage as pass 6: identical component
already confirmed elsewhere, plus the existing `role="status"` test.

---

## Pass 8 — footer

Closes out `deferred-work.md`'s "Card footer / ingest-timestamp line never built" item and
the older parked "last ingest date timestamp element" Portable IA idea — same feature.

### Audit before building

- **No footer existed anywhere.** The only `Footer` hits in the codebase were Chakra's
  `DrawerFooter`/`DialogFooter`/`PopoverFooter` sub-components (`FavoritesPage.tsx`'s drawer
  and dialog) — unrelated modal chrome, not a page footer.
- **No "last ingest run" timestamp is persisted anywhere.** The old `GET /api/ingest/status`
  endpoint in `server.ts` only ever exposed an in-memory `running`/`idle` flag with no
  completion timestamp, and it — along with the refresh button and its polling — was removed
  when ingest moved to GitHub Actions cron (`docs/decisions/ingest-trigger-and-security.md`
  Section 7). No `last_ingest`-style table exists in `supabase/`, and GitHub Actions' own run
  history isn't reachable from the frontend without new plumbing. Per the brief, this was
  reported rather than built against a fake value.
- **Chosen data source instead:** the max `publishedAt` across the already-loaded
  `AlbumCard[]` (`src/dbMapping.ts`'s `fromAlbumWithReviews`), computed client-side in
  `App.tsx` from data it already fetches for the reviews grid — no new query, no new
  backend work. This is "newest content on screen," not "when ingest last ran" — ingest is
  idempotent (a completed run can add zero new rows, confirmed live in the ingest-trigger
  doc), so the two aren't the same thing. Labeled "Last updated" rather than "Last ingest" to
  keep the copy honest about what it measures. Dan's call in the brief: relative time, not
  absolute UTC, to sidestep the timezone question entirely.
- **Nav-link pattern confirmed from `Header.tsx`:** `<Link as={RouterLink} to="...">` from
  `react-router-dom`, reused verbatim in the footer minus `navPillBase`'s bordered-pill
  styling (brief only asked for the same underlying link behavior, not the visual treatment).

### What was built

- `src/Footer.tsx`: semantic `<Flex as="footer">`, mockup's exact spec (`border-top: 2px
  solid border.ruleStrong`, `font-mono`, `10.5px`, `0.08em` letter-spacing, uppercase,
  `text.muted`) — no new tokens, all pulled from existing `theme.ts` values.
  - Left: `formatRelativeTime()`, a small local function (`just now` / `N minutes/hours/days
    ago`) — no new dependency. Recomputed every 60s via `setInterval` in a `useState`-backed
    `now` value, so the text doesn't freeze at mount-time and go stale while the page sits
    open.
  - Right: `Reviews` (`/`) / `Favorites` (`/favorites`) links using the header's `RouterLink`
    pattern, plus `© {new Date().getFullYear()} Slant Take` — the year computed at render,
    not hardcoded, replacing the mockup's placeholder source-count text per the brief.
- Wired into both `App.tsx` (reviews page, with `lastUpdated` computed from the `reviews`
  state array already in memory) and `FavoritesPage.tsx` (for nav consistency with the
  duplicated-per-page `<Header />` pattern already in use there) — **without** `lastUpdated`
  on the favorites page, since that page never loads the site-wide album list the timestamp
  needs, and fetching it there would be new scope beyond what the brief asked for.

### Verification

- `tsc --noEmit` clean; `npx vitest run` **171/171** (no new tests added — no new
  branching logic beyond what a live check already covers; existing suite continues to pass
  with the footer mounted on both pages).
- Live-verified in the browser pane against real Supabase data: `document.querySelector('footer').innerText` →
  `"LAST UPDATED, 16 HOURS AGO\n\nREVIEWS\nFAVORITES\n\n© 2026 SLANT TAKE"`. Computed styles
  matched the spec exactly: `border-top: 2px solid rgb(58, 58, 58)` (`border.ruleStrong`),
  `font-family: "JetBrains Mono", monospace`, `font-size: 10.5px`, `letter-spacing: 0.84px`
  (0.08em at that size), `text-transform: uppercase`, `display: flex`,
  `justify-content: space-between`. Screenshot confirmed the footer sitting correctly below
  the last review card, full-width rule above it.
- Clicked the footer's `Favorites` link (via its accessibility-tree ref, not just visual
  coordinates) and confirmed real navigation: `location.pathname` went from `/` to `/login`
  — the expected `RequireAuth` redirect for a logged-out session, proving the link uses real
  client-side routing rather than a static href.

### Not done / out of scope

- Absolute-UTC toggle, or any way to view the exact ingest/update timestamp — relative-only
  per Dan's explicit call in the brief.
- Favorites page's own last-updated timestamp (e.g. "last favorited N days ago") — not asked
  for; the brief's footer spec was site-wide freshness, not a per-page metric.
- Header/nav — untouched, footer only reuses `Header.tsx`'s link mechanism.

**This closed the eighth pass. Pass 9 (consistency + hover redesign) follows below — see
`CLAUDE.md`'s branch summary for current merge-readiness status.**

---

## Pass 9 — consistency + hover redesign

**Brief:** four related fixes — form-element border consistency app-wide, no decimal font
sizes anywhere, style guide brought up to date with everything shipped in passes 1–8, and
card hover redesigned from whole-card zoom to artwork-only zoom (extended to favorites).

### Audit findings (reported before any edits, per the brief)

1. **Form-element borders.** Pass 4 applied `border: 2px solid border.ruleStrong` to the
   home page's controls bar only. Still on the pre-redesign `border.default` (1px,
   `gray.600`, unchanged since before this design system existed): all 3 `Input`s in
   `LoginPage.tsx`, both password `Input`s in `AuthCallback.tsx`, the band/album/manual-date
   `Input`s and the year `NativeSelect.Field` in `FavoritesPage.tsx`. Buttons carry no custom
   border props anywhere (recipe-driven, already zero-radius) so needed no change. Decorative
   container borders — the `AddAlbumDrawer` preview box, `DialogContent`, `Menu.Content`,
   `StyleGuide`'s own swatch borders, `DrawerFooter`'s divider — were left on `border.default`
   deliberately: they aren't form controls, so pass 4's "controls bar" precedent doesn't reach
   them.
2. **Decimal font sizes.** Exactly two in app code: `App.tsx`'s single-review date line
   (`10.5px`) and `Header.tsx`'s user-menu button label (`12.5px`). The `rich-text-editor.tsx`/
   `prose.tsx` decimals (Chakra snippet boilerplate, confirmed unreferenced by any imported
   component) were out of scope. Neither rounds onto an existing sibling size that's meant to
   stay visually distinct, so no collision to flag.
3. **Style guide gap.** Missing entirely: the loading indicator (both scales), form-element
   specimens, the band/album card typography treatment, a radii demo, and the footer/header
   components. The "Badge" swatch group under Colors displayed `badge.source/score/genre.*`
   semantic tokens that no component actually reads anymore — cards use `sourceBadge`/
   `scoreSlabBase`/`scoreSlabHigh`/`genreBadge` from `theme.ts`, already documented correctly
   in "Badges — Contextual". Every swatch description across Surface/Text/Accent was also
   stale pass-1 text (`"gray.900"`, `"purple.300"`, `"white"`) instead of the real ramp tokens
   (`ink`/`sand`/`ember`) introduced in pass 1.
4. **Card hover.** Reviews grid: whole card scaled via `cardStyle._hover: { transform:
   'scale(1.01)' }`; the score-linked border-color hover was already a separate, easily
   preserved concern. Favorites: `FavoriteListItemRow` had no hover treatment at all and a
   plain 1px `border.default`. It does have a comparable 64×64 artwork thumbnail — but
   `useFavoritesList.ts` confirms favorites items carry **no score data by design** ("this
   view shows no score/source/summary"), so the score-linked border-color mechanism has
   nothing to link to there.

### What was built

- **Form elements:** `border: '2px solid', borderColor: 'border.ruleStrong'` applied to
  every actual form control found in the audit — `LoginPage.tsx`, `AuthCallback.tsx`, and
  `FavoritesPage.tsx`'s `AddAlbumDrawer` inputs/select. Home page controls (already correct
  since pass 4) untouched.
- **Decimal font sizes:** `10.5px → 11px` (`App.tsx`), `12.5px → 13px` (`Header.tsx`, exact
  tie, rounds up) — the same precedent already applied to the footer's own mono text in
  pass 8.
- **Style guide** (`StyleGuide.tsx`): removed the dead "Badge" swatch group; rewrote every
  Surface/Text/Accent/Border swatch description to the real token (`ink.950`, `sand.200`,
  `ember.300`, etc.); relabeled "Buttons — Primary (purple)" → "(ember)"; added new sections
  for **Radii** (all 7 radius keys shown against a mid-tone swatch so the zero-rounding is
  visible), **Form Elements** (Input + NativeSelect at the new 2px treatment), **Loading
  Indicator** (both the section scale and the button scale via a real loading `Button`), a
  **Band/Album Typography** specimen matching the card body exactly (`fontFamily="body"`,
  19px/700 uppercase band, 18px/500 album), and full **Header**/**Footer** component
  mounts (both already router-connected since `/style-guide` is a real route).
- **Card hover redesign** (`App.tsx`): `cardStyle` no longer scales the card itself — its
  `_hover` now only ever sets `borderColor` (the pre-existing score-linked mechanism,
  untouched). The zoom moved to `ArtworkBlock`'s `<Image>` via `css: { '&:hover img': {
  transform: 'scale(1.06)' } }` on the card, `transition: 'transform 0.3s'` on the image
  itself, and `overflow="hidden"` added to `ArtworkBlock`'s own square container — clipping
  the zoom to the artwork itself rather than relying solely on the card's outer clip, which
  would have let the scaled image bleed into the text area below before hitting the card's
  edge.
- **Favorites hover** (`FavoritesPage.tsx`'s `FavoriteListItemRow`): border brought to the
  same `2px solid border.ruleStrong` language, artwork thumbnail zooms on hover via the same
  `css`/`transition` mechanism as the reviews-grid card. The hover border-color is a **plain
  `border.hover`**, not score-conditional — per the audit finding above, there's no score on
  this view to link it to. This is a deliberate divergence, not an oversight.

### Verification

- `tsc --noEmit` clean; `npx vitest run` — **171/171** passed (no test previously asserted
  on any of the changed values — decimal font sizes, `border.default`, or `cardStyle._hover`
  — so none needed updating).
- Live-verified in the browser pane: `/style-guide` renders all new sections (Radii, Form
  Elements, Loading Indicator, Header, Footer) with the corrected swatch descriptions;
  `/login` and the home page controls now show matching 2px borders; the compiled
  stylesheet was inspected directly (`document.styleSheets`) and confirmed the rule
  `.css-*:hover img { transform: scale(1.06); }` is emitted for both the reviews-grid card
  and the favorites row; `getComputedStyle` confirmed `overflow: hidden` on `ArtworkBlock`'s
  square and `transition: transform 0.3s` on its `<Image>`. (The browser tool's synthetic
  mouse hover didn't persist for a follow-up JS query of `:hover` state — a tool limitation,
  not a code issue — so the hover *rule* was verified directly in the stylesheet instead of
  via a live `:hover` snapshot.)

### Not done / flagged rather than forced

- Favorites' hover border-color is intentionally non-score-conditional — see above.
- Decorative (non-form) borders left on `border.default` — Dialog/Drawer/Menu content,
  the `AddAlbumDrawer` preview box, `StyleGuide`'s own swatch frames — since the brief's
  form-element scope doesn't reach them.

**This closes the ninth pass. Branch `design-system-slant-take` has no further planned
passes — see `CLAUDE.md`'s branch summary for merge-readiness status.**
