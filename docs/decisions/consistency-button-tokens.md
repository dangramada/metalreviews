# Button-colour token consistency sweep

## Source

Follow-up to `criteria-calibration-checkpoint-visual-refresh.md`: while fixing that screen's
hardcoded `colorPalette="orange"`, an app-wide audit found one more real instance of the same
pattern (`ErrorBoundary.tsx`) plus several `colorPalette="gray"` hardcodes. Dan: "both!" — fix
the real one and sweep the cosmetic ones.

## What shipped

### `ErrorBoundary.tsx` — real colour fix, not cosmetic

`<Button colorPalette="orange">` → `<Button {...primaryButton}>`.

This was flagged as "visually near-identical" in the checkpoint doc, which turned out to be an
unverified claim (corrected there 2026-09-16): Chakra's stock `orange.500` is `#f97316`; the
app's own `ember.500`, what `primaryButton` resolves to, is `#ff6a1a`. Close, but a real
difference. This button was the one reload/retry action in the entire app rendering a visibly
different orange than every other primary button — the app's one error-recovery screen, ironically
the one place a user is most likely to actually look at the button closely.

### Three live `colorPalette="gray"` buttons → `secondaryButton`

`WorkStatusRow`'s Pause button, `ActionRail`'s three icon rail buttons (Undo/Redo/Restart), and the
Guide carousel's Prev/Next controls (`components/ui/carousel.tsx`) all hardcoded
`colorPalette="gray"` directly instead of the app's exported `secondaryButton = { colorPalette:
'gray' }`. Unlike the orange case, this is a **true no-op** — `secondaryButton` is exactly that one
key, so there is no hex value anywhere that could drift out from under it. The value is future
insurance and matching every other secondary button in the app (`FavoritesPage`, `PauseDialog`,
`MobileRatingLayout`, `CalibrationCheckpoint`), which already all use the token.

### Three `colorPalette="gray"` hits deliberately left alone

Found by the same grep, not touched:

- `password-input.tsx`'s `PasswordStrengthMeter` — the gray sits on a `Box` fill meter, not a
  button; the token doesn't conceptually apply.
- `toggle-tip.tsx`'s `InfoTip` — a ghost-variant icon button, a different visual role than the
  outline secondary buttons `secondaryButton` is used for everywhere else.
- `color-mode.tsx`'s `LightMode`/`DarkMode` — `colorPalette` here sets Chakra's colour-scheme
  context for nested tokens, not a button style at all.

All three are also **dead code**: confirmed via grep that none of `PasswordStrengthMeter`,
`InfoTip`'s consumers (`ProgressLabel`, `data-list.tsx`, `stat.tsx`), or `LightMode`/`DarkMode` are
imported anywhere outside `src/components/ui/` itself. They are Chakra CLI-generated scaffold
snippets, unmodified (still double-quoted, no semicolons — this project's Prettier config uses
neither), never wired into the app. Editing unused vendored scaffold for a zero-behaviour-change
token swap would be pure diff noise on files nobody exercises.

## Verification

- `ErrorBoundary`'s new colour: not re-measured directly (a fresh jsdom render hit the same
  CSS-in-JS parsing limitation `WorkStatusRow.test.tsx` worked around earlier), but `{...primaryButton}`
  on this exact theme was already measured live in the browser for the checkpoint's Continue
  button (`rgb(255, 106, 26)` / `ember.500`) — same spread, same theme, same recipe, so the result
  is the same by construction, not by re-checking.
- The three `secondaryButton` swaps need no visual verification: the token IS the value being
  replaced, so there is nothing that could render differently.
- `npx vitest run`: 344/344, no test asserted on any of these four buttons' `colorPalette`.
- `npx tsc -p tsconfig.app.json --noEmit`: unchanged at 206.

## Not in this branch

- The three dead-code `colorPalette="gray"` hits (see above) — logged as non-issues, not deferred
  work, since fixing dead code has no effect.
