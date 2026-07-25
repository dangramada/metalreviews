# Design system spec — Slant Take

> **Correction (2026-07-25, during pass 3):** the line below originally said
> `03-graded-slab-void-accent.html` was "kept over `04-graded-slab-row-gap.html`". That is
> wrong in two ways. No file named `04-graded-slab-row-gap.html` exists anywhere on disk;
> the row-gap iteration is `~/Downloads/03-graded-slab-void-accent_1.html`, a browser
> duplicate-download that was never renamed. And it was *adopted*, not rejected — it is the
> later file (21:58 vs 21:41) and its own annotation describes replacing the zero-gap
> "continuous ruled sheet" with separate bordered blocks and a 10px gutter "per Dan's
> request". **`03-graded-slab-void-accent_1.html` is the reference mockup**, and it is what
> pass 3 was implemented against.

Consolidated from the mockup iterations ("Graded Slab" was the internal working name during
exploration; this is now the actual Slant Take visual system, not a codename) into concrete
`theme.ts` token changes. This is the reference spec — the next step is a Claude Code brief
written against this, split by concern per the project's one-concern-per-session convention
(likely: colors/fonts first, radii second, badge component restructure third).

## 0. Branch before starting

Per the project's git conventions (feature branches named for the work, `--no-ff` merges, no
rebase/squash, rollback tag before significant changes): create a new branch before any of
this lands, e.g. `design-system-slant-take`. Don't work directly on `master`, and don't reuse
an existing feature branch from unrelated work.


---

## 1. Color palettes — three new ramps, none reuse Chakra defaults

Chakra's built-in `gray` is cooler/blue-tinted than anything in the mockup. Checked directly
rather than assumed: the mockup's neutrals are pure 0%-saturation black-gray, and its text
colors are a **distinct warm family** (~45° hue, saturation *increasing* as it lightens —
2.7% at the darkest text shade up to ~13% at the lightest). Three custom palettes needed.

### `ember` (accent — replaces `purple` everywhere)
```
50: #fef5f1   300: #ffa97a   600: #e65000   900: #712e09
100: #fde8dd  400: #ff8847   700: #b84305   950: #451d08
200: #fdceb4  500: #ff6a1a   800: #913808
```

### `ink` (neutral — surfaces, borders)
```
50: #f7f7f7   300: #bdbdbd   600: #595959   900: #131313 ← bg-card, exact
100: #ededed  400: #999999   700: #3a3a3a ← rule-strong, exact   950: #0c0c0c ← bg-page, exact
200: #d9d9d9  500: #757575   800: #262626 ← rule, exact
```

### `sand` (warm — text)
```
50: #f4f3f0   300: #9d998c ← ~text-dim   700: #383838
100: #eae8e1  400: #7b7870              800: #292929
200: #cac6bb ← ~text-primary  500: #666460 ← ~text-muted  900: #1a1a1a
                              600: #4d4d4c              950: #0f0f0f
```

**Caveat on all three:** generated via HSL math, anchored exactly to real mockup hex values
where they existed, interpolated/extrapolated elsewhere. Treat as a strong starting point, not
gospel — worth a visual pass at `/style-guide` once wired in, especially at the extremes (50,
950) which have no real anchor.

**Exception, not part of any ramp:** `bg-card-hi` (`#181818`, card hover state) sits between
`ink.900` and `ink.800` and doesn't land cleanly on a standard step. Keep as its own literal
token, `surface.cardHover`, rather than forcing a non-standard ramp step.

---

## 2. Semantic token remapping

| Token | Current | New |
|---|---|---|
| `surface.page` | `gray.900` | `ink.950` |
| `surface.card` | `gray.800` | `ink.900` |
| `surface.cardHover` | *(doesn't exist)* | `#181818` (literal — see exception above) |
| `surface.raised` | `gray.700` | `ink.700` |
| `surface.darkest` | `gray.900` | `ink.950` |
| `border.default` | `gray.600` | *(unchanged — kept distinct, see below)* |
| `border.hover` | `gray.400` | *(unchanged — kept distinct, see below)* |
| `border.rule` | *(new)* | `ink.800` |
| `border.ruleStrong` | *(new)* | `ink.700` |
| `text.primary` | `white` | `sand.200` (`#cbc7ba`) |
| `text.dim` | `gray.400` | `sand.300` |
| `text.muted` | `gray.500` | `sand.500` |
| `accent.border` | `purple.500` | `ember.500` |
| `accent.text` | `purple.300` | `ember.300` |
| `accent.ink` | *(new)* | `#140a03` — near-black text sitting on accent-filled elements |
| `accent.start` | `purple.300` | **retired** — see §5 |
| `accent.end` | `purple.600` | **retired** — see §5 |
| `slab.bg` | *(new)* | `#f2f2f0` (light "bone," default score-slab background) |
| `slab.text` | *(new)* | `ink.950` |

`border.rule`/`border.ruleStrong` are added rather than repointing `border.default`/
`border.hover`, so the header divider, focus rings, and any other current consumer of those
two tokens don't silently shift color. Confirm this is really what you want before it ships —
it means two parallel border systems exist for a while (old muted-purple-adjacent grays,
new mockup grays) until everything's migrated over.

---

## 3. Typography — new, not currently in `theme.ts`

```ts
fonts: {
  heading: { value: "'Clash Display', sans-serif" },
  body:    { value: "'Inter', sans-serif" },
  mono:    { value: "'JetBrains Mono', monospace" },
}
```
`mono` isn't a role Chakra's default system defines — no component reaches for it
automatically, it has to be referenced explicitly wherever the mockup uses it (dates, badges,
tags, footer, counter).

**Open item:** Clash Display is a Fontshare file, not on a CDN like Google Fonts. Needs either
the actual font file self-hosted, or the Fontshare API `<link>` added to `index.html` — not
yet decided which.

---

## 4. Radii — zero, everywhere

```ts
radii: {
  none: { value: '0px' },
  base: { value: '0px' },
  md:   { value: '0px' },
  lg:   { value: '0px' },
}
```
Raw CSS strings required — referencing another scale key by name silently produces no
radius (documented gotcha, flagged during the v3 migration, never actually re-verified).
Worth a real visual check this time, not another carried-forward assumption.

---

## 5. Header wordmark — gradient retired, flat two-tone

Current header title uses a gradient built from `accent.start`/`accent.end`. Slant Take's
own direction is explicitly zero-gradient. New treatment: word one in `text.primary`, word
two in `accent.border`, no gradient stops. This is a behavior change to `Header.tsx`, not a
pure token swap — confirm this is really wanted before it's in scope for a brief.

Logo mark: unchanged, concentric rings as built in the mockups (no custom T-ligature — that
idea stays parked per the naming record, unrelated to this pass).

---

## 6. Buttons

```ts
export const primaryButton   = { colorPalette: 'ember' };
export const secondaryButton = { colorPalette: 'gray' };
```
`ember` needs registering as a full palette (not just semantic tokens) for Chakra's built-in
hover/active/disabled states to work — see §1.

---

## 7. Badges

### Source badge
```ts
export const sourceBadge = {
  bg: 'surface.page',
  color: 'text.dim',
  borderTop: '2px solid',
  borderTopColor: 'border.rule',
  borderRight: '2px solid',
  borderRightColor: 'border.rule',
  borderRadius: '0',
  fontFamily: 'mono',
  fontSize: '10.5px',
  fontWeight: '500',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  px: '10px',
  py: '6px',
};
```
**Confirmed value change, not just a rename:** bg moves from card-level (`gray.800`) to
page-level (`surface.page`) — one shade darker than before.

**Open item — not resolved:** multi-source albums render source badges as a `Wrap`/
`WrapItem` list (2–3 stacked badges). The mockup only ever shows one. The partial-border
flush-corner treatment is untested with more than one badge in that corner — confirm it
actually looks right stacked before assuming it does.

### Score badge → score slab (confirmed as a structural change, not a config swap)

The current `scoreBadge` renders one plain string (`formatAverageScore`, e.g. `"8.7"`) in a
single `<Badge>`. The new version needs:

- Two child nodes, not one string: a large number (`fonts.heading`, `23px`) and a small,
  dimmed `/10` (`fonts.mono`, `10px`, `opacity: 0.6`)
- A threshold check — `averageScore >= 8.0` swaps the whole badge from the default "bone"
  state to an accent-filled "high" state

```ts
export const scoreSlabBase = {
  bg: 'slab.bg',
  color: 'slab.text',
  borderTop: '2px solid',
  borderTopColor: 'border.rule',
  borderLeft: '2px solid',
  borderLeftColor: 'border.rule',
  borderRadius: '0',
  px: '12px',
  pt: '7px',
  pb: '6px',
};
export const scoreSlabHigh = {
  ...scoreSlabBase,
  bg: 'accent.border',
  color: 'accent.ink',
};
```
Rendered with explicit markup (not spread onto a bare `<Badge>` string), e.g.:
```tsx
<Box {...(score >= 8.0 ? scoreSlabHigh : scoreSlabBase)}>
  <Text as="span" fontFamily="heading" fontSize="23px" fontWeight="700" letterSpacing="-0.02em">
    {score.toFixed(1)}
  </Text>
  <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="700" opacity={0.6} ml="3px">
    /10
  </Text>
</Box>
```

### Genre badge → tag
```ts
export const genreBadge = {
  bg: 'transparent',
  color: 'text.dim',
  border: '1px solid',
  borderColor: 'border.ruleStrong',
  borderRadius: '0',
  fontFamily: 'mono',
  fontSize: '10.5px',
  fontWeight: '500',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  px: '8px',
  py: '3px',
};
```
**Note the 1px border** — thinner than the 2px structural borders used everywhere else. This
is intentional in the mockup (inline chips read lighter than structural elements); don't
"fix" it to 2px for consistency.

### System badges (`gray`/`green`/`red`)
No change requested — inherit the global `radii: 0` and otherwise stay Chakra defaults.

---

## 8. Not in scope for this pass

- Favorites page (list-row layout, not grid cards — will consume these same tokens once a
  Claude Code brief covers it, but the row-based layout wasn't visually mocked up separately)
- AOTY screens — explicitly postponed until this system lands
- Add Album Drawer, empty/loading/error states — untouched so far

## 9. Loose ends before a Claude Code brief gets written

1. Font-loading strategy for Clash Display (self-host vs. Fontshare API link) — undecided
2. `naming-decision-record-v2.docx` still says *"Accent colour: Purple — unchanged"* — needs
   a dated follow-up appended once this ships, per the project's append-only convention
3. Radii gotcha needs an actual visual check this time, not another assumption carried forward
4. Multi-source badge stacking (§7, source badge) — untested against the new bordered treatment
