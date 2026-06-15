import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await axios.get('https://metalstorm.net/pub/reviews.php', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const $ = cheerio.load(res.data);

    console.log('METAL STORM REVIEWS HTML PARSE SAMPLE:');

    // Find all links containing "/pub/review.php" (typically reviews are under review.php)
    const reviewLinks = $('a[href*="review.php"]');
    console.log(`Found ${reviewLinks.length} links with "review.php"`);

    reviewLinks.slice(0, 10).each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      const parent = $(el).parent();
      console.log(`\nLink ${i + 1}: href="${href}" text="${text}"`);
      const row = $(el).closest('tr');
      if (row.length > 0) {
        console.log('  Row text preview:', row.text().replace(/\s+/g, ' ').trim().slice(0, 200));
      }
    });
  } catch (err) {
    console.error('Error fetching Metal Storm:', err);
  }
}

test();
