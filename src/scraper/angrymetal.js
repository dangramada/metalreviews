// src/scraper/angrymetal.js

/**
 * Mapping of textual rating descriptors to numeric values on a 0‑10 scale.
 */
export const RATING_MAP = {
  Iconic: 10.0,
  Excellent: 9.0,
  Great: 8.0,
  'Very Good': 7.0,
  Good: 6.0,
  Mixed: 5.0,
  Disappointing: 4.0,
  Bad: 3.0,
  Embarrassing: 2.0,
  Unlistenable: 1.0,
};

import * as cheerio from 'cheerio';

/**
 * Normalises a rating string to a numeric value (0‑10).
 * @param {string} raw - Raw rating text from the page.
 * @returns {number|null} Normalised rating or null if not parsable.
 */
function normaliseRating(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Fractional form e.g. "3.0/5.0" or "8.5/10"
  const fractionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const val = parseFloat(fractionMatch[1]);
    const max = parseFloat(fractionMatch[2]);
    if (max > 0) {
      return (val / max) * 10;
    }
  }
  // Simple numeric e.g. "8.5" or "7"
  const numberMatch = trimmed.match(/^\d+(?:\.\d+)?$/);
  if (numberMatch) {
    const num = parseFloat(trimmed);
    return Math.min(Math.max(num, 0), 10);
  }
  // Textual descriptor (case-insensitive lookup)
  const key = Object.keys(RATING_MAP).find((k) => k.toLowerCase() === trimmed.toLowerCase());
  if (key) {
    return RATING_MAP[key];
  }
  return null;
}

/**
 * Extracts the rating from the article HTML.
 * The function attempts a few common selectors used by Angry Metal Guy.
 * @param {string} html - Full HTML string of the article page.
 * @returns {number|null} Normalised rating (0‑10) or null if not found.
 */
export function extractRating(html) {
  const $ = cheerio.load(html);

  // 1️⃣ Look for a meta tag with name="rating"
  const metaRating = $("meta[name='rating']").attr('content');
  if (metaRating) return normaliseRating(metaRating);

  // 2️⃣ Look for a span or div with a class that looks like rating
  const ratingText = $('.rating, .review-score, .post-rating').first().text();
  if (ratingText) {
    const result = normaliseRating(ratingText);
    if (result !== null) return result;
  }

  // 3️⃣ Look for "Rating:" in text elements (e.g. <strong>Rating:</strong> 3.0/5.0 or <strong>Rating:</strong> Great)
  let extracted = null;
  const ratingWords = Object.keys(RATING_MAP)
    .map((w) => w.replace(/\s+/g, '\\s+'))
    .join('|');
  const regex = new RegExp(
    `Rating:\\s*(\\d+(?:\\.\\d+)?\\s*\\/\\s*\\d+(?:\\.\\d+)?|${ratingWords})`,
    'i'
  );

  $("*:contains('Rating:')").each(function () {
    const text = $(this).text().trim();
    const match = text.match(regex);
    if (match) {
      extracted = normaliseRating(match[1]);
      return false; // break loop
    }
  });
  if (extracted !== null) return extracted;

  // 4️⃣ Some reviews embed the rating in a <strong> tag after the word "Rating"
  const strongAfterLabel = $("*:contains('Rating')")
    .filter(function () {
      return $(this).text().trim().startsWith('Rating');
    })
    .first()
    .next('strong')
    .text();
  if (strongAfterLabel) return normaliseRating(strongAfterLabel);

  // No rating found
  return null;
}
