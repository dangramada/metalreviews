import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://www.angrymetalguy.com/maladie-the-dance-of-tragedies-review/';
  try {
    console.log('Fetching url:', url);
    const response = await axios.get(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    console.log('Status:', response.status);
    const data = response.data;
    console.log('HTML length:', data ? data.length : 'null');
    const $ = cheerio.load(data);

    // Test the normaliseRating logic
    const RATING_MAP = {
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

    function normaliseRating(raw) {
      if (!raw) return null;
      const trimmed = raw.trim();
      const fractionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
      if (fractionMatch) {
        const val = parseFloat(fractionMatch[1]);
        const max = parseFloat(fractionMatch[2]);
        if (max > 0) return (val / max) * 10;
      }
      const numberMatch = trimmed.match(/^\d+(?:\.\d+)?$/);
      if (numberMatch) {
        const num = parseFloat(trimmed);
        return Math.min(Math.max(num, 0), 10);
      }

      const key = Object.keys(RATING_MAP).find((k) => k.toLowerCase() === trimmed.toLowerCase());
      if (key) {
        return RATING_MAP[key];
      }
      return null;
    }

    function extractRating(html) {
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

      // 3️⃣ Look for "Rating:" in text elements (e.g. <strong>Rating:</strong> 3.0/5.0)
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

      return null;
    }

    const score = extractRating(data);
    console.log('Extracted rating score:', score);
  } catch (e) {
    console.error(e);
  }
}

test();
