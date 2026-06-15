import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await axios.get(
      'https://www.sputnikmusic.com/review/90863/Antichrist-Siege-Machine-Promo-MMXXVI/',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    const $ = cheerio.load(res.data);

    console.log('SPUTNIK PAGE DETAILS:');
    console.log('Title tag:', $('title').text().trim());

    // Find all links that point to genre page
    // Let's print out all hrefs containing "genre" or "genres"
    console.log('\nAll links containing genre in href:');
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.toLowerCase().includes('genre')) {
        console.log(`Href: ${href} -> Text: ${$(el).text().trim()}`);
      }
    });

    // Let's print out text from elements that look like they contain metadata
    console.log('\nChecking table cells or divs containing band/album details:');
    // Often there's a header block. Let's look for font tags with color or size
    $('font[size="3"], font[size="4"], font[size="5"]').each((_, el) => {
      console.log(`Font size=${$(el).attr('size')}: "${$(el).text().replace(/\s+/g, ' ').trim()}"`);
    });

    // Search for "styled" text or genre tags in the page body
    console.log('\nSearching for genre keywords in small texts:');
    $('*').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (
        text.length > 5 &&
        text.length < 150 &&
        (text.includes('Metal') ||
          text.includes('Punk') ||
          text.includes('Rock') ||
          text.includes('Hardcore'))
      ) {
        console.log(`<${el.tagName}>: "${text}"`);
      }
    });
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
  }
}

test();
