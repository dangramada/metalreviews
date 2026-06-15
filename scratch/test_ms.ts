import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

async function testAxios() {
  console.log('--- Trying Axios ---');
  const url = 'https://metalstorm.net/pub/review.php?review_id=21299';
  try {
    const { data } = await axios.get(url, {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });
    console.log('Axios succeeded!');
    return data;
  } catch (err: any) {
    console.error('Axios failed:', err.message);
    return null;
  }
}

async function testPuppeteer() {
  console.log('--- Trying Puppeteer ---');
  const url = 'https://metalstorm.net/pub/review.php?review_id=21299';
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await browser.close();
    console.log('Puppeteer succeeded!');
    return content;
  } catch (err: any) {
    console.error('Puppeteer failed:', err.message);
    return null;
  }
}

async function run() {
  let html = await testAxios();
  if (!html) {
    html = await testPuppeteer();
  }
  if (html) {
    const $ = cheerio.load(html);
    const albumRatingDiv = $('.album-rating');
    console.log('album-rating HTML:', albumRatingDiv.html());
    console.log('album-rating Text:', albumRatingDiv.text());

    albumRatingDiv.find('span').each((i, el) => {
      console.log(
        `Span ${i}: class="${$(el).attr('class')}" style="${$(el).attr('style')}" text="${$(el).text()}"`
      );
    });
  }
}

run();
