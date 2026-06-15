import Parser from 'rss-parser';

async function test() {
  const parser = new Parser({
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  try {
    const feed = await parser.parseURL('https://metalstorm.net/rss/reviews.xml');
    console.log('RAW ITEM KEYS:', Object.keys(feed.items[0]));
    console.log('RAW ITEM 1:', JSON.stringify(feed.items[0], null, 2));
  } catch (err) {
    console.error('Error fetching feed:', err);
  }
}

test();
