import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await axios.get('https://metalstorm.net/pub/review.php?review_id=21254', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const $ = cheerio.load(res.data);

    console.log('ALBUM RATING HTML:');
    console.log($('.album-rating').html()?.trim());

    console.log('\nALBUM DETAILS / ATTRIBUTES:');
    // Let's print the text of table rows or elements that look like album info.
    // E.g. where the release date, band name, genre is.
    // Let's print the text of elements with class names containing "album" or "info" or similar.
    $('[class*="album-info"], [class*="album-details"], .album_info, .album_details').each(
      (_, el) => {
        console.log(
          `Class: ${$(el).attr('class')} -> Text: ${$(el).text().replace(/\s+/g, ' ').trim()}`
        );
      }
    );

    // Let's find any links on the page that point to genres, e.g. /bands/albums.php?genre_id=... or similar
    console.log('\nLINKS THAT MIGHT BE GENRES:');
    $('a[href*="genre"]').each((_, el) => {
      console.log(`Href: ${$(el).attr('href')} -> Text: ${$(el).text().trim()}`);
    });

    // Alternatively, let's print all links that are in the header/details of the album
    console.log('\nLINKS NEAR ALBUM TITLE:');
    const mainTitle = $('h1').first();
    console.log('H1 Title:', mainTitle.text().trim());
    let parent = mainTitle.parent();
    for (let i = 0; i < 3; i++) {
      console.log(
        `Parent level ${i + 1}: <${parent.prop('tagName')}> class="${parent.attr('class')}"`
      );
      parent.find('a').each((_, a) => {
        console.log(`  Link: href="${$(a).attr('href')}" text="${$(a).text().trim()}"`);
      });
      parent = parent.parent();
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
  }
}

test();
