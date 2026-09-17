// Read-only parity check for metalstorm-ingest-memory-fix (see
// docs/decisions/metalstorm-ingest-memory-fix.md, "Live parity check").
// Fetches each current RSS review URL with resource blocking off (original launch
// options) and on (launchMetalStormBrowser), one page at a time with pauses, and records
// the main-document HTTP status so Cloudflare 403 challenge pages are excluded — those
// yield null in both modes and would otherwise count as false matches.
// Run: npx tsx scratch/check_metalstorm_blocking_parity.mts
import puppeteer, { type Browser } from 'puppeteer';
import RSSParser from 'rss-parser';
import {
  fetchMetalStormRating,
  launchMetalStormBrowser,
  closeBrowserWithTimeout,
} from '../scripts/ingest.ts';

const PAUSE_MS = 4000;
const MAX_URLS = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusByUrl = new Map<string, number>();

function trackDocumentStatus(browser: Browser) {
  browser.on('targetcreated', async (target) => {
    const page = await target.page();
    if (!page) return;
    page.on('response', (res) => {
      if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) {
        statusByUrl.set(res.url(), res.status());
      }
    });
  });
}

const feed = await new RSSParser().parseURL('https://metalstorm.net/rss/reviews.xml');
const urls = feed.items
  .map((i) => i.link ?? '')
  .filter(Boolean)
  .slice(0, MAX_URLS);

const offBrowser = await puppeteer.launch({ headless: true });
const onBrowser = await launchMetalStormBrowser();
trackDocumentStatus(offBrowser);
trackDocumentStatus(onBrowser);

let valid = 0;
let matches = 0;
let nonNull = 0;
let consecutiveBlocked = 0;
for (const url of urls) {
  statusByUrl.delete(url);
  const { rating: off, outcome: offOutcome } = await fetchMetalStormRating(offBrowser, url, {
    blockResources: false,
  });
  const offStatus = statusByUrl.get(url);
  statusByUrl.delete(url);
  await sleep(PAUSE_MS);
  const { rating: on, outcome: onOutcome } = await fetchMetalStormRating(onBrowser, url);
  const onStatus = statusByUrl.get(url);

  const isValid = offStatus === 200 && onStatus === 200;
  if (isValid) {
    valid++;
    consecutiveBlocked = 0;
    if (off === on) matches++;
    if (off !== null) nonNull++;
  } else {
    consecutiveBlocked++;
  }
  const label = !isValid ? 'BLOCKED ' : off === on ? 'MATCH   ' : 'MISMATCH';
  console.log(
    `${label} off=${off}(${offStatus}, ${offOutcome}) on=${on}(${onStatus}, ${onOutcome}) ${url}`
  );
  // Hammering a challenged IP only extends the block.
  if (consecutiveBlocked >= 2) {
    console.log('Two consecutive blocked pages — stopping.');
    break;
  }
  await sleep(PAUSE_MS);
}

await offBrowser.close();
await closeBrowserWithTimeout(onBrowser);
console.log(`\nvalid pairs=${valid}  matches=${matches}  non-null valid pairs=${nonNull}`);
process.exit(0);
