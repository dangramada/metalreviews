# Plan — Chakra UI v2 → v3 migration

> **Instruction for Claude Code: the Chakra v2→v3 migration itself is COMPLETE (Steps 0–7, full test suite green, 210/210). This plan file's job is done — keep it as a historical record, but do not add new steps to it. The DatePicker feature, originally (incorrectly) framed as "Step 8" of this migration, was never split into its own standalone brief — implementation detail lives in `docs/decisions/favorites-view.md` (AddAlbumDrawer section), not here. One minor cosmetic item remains open from the migration itself (Menu whiteAlpha-flash visual detail, not blocking — see Step 5 below). The foundation audit (`docs/decisions/chakra-v3-foundation-audit-brief.md`) is now eligible to start, at Dan's discretion — do not start it automatically.**

> Planning document only. No code written yet. This sequences the migration into discrete, one-feature-per-session steps per the project's working convention. Each step below should become its own Claude Code session, with its own decision-doc update afterward (either appended here as a dated section, or split into `docs/decisions/chakra-v3-<step>.md` if a step turns out to be large enough to warrant its own file — follow the same judgment call already used for `favorites.md` vs `favorites-view.md`).
>
> **Revised after reading the official migration guide** (chakra-ui.com/docs/get-started/migration). Several things changed from the first draft of this plan — most notably: there's an official codemod, `AlertDialog` is removed (not renamed), and the toast system is a structural change (hook → root-rendered component), not a drop-in API swap. Real-world migration writeups (linked at the bottom) describe this as closer to "essentially a rewrite" than the official guide's checklist tone suggests — budget accordingly and don't assume a step is done just because it compiles.

## Tooling available (use before any manual work)

1. **Codemod** — `npx @chakra-ui/codemod upgrade` (add `--dry` to preview without writing). Handles component renames, prop changes, import updates, and compound-component restructuring automatically. Requires Node 20.x minimum — confirm the dev environment meets this before running.
2. **CLI snippets** — `npx @chakra-ui/cli snippet add --outdir <path>`. Generates pre-built composition files for things v3 no longer ships as a plain importable component: a `Provider` wrapper (combines `ChakraProvider` + color-mode), a `Tooltip` wrapper, a toaster setup (`createToaster` + `<Toaster>`), etc. Run this before touching `main.tsx` — the new `ChakraProvider` usage pattern depends on a snippet-generated `Provider` file existing.
3. **Eject command** — `npx @chakra-ui/cli eject` exports all default v3 theme tokens/recipes into a directory, useful as a reference/starting point for Step 1 rather than hand-writing the new theme shape from scratch.

Run the codemod first, on a dedicated branch, with `--dry` to see the diff before committing to it. Treat its output as a first draft — the official guide and third-party writeups both note it doesn't catch everything (especially structural/behavioral changes like `AlertDialog` removal or the toast system), so a manual pass per step below is still required.

## Why this is its own initiative, not a feature

Chakra v3 is a full rewrite (Ark UI primitives + a new styling engine), not a version bump. It was triggered by wanting `DatePicker.Root` (a v3-only compound component) for the manual release-date entry field in `AddAlbumDrawer`. That feature is explicitly **paused** until this migration reaches the relevant step — see Step 6.

## Step 0 findings (completed) — what's confirmed vs. inferred

Step 0 ran on branch `chakra-v3-migration`. Node 22.14.0 confirmed (≥20.x). Current install: `@chakra-ui/react ^2.8.2` + `@chakra-ui/icons ^2.2.4`.

**Important caveat on confidence level:** the interactive `--dry` prompt couldn't be piped non-interactively, so these findings come from reading the codemod's transform source directly rather than an executed diff against this repo's actual files. That's solid evidence (it's the real logic that would run), but it's a different confidence tier than "ran it and saw the output" — treat the items below as *expected* transforms to verify when Step 1 actually runs the codemod for real, not as already-proven facts.

**Confirmed via source analysis:**
- The codemod **does** handle the `extendTheme` → `createSystem` transform comprehensively: wraps leaf token values in `{ value: ... }`, renames `semanticTokens`' `default` condition key → `base`, moves `styles.global` → top-level `globalCss`, renames the exported `theme` → `system`.
- The codemod **does** handle `AlertDialog` → `Dialog` + `role="alertdialog"`, including the full sub-component tree (`AlertDialogContent` → `Dialog.Positioner`+`Dialog.Content`, etc.). **This revises the original plan's framing** — `AlertDialog` removal is real (per the official docs), but the codemod's restructuring transform covers most of the mechanical rename, narrowing the manual work to specific items not in its prop map: confirmed gap is `leastDestructiveRef` → `initialFocusEl`, which needs a manual fix regardless.
- `HamburgerIcon` is confirmed to import from `@chakra-ui/icons` in `Header.tsx` — codemod maps it to `LuMenu` from `react-icons/lu`. Resolves the open question that was previously flagged.
- `CheckIcon`, `RepeatIcon`, `WarningIcon` (from `@chakra-ui/icons`, used in `App.tsx`) map to `LuCheck`, `LuRepeat`, `LuAlertTriangle`.
- Color mode: confirmed no `useColorModeValue` calls anywhere in source — app is dark-theme-only. Step 2's color-mode plumbing can be minimal.
- `useFeedbackToast.tsx`: codemod strips the `useToast` import and leaves a migration-note comment, but does **not** attempt a rebuild — confirms Step 6 is manual work, as planned.
- Test files (`ChakraProvider` imports) are untouched by any component-level transform — confirms Step 7 needs a manual provider-swap pass across tests, as planned.
- 61 total snippet files available via `npx @chakra-ui/cli snippet add --all --outdir src/components/ui`; unused ones are harmless to generate alongside the ones actually needed (`provider`, `toaster`, `color-mode`, `dialog`, `drawer`, `menu`, `field`, `switch`, `tag`, `skeleton`, `native-select`, `tooltip`, `input-group`, `alert`, `close-button`).

**Still genuinely open, not resolved by source analysis:**
- Whether the `AlertDialog`→`Dialog` transform, when actually run against `FavoritesPage.tsx`'s specific discard-confirm usage, produces JSX that compiles and behaves correctly — confirm with the real diff once Step 1 runs the codemod for real, don't assume a clean pass from the source-level mapping alone.
- The custom `radii` raw-CSS-string gotcha under the new wrapped-value shape — flagged for a visual check, not yet verified.
- The `_active`/`aria-expanded` Menu CSS override hack — codemod doesn't touch CSS override patterns, confirmed still needs manual re-verification in Step 5.

## Current v2 surface area (what has to move)

Confirmed from existing decision docs, cross-checked against the official v3 migration guide:

| Pattern | Where documented | v3 reality (confirmed, not guessed) |
|---|---|---|
| `extendTheme` + custom `theme.ts` with `surface.*`/`border.*`/`text.*`/`accent.*`/`brand.*` semantic tokens | `design-tokens.md` | **Confirmed structural change.** `extendTheme({...})` → `createSystem(defaultConfig, { theme: { tokens: {...} } })`. Every token value must be wrapped: `fonts: { heading: 'X' }` becomes `fonts: { heading: { value: 'X' } } }`. Token *names* (`surface.card`, `accent.border`, etc.) can be preserved if defined under `tokens`/`semanticTokens` with matching keys — call sites elsewhere in the app don't need to change. |
| Custom `radii` gotcha (raw CSS strings only, no key-referencing) | `design-tokens.md` | Not explicitly covered in the official guide — re-verify directly once Step 1 starts; don't assume v3's recipe system has the same gotcha or that it's resolved. |
| `sx={{ '& option': { background: '#1a202c' } }}` hack on native `<select>` styling | `design-tokens.md`, `controls-bar.md`, `refresh-button.md` | **`Select` → `NativeSelect`, restructured but still native-`<select>`-based** (`NativeSelect.Root` wraps `NativeSelect.Field` + `NativeSelect.Indicator`). This is a rename/restructure, not a removal of the native element — the dark-`<option>` styling hack may still be needed. Also: v3's nested-style syntax changes generally (`sx` → `css`, requires `&` prefix on selectors) — the hack's *syntax* needs updating regardless: `sx={{ '& option': {...} }}` → `css={{ '& option': {...} }}` (note v3 already requires the `&` prefix that v2's hack happened to also use, so this particular hack's selector syntax may carry over almost unchanged — confirm directly). |
| `useToast` via `useFeedbackToast` wrapper, sole call site convention | `favorites.md`, `CLAUDE.md` | **Structural change, not a hook swap.** v3 removes `useToast`. Toasts are now created via `createToaster()` (configured once, typically in a generated `components/ui/toaster.tsx` snippet file) plus a `<Toaster>` component rendered once near the app root. `useFeedbackToast`'s *external* API (`showSuccess`/`showError`/`showAction`) can likely be preserved as a thin wrapper around the new toaster instance's methods, but the internal implementation is a rewrite, not a search-and-replace. |
| Two `Menu` instances (desktop account dropdown, mobile hamburger) with `_active` override hacks for the whiteAlpha flash | `header-redesign.md` | **Full compound-component rewrite confirmed.** `Menu` → `Menu.Root` / `Menu.Trigger` (needs `asChild`) / `Menu.Positioner` / `Menu.Content` / `Menu.Item` (needs a `value` prop). Requires explicit `Portal` wrapping now. Internal open-state access changes from a render-prop (`{({isOpen}) => ...}`) to `Menu.Context`. The `_active`/`aria-expanded` CSS override hack needs re-verification — v3 may expose open/active state differently (e.g. data attributes), so the override mechanism itself might change even if the visual goal (suppress the flash) stays the same. |
| `Drawer` (`AddAlbumDrawer`) + `AlertDialog` (discard-confirm), including `leastDestructiveAction` ref pattern | `favorites-view.md` + already-implemented draft-persistence work | **Two different severities of change:** (1) `Drawer` is restructured to compound components (`Drawer.Root`/`Drawer.Backdrop`/`Drawer.Positioner`/`Drawer.Content`) with `isOpen`→`open`, `onClose`→`onOpenChange` (now receives `{ open }`), `closeOnOverlayClick`→`closeOnInteractOutside`, `closeOnEsc`→`closeOnEscape`. (2) **`AlertDialog` is removed as a v2 component** (confirmed by official docs) **but the codemod's restructuring transform covers most of the mechanical port** to `Dialog` + `role="alertdialog"` (per Step 0 source analysis — not yet verified against an executed diff on this repo's actual `AlertDialog` usage). The one confirmed manual gap: `leastDestructiveRef` → `initialFocusEl` isn't in the codemod's prop map and needs a hand fix. Net effect: less manual rebuild risk than originally estimated, but still re-verify the full discard-confirm definition-of-done in Step 5 — don't treat "codemod ran clean" as proof the behavior is intact. |
| `sx={{ '@media (max-width: 47.9375em)': ... }}` breakpoint hack (chosen specifically because it survives jsdom, unlike Chakra's responsive shorthand) | `header-redesign.md` | Not directly addressed in the official guide (it's a styling-engine-level concern, not a component API change). v3's `sx` is replaced by `css` generally — the raw `@media` query syntax inside it should still work the same way once renamed, but the jsdom-testability assumption needs re-verification under v3's actual CSS engine, not carried over on faith. |
| `RequireAuth` test deliberately omits `ChakraProvider` (Chakra v2 injects a `<span id="__chakra_env">` that breaks a "renders null" assertion) | `favorites-view.md` | Not covered by the official guide (internal implementation detail, not a documented API). Re-verify directly in Step 7 — don't assume v3's `ChakraProvider`/`Provider` snippet injects the same marker, or none at all. |
| `AspectRatio`-avoidance pattern (`paddingBottom: 100%` instead of Chakra's built-in component, for absolutely-positioned children) | `artwork.md` | Not mentioned in the removed/changed component list — likely unaffected (plain CSS technique, not a Chakra component), but worth a visual regression check in Step 3 regardless. |
| `Switch`, `FormControl`/`FormLabel` (controls bar, AddAlbumDrawer form) | `favorites.md`, `manual-albums.md` | **`FormControl` is removed**, replaced by `Field` (`Field.Root`/`Field.Label`/`Field.HelperText`/`Field.ErrorText`) — not a rename, a restructure with a new validation-display pattern (`Field.ErrorText` auto-renders based on `invalid`, no manual conditional needed). `Switch` wasn't covered explicitly in the guide excerpt — verify its v3 shape directly in Step 4. |
| Skeleton shimmer (`isLoaded` deliberately not used, per `artwork.md`'s reasoning about bypassing the CSS fade) | `artwork.md` | **`isLoaded` → `loading` (inverted boolean sense: `isLoaded` was true-when-ready, `loading` is true-when-NOT-ready).** This directly affects the `ArtworkBlock` component's `loaded` state variable — the prop passed to `<Skeleton>` needs both a rename AND a polarity flip (`loading={!loaded}`), not just a rename. Get this wrong and the shimmer logic inverts silently. |
| Icons via `@chakra-ui/icons` (confirmed used — see Step 0 findings above) | — | **Confirmed, not hypothetical.** `@chakra-ui/icons ^2.2.4` is an actual installed dependency, removed entirely in v3. Confirmed usages: `HamburgerIcon` (`Header.tsx`) → `LuMenu`; `CheckIcon`, `RepeatIcon`, `WarningIcon` (`App.tsx`) → `LuCheck`, `LuRepeat`, `LuAlertTriangle`, all from `react-icons/lu`. The codemod handles these renames automatically. The project's other icons (`FaHeart`/`FaRegHeart`/`FaUserCircle` per `favorites.md`/`header-redesign.md`) are already `react-icons/fa`, unaffected. |

## How every step closes (standing rule — applies to all steps below, not repeated per-step)

When a step's definition-of-done is met:

1. **Update this plan file** — mark the step `✅ COMPLETE`, add a verification record (what was actually checked — grep/runtime/visual — and what wasn't), same format as Steps 0/3 below.
2. **Update `CLAUDE.md`'s "⚠️ In-flight" section** — specifically the "known current gaps" bullet list. Remove any gap this step just closed. Add any new gap this step intentionally left open (e.g. a stub awaiting a later step). Do NOT touch any other section of `CLAUDE.md` — the in-flight notice is the only part that should change during the migration; the rest gets corrected once, at the end (see #3).
3. **Do NOT edit other `docs/decisions/*.md` files mid-migration** — they describe finished v2-era decisions and stay frozen until the *whole* migration is done. Once Step 8 ships, a final pass should add a dated follow-up section (append-only, per the project's existing convention — see `favorites.md`'s "Follow-up" pattern) to each decision doc whose described behavior actually changed (e.g. `header-redesign.md` gets a follow-up noting the Menu API is now v3, `favorites.md` gets one for the toast rebuild) — not a rewrite, an addition.
4. **Stop and report** — per the existing per-step discipline. Don't start the next step in the same session.

This keeps exactly one file (`CLAUDE.md`) carrying live migration-status info outside the plan itself, and keeps that update mechanical (a bullet-list diff) rather than a judgment call — reducing the chance it goes stale again like it did between Step 0 and Step 3.

**Historical note (added during the June 2026 documentation-integrity pass):** item 2 above describes maintaining a "known current gaps" bullet list in `CLAUDE.md`. That list was removed entirely in that pass (see `docs/decisions/documentation-audit-june2026.md`) — a duplicated, hand-maintained status list was judged not worth the upkeep risk it had already demonstrated. This rule is moot regardless, since the migration has no further steps to close; left here unedited as a record of the process actually followed at the time.



Ordered by dependency — each step assumes the previous ones are merged and stable. **Run the codemod (`--dry` first) before Step 1** to see how much it handles automatically; this may shrink several of the steps below, but don't skip the manual verification each step still calls for.

### Step 0 — Codemod dry-run + snippet setup — ✅ COMPLETE
Done via source analysis (interactive `--dry` prompt couldn't be piped — see "Step 0 findings" above for the confidence caveat). Branch `chakra-v3-migration` created, Node/version confirmed, snippet list reviewed, `HamburgerIcon`/other icon usages confirmed.

**Definition of done:** met — see findings section above.

### Step 1 — Theme tokens port
Run `npx @chakra-ui/codemod upgrade` for real (no `--dry`) against `theme.ts` and `main.tsx` first — per Step 0's source analysis this should auto-produce the `createSystem(defaultConfig, {...})` rewrite, wrap leaf token values in `{ value: ... }`, rename `semanticTokens`' `default` condition key → `base`, move `styles.global` → top-level `globalCss`, and rename the exported `theme` → `system`. **Treat this as the first real test of Step 0's source-analysis findings** — confirm the actual codemod output matches what was predicted before trusting it, and flag any divergence.

After the codemod runs: generate the needed snippets (`npx @chakra-ui/cli snippet add --all --outdir src/components/ui`, or selectively for `provider`/`toaster`/`color-mode`/`dialog`/`drawer`/`menu`/`field`/`switch`/`tag`/`skeleton`/`native-select`/`tooltip`/`input-group`/`alert`/`close-button`) — needed before Step 2 touches `main.tsx`.

Manually re-verify the custom-`radii` raw-CSS-string gotcha under the new wrapped-value shape — not covered by Step 0's source analysis. Goal throughout: preserve every token *name* exactly, so no call site elsewhere in the app needs to change in this step.

**Definition of done:** a v3 theme/system object exists (via the real codemod run, not source analysis), exporting the same token names, values visually verified against the current live app (side-by-side screenshot comparison, not just "compiles"). Snippet files generated. Any divergence from Step 0's predicted transform is logged here as a dated follow-up.

### Step 2 — Provider + root setup
Swap `ChakraProvider` in `main.tsx` to the v3 pattern: import the snippet-generated `Provider` component (wraps `ChakraProvider value={system}` + color-mode handling), pass the Step 1 system object in as `value` (not `theme`). Nothing else changes yet — the app will look broken in places until later steps land, and that's expected and fine for this step.

**Note on color mode:** v2's `useColorModeValue`/`ColorModeProvider` are removed in favor of `next-themes`. Confirm whether this app actually uses color-mode switching anywhere (nothing in the existing decision docs suggests it does — the app appears to be dark-theme-only) — if not, this is a non-issue and the snippet's color-mode plumbing can be minimal/skipped.

## Verified out-of-plan progress (grep-confirmed, not narrative-reported)

Before Step 1 formally completed, some Step 3/Step 5-shaped work happened ahead of schedule, outside the planned stop-and-report cadence. An initial narrative self-report claimed more was done than was true; a follow-up **raw `grep` audit** (line-number-level, not a summary) gave the actual ground truth below. Lesson for every future step: verify with grep/direct inspection, not a self-reported "✅ done" summary — the narrative version missed real bugs the grep version caught immediately.

**Confirmed fully cleared (zero hits):**
- `@chakra-ui/icons` imports — zero remaining, fully migrated to `react-icons/lu` equivalents.
- `bgGradient="linear(...)"` (v2 syntax) — zero remaining.
- `noOfLines=` (v2 prop) — zero remaining, presumably converted to `lineClamp`.
- `Select.Root`/`Select.Field` usages in `components/ui/native-select.tsx` and `components/ui/rich-text-editor-control.tsx` confirmed using correct v3 API.

**Confirmed NOT done — real, specific, outstanding bugs, scoped into Step 3:**
- `App.tsx:248` — `sx={{...}}` on the heart-button hover style (`Box as="button"`). Silently ignored under v3; hover styling currently broken. Fix: `sx`→`css`.
- `Header.tsx:105` and `Header.tsx:161` — `sx={{ '&[aria-expanded=true]': {...} }}` on the desktop Menu trigger and mobile hamburger IconButton (the documented whiteAlpha-flash suppression hack from `header-redesign.md`). Currently silently ignored — the "menu open" pressed state is not suppressed. Fix: `sx`→`css`.
- `App.tsx:687` — `isDisabled={refreshState === 'loading'}` on the Refresh button. This is a real functional bug, not cosmetic: v3 doesn't recognize `isDisabled` as a boolean prop on `Button`, so the button is currently **permanently disabled** regardless of `refreshState`. Fix: rename to `disabled`.

**Confirmed still fully v2, untouched (FavoritesPage — Steps 4/5 scope, unchanged):** `<Tag>`, `<DrawerOverlay>`, `<FormControl isRequired>`, `<AlertDialog>` + sub-components, v2 `<Select>` all still present in `FavoritesPage.tsx`. The page is currently lazy-loaded specifically to prevent these from crashing the rest of the app on import, but the route itself still white-screens. This was always Step 4/5's job — nothing here changes that scope.

**Decision:** the four items above (3× `sx`→`css`, 1× `isDisabled`→`disabled`) are held over and folded into the real Step 3 session below, rather than fixed as an ad-hoc patch — keeping one-feature-per-session discipline intact rather than creating yet another untracked "did this already happen" ambiguity.

### Step 3 — Core layout/display components — ✅ COMPLETE
`Box`, `Flex`, `Text`, `Heading`, `Tag` (→ `Tag.Root`/`Tag.Label`, plus `TagLeftIcon`/`TagRightIcon` → `Tag.StartElement`/`Tag.EndElement` if used), `Wrap`/`WrapItem`, `Skeleton` (`isLoaded` → `loading`, **polarity inverted** — see surface-area table above), `Image` (`Img` merges into `Image`; `fit`→`objectFit`, `align`→`objectPosition`; built-in `fallbackSrc` is removed, confirm the existing `onError`-based fallback in `ArtworkBlock` per `artwork.md` doesn't depend on any now-removed prop). Covers: card grid, `ArtworkBlock` (skeleton shimmer + square aspect ratio technique from `artwork.md`), genre tag styling from `genre-data.md`.

**Verification record:** grep-confirmed clean for `sx={{`, `isDisabled=`, `leftIcon=`, `isExternal` in `App.tsx`/`Header.tsx`. Preview runtime checks confirmed Refresh button clickable at idle, renders correct text, and card links open correctly with security attrs. **Card grid visually eyeballed by Dan in the live preview and confirmed looking right** — this covers the skeleton shimmer happy-path and overall card layout, but was not a targeted check of the artwork `onError`→placeholder failure path specifically (that path only triggers on an actual image load failure, which a normal eyeball pass won't exercise). Low-risk gap, noted for awareness — if a broken-image icon ever appears on a card instead of the `♪` placeholder, this is the first place to look.

**This step's scope explicitly included the 4 grep-confirmed outstanding items from "Verified out-of-plan progress" above — confirmed fixed:**
- `App.tsx:248` — `sx`→`css` on the heart-button hover style.
- `Header.tsx:105` and `:161` — `sx`→`css` on the two Menu-trigger `&[aria-expanded=true]` overrides.
- `App.tsx:687` — `isDisabled`→`disabled` on the Refresh button (currently a real functional bug: button is stuck disabled regardless of state).

**Definition of done — MET:** card grid renders visually identically to the current v2 version (confirmed by Dan via live preview). Skeleton shimmer fade behavior works on the happy path (confirmed visually); the failure-path `onError`→placeholder fallback was not specifically exercised — flagged above as a low-risk open item, not a blocker. All 4 outstanding items confirmed fixed via grep (zero remaining `sx={{` or `isDisabled` hits in `App.tsx`/`Header.tsx`). Refresh button confirmed actually clickable when idle.

### Step 4 — Form/input components — ✅ COMPLETE (1 known cosmetic gap, logged below)
`Input` (`isDisabled`→`disabled`, `isInvalid`→`invalid`, etc. — the `is<X>` → `<x>` boolean rename applies broadly here), `Select`→`NativeSelect.Root`/`NativeSelect.Field`/`NativeSelect.Indicator`, `Switch` (verify v3 shape directly), `FormControl`/`FormLabel`→`Field.Root`/`Field.Label`/`Field.HelperText`/`Field.ErrorText` (note: `Field.ErrorText` auto-renders on `invalid`, so any existing manual conditional around error messages can likely be simplified, not just renamed). Covers the controls bar (search, sort, source, score filters from `controls-bar.md`) and the `AddAlbumDrawer` form fields.

**Verification record:** `FavoritesPage.tsx` grep-confirmed clean — `FormControl`/`FormLabel`/`FormHelperText` → `Field` snippet (`required`/`label`/`helperText` props), v2 `Select` (year dropdown) → `NativeSelect.Root`/`NativeSelect.Field`, `isDisabled`→`disabled`, `isLoading`→`loading`, `colorScheme`→`colorPalette`, `spacing`→`gap`. TypeScript clean. `App.tsx`'s controls bar (search/sort/source/score) confirmed functionally working by Dan directly.

**🟡 Known gap, logged not fixed — dropdown `<option>` backgrounds render white instead of dark.** This is the predicted risk flagged in the surface-area table above: the `sx={{ '& option': {...} }}` dark-background hack needs converting to `css={{...}}` syntax for v3, and Dan confirmed the dropdown lists are currently showing the browser-default white background — meaning this conversion either didn't happen or didn't carry through (likely during the earlier ahead-of-schedule Step 3 work, since this Step 4 session's report didn't touch `App.tsx`). **Functionally the controls work fine; this is cosmetic only.** Tracked here as an explicit open item — fix scope: find every `<NativeSelect>`/native-`<select>`-based dropdown across `App.tsx` and `FavoritesPage.tsx`, confirm the option-background override exists and uses `css` (not `sx`), apply the dark-background fix consistently. Good candidate for the start of Step 5 (quick fix before diving into Menu/Drawer/Dialog), or its own 10-minute cleanup session — Dan's call.

**Definition of done:** all four controls-bar filters function identically (confirmed); dropdown styling matches dark theme — **NOT yet met, logged as the gap above**; `AddAlbumDrawer` form fields (`Field`, `NativeSelect` year dropdown) ported and grep-confirmed clean.

### Step 5 — Interactive/overlay components — ✅ COMPLETE
`Menu` (×2 instances) → full compound rewrite (`Menu.Root`/`Menu.Trigger` with `asChild`/`Menu.Positioner`/`Menu.Content`/`Menu.Item` with `value`, wrapped in `Portal`). `Drawer` → `Drawer.Root`/`Drawer.Backdrop`/`Drawer.Positioner`/`Drawer.Content` with the `isOpen`→`open`, `onClose`→`onOpenChange` (now `{ open }`), `closeOnOverlayClick`→`closeOnInteractOutside`, `closeOnEsc`→`closeOnEscape` renames.

**Verification record:**
- **Menu rewrite (`Header.tsx`, ×2 instances):** done earlier than this session, during the ahead-of-schedule out-of-plan work logged before Step 0 formally closed (confirmed: that report listed `Menu → Menu.Root/Menu.Trigger/Menu.Content/Menu.Item` under "pre-empted, done correctly"). Functionally confirmed working. **One minor item still not explicitly re-verified by either report:** the `_active`/`aria-expanded` whiteAlpha-flash-suppression CSS override's visual behavior under v3's actual state attributes — Menu function is confirmed, this specific cosmetic detail is not. Logged as a minor open item, not blocking (same tier as the dropdown-background gap from Step 4).
- **`Drawer`/`AlertDialog` rebuild (`FavoritesPage.tsx`, this session):** `Drawer`→`DrawerRoot` + snippet components (`placement="end"`, `DrawerOverlay` removed as expected), `AlertDialog`→`DialogRoot` + snippet components (`role="alertdialog"`, `initialFocusEl={() => keepEditingRef.current}` — the confirmed manual `leastDestructiveRef` fix, applied correctly), `CloseButton` import moved to the snippet file, `noOfLines`→`lineClamp`. TypeScript clean, no test regressions.
- **Step 4's dropdown-background gap also closed in this session** (technically `App.tsx`, bundled in): `css: { '& option': {...} }` added to `controlFieldStyle`, fixing all 3 controls-bar dropdowns plus the FavoritesPage year dropdown in one place.
- **Manual checks Dan ran and confirmed:** `/favorites` renders (no more white-screen); typing in Band/Album then clicking X shows the "Discard this album?" dialog with "Keep editing" focused; "Keep editing" closes the dialog leaving the drawer open; "Discard" clears the draft and closes the drawer; controls-bar and year dropdown `<option>` backgrounds now dark.
- **Not explicitly re-checked, by Dan's call:** the empty-fields-skip-the-prompt case, and the overlay-click/Esc/navigate-away-preserves-draft case. Reasoning accepted: that logic is pure JS state handling that never touched Chakra's API surface, so it had no mechanism to break as a side effect of this step.

Also re-verify the `_active`/`aria-expanded` Menu override hack from `header-redesign.md` against v3's actual state-exposure mechanism (likely data attributes — confirm before assuming the same CSS selector still works).

**Definition of done:** both Menu instances behave identically (confirmed functionally; whiteAlpha-flash cosmetic detail not explicitly re-checked — minor open item); `AddAlbumDrawer` open/close/draft/discard behavior confirmed for the core discard-confirm path; two minor edge cases (empty-fields, overlay-click-preserves-draft) not re-verified this session but assessed as low-risk.

### Step 6 — Toast system — ✅ COMPLETE
This is a structural rebuild, not a hook rename. v3 has no `useToast`; instead: a `createToaster()` call (typically placed in a snippet-generated `components/ui/toaster.tsx`) configures a singleton toaster, and a `<Toaster>` component must be rendered once near the app root (likely in `main.tsx` or the `Provider` wrapper from Step 2) to actually display anything. `useFeedbackToast`'s external API (`showSuccess(message)`, `showError(message)`, `showAction(message, { label, onClick })`) should be preservable as a thin wrapper calling the toaster instance's `.create()` (or equivalent v3 method — confirm exact method name from the toaster snippet) — meaning no call site elsewhere in the app needs to change, only the inside of `useFeedbackToast` itself. Wide blast radius regardless (every CRUD action touches this), so keep it as its own isolated session.

**Definition of done:** every existing toast call site works unchanged; visual style (success/error/action variants, durations) matches current behavior; `<Toaster>` is rendered exactly once at the app root (verify no duplicate-toaster bugs).

**Verification record:** Dan confirmed by direct observation — triggering the heart toggle and the Refresh button produced real, visible toasts on screen, not just a clean compile/test pass. This was the critical bar for this step specifically, since a silently-broken toaster implementation would also pass TypeScript/lint checks. No detailed file-level change report was given for this step (unlike Steps 3–5); if a fuller grep/implementation summary becomes available later, append it here rather than re-deriving it from memory.

### Step 7 — Test suite verification pass — ✅ COMPLETE
Re-run the full test suite. Specifically re-verify (don't assume pass/fail, check directly):
- `RequireAuth`'s no-`ChakraProvider` test wrapper — confirm v3's `Provider`/`ChakraProvider` either also injects a DOM marker (keep the workaround) or doesn't (workaround becomes unnecessary, but harmless to leave).
- Header's `sx`/`css`-`@media`-breakpoint jsdom workaround — confirm both desktop/mobile clusters are still simultaneously present in the DOM under test, under v3's actual CSS engine (not assumed from v2 behavior).
- `mergeGuard.test.ts` and any backend-only tests are unaffected (they don't touch Chakra) — quick confirmation, not expected to need changes.
- Any test asserting on the old `isOpen`/`isLoaded`/etc. boolean prop names needs updating to the new `open`/`loading`/etc. names — a systematic find pass across test files, not just source files.

**Verification record:** 6 test files updated (`theme={theme}` → `value={system}` on `ChakraProvider`, matching import alias rename) — this is the systematic boolean/prop-name find pass the step called for. `src/__tests__/setup.ts` gained a `ResizeObserver` no-op stub to silence async rejections from v3's Menu positioning logic in jsdom — a new issue not anticipated by the original plan, caught and fixed in this step. Full suite: **210/210 tests, 30/30 files, 0 errors.**

**Confirmed by absence of failure, not by direct line-item inspection:** the `RequireAuth` no-`ChakraProvider` DOM-marker assumption and the header `@media`-breakpoint-in-jsdom assumption were not individually re-checked against v3's actual Provider/CSS engine. Dan's call to accept the full green suite as sufficient evidence — if either assumption had broken under v3, the corresponding test (RequireAuth's "renders null while loading," or the header's desktop/mobile-both-present assertions) would show up as a failure, not a silent pass. Treat this as solid indirect evidence, not as proof those specific mechanisms were inspected directly.

**Definition of done:** full `npm run test` suite green (210/210), no skipped/disabled tests left over from the migration.

## The migration ends at Step 7

**Step 7 was the last step of the migration itself.** The migration's job — port the API surface, preserve behavior exactly, no redesign mid-flight — is done. Steps 0–7 are all ✅ complete and verified (full test suite green, 210/210).

The DatePicker feature that originally motivated this migration is **not part of the migration** — it's a new feature that happened to depend on v3 existing first. It was incorrectly framed as "Step 8" in earlier drafts of this plan; that was a mistake, now corrected. No standalone feature brief was ever written for it; implementation detail lives in `docs/decisions/favorites-view.md` (AddAlbumDrawer section).

**Current status of that feature:** implemented in `AddAlbumDrawer`, not yet manually verified end-to-end. See `docs/decisions/favorites-view.md` for detail.

## After the migration: foundation audit (separate initiative, not a step in this sequence)

Now that the migration (Steps 0–7) is complete, a **separate, later** initiative — not numbered as part of this migration — should audit the whole frontend's styling layer with a different goal than the migration itself: not "does it work," but "is this the right way to build it." This is intentionally decoupled from the migration so the migration could stay focused on its one job (port API surface, preserve behavior exactly, no redesign mid-flight) without the scope-creep risk of trying to also rethink the foundation while half-migrated.

See the separate brief for this: `chakra-v3-foundation-audit-brief.md`. Eligible to start now that the migration is done — Dan's call on timing, don't start automatically.

## What NOT to do during this migration

- Do not change any token *names* — only the file/API used to define them. Every existing call site (`surface.card`, `accent.border`, etc.) across the app must keep working without edits, until/unless a later step explicitly says otherwise.
- Do not redesign any behavior while porting. This migration is about API surface, not UX — the discard-confirm flow, toast variants, filter logic, and card layout should look and behave identically before and after, even where the underlying component changed (e.g. `AlertDialog` → `Dialog`).
- Do not skip the visual-regression check at the end of each step. v3's styling engine is different enough that "it compiles" is not sufficient evidence it looks the same.
- Do not apply the codemod blindly across the whole repo in one shot without reviewing the `--dry` diff first — it handles renames/restructuring but not the structural rebuilds (toaster, `AlertDialog`→`Dialog`) that need manual design attention.
- The "Step 8 (DatePicker)" rule that was here is moot — the migration ended at Step 7 and the DatePicker feature was implemented separately afterward (see `favorites-view.md`). Left as a historical note only.
- Do not let other feature work (AOTY, anything else) get built against v2 patterns once Step 1 begins — new feature work should either wait, or explicitly target v3 patterns if it can't wait, on a case-by-case judgment call with Dan.
- Do not assume a step is complete because the codemod ran clean on it. Several real-world migration writeups (see below) report the codemod and official guide undersell the actual effort — treat each step's definition-of-done as the real bar, not "no compile errors."

## A note on expected difficulty

The official guide's tone (a checklist with "before/after" snippets) reads as more contained than third-party accounts suggest in practice. Independent writeups of real v2→v3 migrations describe circular-import issues, test instability, and build-memory problems surfacing mid-migration, and one engineer's note put it plainly: "in short, everything has changed... it was essentially a rewrite." This doesn't change the plan, but it's a reason to:
- Budget more time per step than the official guide's snippet-by-snippet framing implies.
- Treat every step's visual/behavioral regression check as mandatory, not optional, even when the codemod reports a clean pass.
- Keep the one-feature-per-session discipline strictly — don't combine steps to "save time," since that's exactly where the real-world accounts report things spiraling.

## Open questions to resolve before Step 1 begins

- ~~Does v3 ship a codemod or migration tool for token/theme definitions?~~ **Resolved:** yes — `npx @chakra-ui/codemod upgrade`, plus `npx @chakra-ui/cli eject` for a reference theme export.
- ~~Confirm exact installed v2 version~~ **Resolved (Step 0):** `@chakra-ui/react ^2.8.2`, `@chakra-ui/icons ^2.2.4`.
- ~~Confirm the dev environment's Node version~~ **Resolved (Step 0):** 22.14.0, well above the 20.x minimum.
- ~~Confirm whether the app uses Chakra's color-mode system anywhere~~ **Resolved (Step 0):** no `useColorModeValue` calls found — app is dark-theme-only. Step 2's color-mode plumbing can be minimal.
- ~~Confirm `HamburgerIcon`'s actual import source~~ **Resolved (Step 0):** confirmed `@chakra-ui/icons`, codemod maps it to `LuMenu`. Also found `CheckIcon`/`RepeatIcon`/`WarningIcon` in `App.tsx` with the same issue, now mapped to `LuCheck`/`LuRepeat`/`LuAlertTriangle`.
- **Still open:** decide test strategy per step — full suite re-run after every step, or only after Step 7? Not addressed by Step 0.
- **Still open:** whether the source-analysis-based `AlertDialog`→`Dialog` finding holds up against an actual executed `--dry` diff on `FavoritesPage.tsx` — deferred per Dan's call to proceed without re-verifying first; worth a sanity check at the start of Step 5 regardless.
- **New from Step 0:** confirm the `radii` raw-CSS-string gotcha still applies once token values are auto-wrapped in `{ value: ... }` — flagged but not yet checked.

## Sources

- Official migration guide: https://www.chakra-ui.com/docs/get-started/migration (primary source for all "confirmed" facts above)
- Third-party migration accounts referenced for the difficulty note: a DEV Community sprint writeup and a Medium account of a corporate-scale migration, both describing the practical migration as more involved than the official checklist implies.
