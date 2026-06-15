# Code Commenting Style Guide

## Core principle

Explain **WHY**, not what. The code already shows what it does — comments exist for intent, constraints, and non-obvious decisions.

## What to comment

| Comment this                                  | Skip this                                  |
| --------------------------------------------- | ------------------------------------------ |
| Non-obvious logic or algorithm choices        | Code that reads naturally from names alone |
| API quirks, rate limits, external constraints | Restating what the next line does          |
| Workarounds and the reason they exist         | Obvious default values                     |
| Regex patterns (what they match and why)      | Self-evident JSX structure                 |
| CSS tricks that look wrong but aren't         | Standard library calls                     |

---

## File-level header

Every significant file gets a block comment at the top explaining:

- What the file is for
- Why it exists (its role in the larger system)
- High-level flow (numbered steps if sequential)

```ts
// src/scraper/angrymetal.js
//
// Extracts the numeric rating from a single Angry Metal Guy review page.
//
// AMG doesn't put ratings in their RSS feed, so we fetch each review page
// and scrape the score out of the HTML. The catch: AMG has redesigned its
// site over the years, so ratings appear in several different places depending
// on when the review was published. This file tries each known location in
// turn until it finds one that works.
```

---

## Functions

One JSDoc comment per exported or non-trivial function:

- What it takes in and what it returns
- Any non-obvious behaviour, side effects, or constraints
- Skip `@param` / `@returns` tags — prose is clearer

```ts
/**
 * Converts a raw rating string into a 0–10 number.
 * Takes the text extracted from the "Final verdict:" line, returns a number or null.
 *
 * Handles three formats:
 *   "7.5/10" → scaled to 0–10
 *   "8.5"    → used as-is
 *   "Exemplary" → looked up in RATING_MAP
 */
function normaliseRating(raw: string): number | null {
```

---

## Inline comments

Use inline comments for lines that would surprise a reader. Place them on the line above (preferred) or at the end of the line if short.

```ts
// Returning false from a cheerio .each() breaks out of the loop — not a function return
return false;

overflow: 'hidden', // Required — clips the artwork image to the card's rounded corners

// Collapse any run of whitespace to a single space.
// The verdict line can span multiple HTML elements, mangling .text() output.
const normalizedText = text.replace(/\s+/g, ' ');
```

---

## Regex — always comment

Explain what the pattern matches and why it's written that way:

```ts
// Matches "value/max" fractions (e.g. "8.5/10", "4/5").
// The regex captures both sides of the slash as separate groups.
const slashMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+)/);

// Anchored with ^ and $ so it only matches isolated score values like "8.5",
// not full sentences that happen to contain a number.
const fractionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
```

---

## Workarounds — always explain

Name the problem, then the fix:

```ts
// We deliberately do NOT use Chakra's `isLoaded` prop — that would instantly
// remove the skeleton from the DOM, skipping the CSS fade transition.
// Instead we keep it in place and fade it out via `opacity`.
// `pointerEvents="none"` prevents the invisible element from blocking clicks.
<Skeleton opacity={loaded ? 0 : 1} pointerEvents="none" />

// Button does NOT spread controlStyle — Chakra v2's `variant="outline"` conflicts
// with an explicit `bg` prop, causing the border to not contain its background.
// Border is applied manually via border="1px solid" + borderColor instead.
```

---

## Section headers

Use section headers inside long files to separate logical blocks:

```ts
// =============================================================================
// FILTERING, SEARCHING, AND SORTING
// =============================================================================
```

---

## Legacy / intentionally unused code

Flag it explicitly so it doesn't look like a bug:

```ts
genre: string[]; // Always [] — genre extraction is not yet implemented

isDoublePositive?: boolean; // Legacy field — feature was removed, kept so old
                            // reviews.json entries don't fail to parse
```

---

## Bad vs good examples

**Bad** — restates the code:

```ts
// loop through reviews
for (const review of final) {
```

**Good** — explains intent and behaviour:

```ts
// Upsert each freshly-fetched review into the existing data map.
// If a review with the same ID already exists, the new version wins —
// this keeps scores and summaries current if a review is re-fetched.
for (const review of final) {
```

---

**Bad** — vague:

```ts
// fix for Chakra bug
border = '1px solid';
```

**Good** — names the specific constraint:

```ts
// Chakra v2's variant="outline" conflicts with an explicit bg prop —
// the border stops containing its background. Explicit border sidesteps this.
border = '1px solid';
```
