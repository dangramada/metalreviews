# Naming decisions

**Why this file exists:** the project's naming decisions previously lived in
`naming-decision-record-v2.docx`, which does not exist anywhere on this machine and appears
never to have been committed to the repo in any form. It was referenced as the authority for
the locked display face and accent colour, and pass 1 of the Slant Take design system flagged
that it needed a dated follow-up — which stayed permanently blocked on a file nobody could
open.

Recreated here on **2026-07-25** as a normal `docs/decisions/*.md` record, matching the format
every other decision doc uses, so the project's append-only convention has somewhere real to
live. Content below is reconstructed from what the mockups and spec cite it as saying; if the
original `.docx` ever surfaces, reconcile against it rather than assuming this file is
complete.

**Convention:** append dated entries. Do not rewrite history in place.

---

## Locked decisions

### Product name — "Slant Take"

The chosen product name. Referenced as locked in `design-system-spec-slant-take.md` and in
the mockups, whose wordmark reads `Slant` + `Take`.

**Not yet reflected in the live app**, which still ships as "Metal Reviews" throughout
(header wordmark, `<title>`, `package.json`, docs). See `deferred-work.md` — the rename is
tracked as its own item, deliberately not bundled into a design pass.

> **Update, 2026-07-25:** the rename shipped — see the dated entry below. The paragraph
> above is left as-written rather than edited in place, per this file's own append-only
> convention; it was accurate when written.

### Display face — Clash Display

Locked as the display face, chosen over Archivo Expanded (which earlier mockups used and
which mockup `03-graded-slab-void-accent_1.html` still loads alongside it purely so
`--font-display` can be flipped for comparison).

Scope of use is narrow and deliberate: **the logo wordmark and the score-slab number only.**
It is explicitly *not* for card titles — band and album names are Inter. Pass 3 of the design
system fixed a real bug where band/album inherited Clash Display via Chakra's generic
`Heading` role.

### Logo mark — concentric rings

Concentric rings as built in the mockups. The custom T-ligature idea is parked, per the
naming record, and is unrelated to the design-system passes.

---

## 2026-07-25 — Accent colour is now ember orange, superseding "Purple — unchanged"

The superseded record stated *"Accent colour: Purple — unchanged."* That is no longer true as
of the Slant Take design system.

**Accent is `ember` — `#ff6a1a`** (`ember.500`, semantic token `accent.border`), with
`accent.ink` `#140a03` for text sitting on an accent fill. Shipped in pass 1 (colour ramps +
semantic token repointing, `primaryButton` → `colorPalette: 'ember'`) and made visible in the
header wordmark in pass 3.

Chosen over the earlier amber `#e8923a` used in the "Graded Slab" mockups — the `#ff6a1a`
value was lifted from the Spotlight Void iteration and carried into the final direction.

Accent use is intentionally rationed rather than decorative: on the score slab it is
**earned**, reserved for grades of 8.0+, so the orange marks a genuinely high score instead of
appearing on every card.

Full detail: `slant-take-design-system.md`.

---

## 2026-07-25 — Rename shipped: "Metal Reviews" → "Slant Take"

Dan's decision: ship the live rename now rather than wait on the formal naming gates listed
below — get real feedback on the app under its real name. **This supersedes those gates; it
does not mean they were cleared.** None of the following have been done:

- Friend test
- Domain check
- Trademark search

If any of these later turn up a conflict, the name may need to change again — the app
running under "Slant Take" today is not evidence that it's clear to keep.

**What changed (design-system pass 5):** header wordmark (`Header.tsx`, two-tone spans,
same structure as pass 3 — word one `text.primary`, word two `accent.border`), `<title>` in
`index.html`, and `Header.test.tsx`'s assertions. `package.json`'s `name` field needed no
change — audited and found to already be `"scraper"`, never "Metal Reviews". The
MusicBrainz API `User-Agent` identifier (`scripts/musicbrainz.ts`) was also updated to
`SlantTake/1.0` for consistency, though it is never user-facing.

**What did not change, and why:** the favicon (still a stale teal bar-chart icon predating
every design-system pass — needs real artwork built around the concentric-rings mark, a
design-asset task, not a text rename), and the domain / GitHub repo name / Render service
name (all still literally "metalreviews" — infrastructure-level, out of reach of a code
change, and a repo rename specifically risks breaking Render's existing deploy hook).
Historical decision-doc bodies describing the "Metal Reviews" era (e.g. `header-redesign.md`,
`artwork.md`) were deliberately left unedited — they're records of what happened at the time,
not living references.

Full detail: `slant-take-design-system.md` pass 5.
