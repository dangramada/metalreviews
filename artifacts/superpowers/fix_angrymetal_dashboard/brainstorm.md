# Brainstorming: Fix AngryMetal Guy Dashboard and Tests

## Goal

- Resolve the TypeScript/Babel compilation error in `src/App.tsx` (missing closing brace in `Review` interface).
- Fix the failing test `maps textual rating to numeric` in `src/__tests__/angrymetal.test.js`.
- Ensure the Vitest test suite passes completely and the dashboard renders without runtime errors.

## Constraints & Risks

- Windows OS environment.
- ESM module system (`"type": "module"`).
- Web scraping selectors must not match arbitrary text inside the article to avoid false positives (e.g. mapping the word "Good" inside a random sentence to the album's rating).

## Approaches

### Approach A: Fix the test input to include the class selector (Recommended)

Wrap the textual rating in the test html with a class element: `<div class="rating">Excellent</div>`.

- **Pros**: Matches the actual scraper logic which looks for `.rating`, `.review-score`, `.post-rating` classes, preventing false-positive matches on ordinary body text.
- **Cons**: Requires modifying the test file (though the test was likely meant to use this).

### Approach B: Broaden the scraper's selectors to search all elements

Modify `extractRating` in `src/scraper/angrymetal.js` to search all divs or paragraphs for rating words.

- **Pros**: Keeps the test HTML unchanged.
- **Cons**: Extremely high risk of false positives (e.g., matching a review sentence saying "This is not an Excellent album" as a rating of 4.5).

We recommend **Approach A**.
