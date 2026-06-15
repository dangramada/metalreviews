# Implementation Plan - Fix AngryMetal Dashboard and Tests

This plan details the steps to fix the syntax error in `src/App.tsx` and the failing test in `src/__tests__/angrymetal.test.js`.

## Proposed Changes

### Dashboard Component

#### [MODIFY] [App.tsx](file:///j:/Scraper/src/App.tsx)

- Add the missing closing brace `}` to the `Review` interface (around line 31).

### Test Suite

#### [MODIFY] [angrymetal.test.js](file:///j:/Scraper/src/__tests__/angrymetal.test.js)

- Update the HTML string in the test `maps textual rating to numeric` to include the `rating` class: `<div class="rating">Excellent</div>`.

## Verification Plan

### Automated Tests

- Run `npm run test` to verify all Vitest tests pass.
- Run `npm run type-check` (if applicable) or `npm run build` to verify compiling works.

### Manual Verification

- Start the dev server with `npm run dev` and check that the dashboard displays the reviews without errors.
