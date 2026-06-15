import * as cheerio from 'cheerio';

/**
 * Mapping of textual rating descriptors to numeric values on a 0-10 scale.
 */
export const RATING_MAP: Record<string, number> = {
  Sublime: 10.0,
  'Mind-blowing': 9.0,
  Exemplary: 8.0,
  Noteworthy: 7.0,
  Satisfactory: 6.0,
  Unremarkable: 5.0,
  Weak: 4.0,
  Bad: 3.0,
  Awful: 2.0,
  Abysmal: 1.0,
};

/**
 * Normalises a rating string to a numeric value (0-10).
 * @param raw - Raw rating text from the page.
 * @returns Normalised rating or null if not parsable.
 */
function normaliseRating(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  
  // Fractional form e.g. "7.5/10" or "8/10"
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
 * @param html - Full HTML string of the article page.
 * @returns Normalised rating (0-10) or null if not found.
 */
export function extractRating(html: string): number | null {
  if (!html) return null;
  const $ = cheerio.load(html);

  let extracted: number | null = null;
  const ratingWords = Object.keys(RATING_MAP)
    .map((w) => w.replace(/\s+/g, '\\s+'))
    .join('|');
  
  // Matches "Final verdict: X/10", "Final verdict: Word", etc.
  const regex = new RegExp(
    `Final\\s+verdict:\\s*(\\d+(?:\\.\\d+)?\\s*\\/\\s*\\d+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|${ratingWords})`,
    'i'
  );

  // We find elements containing "verdict" or "Verdict" to narrow down search
  $("*").each(function () {
    const text = $(this).text().trim();
    // Clean up internal whitespace/newlines to handle wrapped text smoothly
    const normalizedText = text.replace(/\s+/g, ' ');
    const match = normalizedText.match(regex);
    if (match) {
      const parsed = normaliseRating(match[1]);
      if (parsed !== null) {
        extracted = parsed;
        return false; // break loop
      }
    }
  });

  return extracted;
}
