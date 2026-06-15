// src/scraper/metalstorm.ts
import * as cheerio from 'cheerio';

/**
 * Extracts the user rating from a Metal Storm review page HTML.
 *
 * The rating lives inside `div.album-rating` and has two scores:
 *   - Reviewer score: `span.megatitle` (may be "N/A")
 *   - User score:     `span.bold[style*="color:#eebb00"]`
 *
 * We target the **user score** as requested.
 * Metal Storm uses a 1–10 scale with decimals (e.g. 7.3).
 * The decimal value is preserved as-is.
 *
 * @param html - Full HTML string of the review page.
 * @returns The numeric user rating (e.g. 8.0, 7.3) or null if not found.
 */
export function extractRating(html: string): number | null {
  if (!html) return null;

  const $ = cheerio.load(html);
  const albumRatingDiv = $('.album-rating');

  if (albumRatingDiv.length === 0) return null;

  // Primary selector: span.bold with the characteristic gold colour
  const userScoreSpan = albumRatingDiv.find('span.bold[style*="color:#eebb00"]');
  if (userScoreSpan.length > 0) {
    const text = userScoreSpan.text().trim();
    const num = parseFloat(text);
    if (!isNaN(num) && num >= 0 && num <= 10) {
      return num;
    }
  }

  // Fallback: any span.bold inside .album-rating that contains a number
  const fallbackSpan = albumRatingDiv.find('span.bold');
  if (fallbackSpan.length > 0) {
    const text = fallbackSpan.text().trim();
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const num = parseFloat(match[1]);
      if (num >= 0 && num <= 10) {
        return num;
      }
    }
  }

  // Last resort: look for any number in the album-rating div text
  const fullText = albumRatingDiv.text();
  const numbers = fullText.match(/\d+\.\d+/g);
  if (numbers) {
    // Pick the last decimal number (user score typically comes after reviewer)
    const last = parseFloat(numbers[numbers.length - 1]);
    if (last >= 0 && last <= 10) {
      return last;
    }
  }

  return null;
}
