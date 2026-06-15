import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const url =
    'https://theprogressivesubway.com/2026/06/13/review-junon-the-golden-citadel-of-the-astral-sphere/';
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const $ = cheerio.load(data);

    // Find all occurrences of the word "Verdict"
    console.log("Searching for 'verdict' or 'Final verdict' in HTML text...");
    $('*').each(function () {
      const text = $(this).text().trim();
      if (text.toLowerCase().includes('final verdict') && text.length < 200) {
        console.log(`Tag <${this.tagName}>: "${text}"`);
      }
    });
  } catch (err) {
    console.error(err);
  }
}

run();
