# Brief — Frontend styling foundation audit (post-migration)

> **Eligible to start now that the Chakra v3 migration (Steps 0–7, see `chakra-v3-migration-plan.md`) is complete — timing is Dan's call, not automatic.** This is a deliberately separate, later initiative — not a step in that migration. The migration's job was narrow on purpose: port the API surface, preserve behavior exactly, no redesign mid-flight. This audit is the opposite kind of work: now that the app is fully running on v3 and stable, reconsider whether the *way* things are styled is still the right approach, with the benefit of seeing the whole app working first.

## Context — why this audit exists

Over this project's history, several styling decisions were one-off patches reacting to specific Chakra v2 limitations encountered in the moment — not deliberate, foundational choices. Examples already on record:

- `sx={{ '& option': { background: '#1a202c' } }}` — a hardcoded hex hack to fix native `<select>` dropdown backgrounds on Windows (`design-tokens.md`, `controls-bar.md`, `refresh-button.md`)
- `_active`/`aria-expanded` CSS overrides to suppress Chakra's whiteAlpha flash on Menu buttons (`header-redesign.md`)
- `sx={{ '@media (max-width: 47.9375em)': ... }}` chosen specifically to work around a jsdom testability quirk with Chakra's responsive shorthand (`header-redesign.md`)
- `color="gray.300"` on the Refresh button — explicitly flagged in `design-tokens.md` as "not a token yet," a deliberate carve-out from the otherwise-strict token system
- A custom `radii` block requiring raw CSS strings rather than Chakra-scale key references, called out as a "gotcha" rather than a clean pattern (`design-tokens.md`)

Each of these was the right call *at the time*, given the constraint that triggered it. But carried forward uncritically, a v3 port risks just translating the same hacks into v3 syntax without asking whether the underlying limitation that forced each hack still exists in v3 at all. The point of this audit is to stop doing that — to look at the app as it actually exists today, post-migration, and rebuild any part of the styling layer that's still hack-shaped, on v3's actual intended primitives.

## Explicit scope boundary

**This audit is about the styling/visual foundation only.** It is not a license to:
- Re-open data/ingest logic, scraper bugs, or backend behavior (see `genre-artwork-bugfixes.md` for the kind of bug class this is explicitly NOT about)
- Change the app's brand identity — the actual token *values* (teal/blue gradient, `brand.score` gold, the overall dark theme) are a design decision, not a hack, and are out of scope unless a specific value is found to have been a workaround rather than a deliberate choice
- Add new features (that's Step 8 / future briefs, not this audit)
- Redesign UX flows (discard-confirm behavior, drawer lifecycle, filter logic, etc. — those are settled product decisions from prior briefs, not up for re-litigation here)

## What to actually audit

Go through the app's styling layer systematically and, for each pattern found, ask: **is this a deliberate design decision, or a patch around a v2 limitation that may no longer exist?**

1. **Every documented hack/carve-out from the migration plan's "Current v2 surface area" table** — re-check each one specifically:
   - The native-`<select>`-option hex hack — does v3's `NativeSelect` still require it, or does it style natively now?
   - The Menu `_active`/`aria-expanded` override — does v3 expose open/active state via data attributes that make this override unnecessary or differently-shaped?
   - The jsdom `@media`-breakpoint workaround — is it still needed under v3's CSS engine, or did the underlying jsdom issue change?
   - The `radii` raw-CSS-string requirement — does v3's token system handle this more cleanly?
   - The undocumented `color="gray.300"` carve-out on the Refresh button — was this ever resolved? If not, decide now: token it properly, or document why it's a genuine exception.

2. **Any `sx`/`css` prop usage anywhere in the app** — inventory every instance. For each: is the underlying style achievable through a proper v3 token, recipe, or semantic token instead of an inline override? Inline `sx`/`css` should be the exception, not the default, going forward.

3. **Any hardcoded hex/color values outside the token system** — `design-tokens.md` already established the rule (named tokens only); confirm the migration didn't introduce new hardcoded values as a shortcut, and clean up any that did.

4. **Component-level styling consistency** — now that everything is on v3's compound-component patterns (`Menu.Root`, `Dialog.Root`, `Drawer.Root`, `NativeSelect.Root`, `Field.Root`, etc.), check whether styling is applied consistently across them (e.g., are border radii, spacing, and color application following the same pattern on every compound component, or did some get styled ad hoc during the port?).

5. **Recipes vs. inline overrides** — v3's recipe/slot system is designed for exactly this kind of reusable styling (e.g., a "pill nav link" recipe instead of the `navPillBase` constant object pattern documented in `header-redesign.md`). Evaluate whether existing reusable-style constants (like `navPillBase`, `controlStyle`, `cardStyle`) should become proper v3 recipes instead of plain JS objects spread onto props.

## Process

1. **Inventory first, change nothing yet.** Produce a list of every hack/carve-out/inline-override found, each tagged as one of: (a) still necessary under v3 — document why, (b) no longer necessary — v3 solves this natively, propose the cleaner replacement, (c) ambiguous — needs Dan's input on which way to go.
2. **Review the inventory with Dan before touching code.** This is a "show a plan and wait for approval" moment per the project's standing convention — this audit's whole value is in the judgment calls, not in mechanically deleting things.
3. **Execute approved changes incrementally**, one category at a time (e.g., all `sx`-hack re-evaluations in one pass, then recipe conversions in a separate pass) — not as one giant rewrite commit. This keeps with the one-feature-per-session discipline even though it's not a "feature" in the usual sense.
4. **Visual regression check after each category** — same discipline as the migration itself: this audit should not change how the app *looks* or *behaves* unless a specific change is explicitly called out and approved as a visual change, not just an implementation cleanup.

## What NOT to change without explicit sign-off

- Any actual token *value* (colors, the teal/blue gradient, `brand.score` gold) — these are brand decisions, not hacks, unless specifically identified as a leftover placeholder.
- Any UX/behavioral flow already settled in a prior brief (discard-confirm, draft persistence, filter/sort logic, card layout order, etc.).
- Anything outside the styling layer (ingest, scrapers, Supabase schema, auth flows).

## Definition of done

- [ ] Full inventory of `sx`/`css` usage, documented hacks, and non-token carve-outs produced and categorized (still-necessary / no-longer-necessary / ambiguous).
- [ ] Inventory reviewed with Dan; decisions made on each ambiguous item.
- [ ] Approved replacements implemented, one category at a time, each with its own visual regression check.
- [ ] No change to brand token values, UX flows, or non-styling code.
- [ ] A new decision doc (`docs/decisions/chakra-v3-foundation-audit.md`) records what was found, what was changed, and why — following the same rationale-first documentation convention as every other decision doc in this project.
