import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await axios.get('https://www.sputnikmusic.com/reviews/albums', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const $ = cheerio.load(res.data);

    // Find the first row that has a /review/ link
    const link = $('a[href*="/review/"]').first();
    const row = link.closest('tr');
    console.log('ROW HTML:');
    console.log(row.html());

    // Let's print out the structure of the table that contains it
    const parentTable = link.closest('table');
    console.log('\nPARENT TABLE ROWS COUNT:', parentTable.find('tr').length);
  } catch (err) {
    console.error('Error fetching Sputnik:', err);
  }
}

test();
