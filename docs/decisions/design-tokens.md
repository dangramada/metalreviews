# Session decisions — Design tokens (June 2026)

## What was built

All hardcoded design values consolidated into `src/theme.ts`, which is registered in `src/main.tsx` via `<ChakraProvider theme={theme}>`. `src/App.tsx` references only named tokens — no raw hex codes, no bare Chakra palette keys.

## Token groups

| Prefix      | Purpose                  | Examples                                                            |
| ----------- | ------------------------ | ------------------------------------------------------------------- |
| `surface.*` | Background layers        | `surface.page`, `surface.card`, `surface.raised`, `surface.darkest` |
| `border.*`  | Border colours           | `border.default`, `border.hover`                                    |
| `text.*`    | Text colours             | `text.primary`, `text.muted`, `text.dim`                            |
| `accent.*`  | Brand accent (teal/blue) | `accent.start`, `accent.end`, `accent.border`, `accent.text`        |
| `brand.*`   | One-off product colours  | `brand.score` (#c9a227), `brand.scoreText` (#111111)                |

## Border radii — use Chakra's built-in scale

No custom radii are defined in the theme. Use Chakra's built-in keys directly:

- `base` (4px) — score badge, source badge, genre tags
- `md` (6px) — refresh button
- `lg` (8px) — cards

**Gotcha:** values in a custom `radii` block must be raw CSS strings (`'0.375rem'`). Referencing another Chakra scale key by name (e.g., `button: 'md'`) silently produces no border radius. Avoid adding custom radii unless a value has no Chakra equivalent.

## Intentional non-token values

Two hardcoded values are deliberate carve-outs:

- `sx={{ '& option': { background: '#1a202c' } }}` on all three `<Select>` controls (Sort, Source, Score) — Chakra semantic tokens cannot resolve inside native CSS `sx` option selectors. `#1a202c` is the hex equivalent of `gray.900`.
- `color="gray.300"` on the Refresh button — pending a decision on whether the button adopts teal (`accent.text`) styling. Not a token yet.
