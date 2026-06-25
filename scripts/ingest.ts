import RSSParser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import puppeteer from 'puppeteer';
import { MetalReview } from '../src/types';
import { extractRating } from '../src/scraper/angrymetal.js';
import { extractRating as extractPSRating } from '../src/scraper/progressivesubway';
import { extractRating as extractMSRating } from '../src/scraper/metalstorm';
import { supabase } from './supabaseClient';
import { fromDbRow, type DbRow } from '../src/dbMapping';
import { lookupMusicBrainz } from './musicbrainz';

export type { DbRow };

export function toDbRow(r: MetalReview): DbRow {
  return {
    id: r.id,
    band: r.band,
    album: r.album,
    source: r.source,
    score: r.score,
    normalized_score: r.normalizedScore,
    summary: r.summary,
    url: r.url,
    published_at: r.publishedAt,
    published_date: r.publishedDate,
    artwork_url: r.artworkUrl,
    release_date: r.releaseDate,
    genre: r.genre,
  };
}

interface RawReview {
  source: string;
  band: string;
  album: string;
  genre: string[];
  score: string;
  summary: string;
  url: string;
  publishedAt: Date;
  artworkUrl: string | null;
}

const parser = new RSSParser();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAngryMetalGuyRating(reviewUrl: string): Promise<number | null> {
  try {
    const { data } = await axios.get(reviewUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    return extractRating(data);
  } catch (e) {
    console.warn(`Failed to fetch Angry Metal Guy rating for ${reviewUrl}:`, e);
    return null;
  }
}

// ratingAlreadyFetched: IDs of reviews already in Supabase with a non-empty score.
// Skipping known reviews avoids one HTTP request per review page on every refresh.
async function fetchAngryMetalGuy(
  ratingAlreadyFetched: Set<string>,
  existingById: Map<string, MetalReview>
): Promise<RawReview[]> {
  const feed = await parser.parseURL('https://www.angrymetalguy.com/feed/');
  const reviews = await Promise.all(
    feed.items.map(async (item) => {
      // AMG RSS titles are formatted "Band – Album Review" or "Band – Album EP Review".
      // Strip the trailing suffix before parsing so the stored album name is clean.
      const rawTitle = (item.title ?? '').replace(/\s+(EP\s+)?Review$/i, '').trim();
      const [band, album] = extractBandAlbum(rawTitle);
      const url = item.link ?? '';
      const id = computeId(band.trim() || 'Unknown Band', album.trim() || 'Unknown Album');
      let score: string;
      if (ratingAlreadyFetched.has(id)) {
        // Review already scored — reuse stored value, skip the HTTP fetch.
        score = existingById.get(id)?.score ?? '';
      } else {
        const rating = await fetchAngryMetalGuyRating(url);
        score = rating !== null ? `${rating}/10` : '';
      }
      return {
        source: 'Angry Metal Guy',
        band,
        album,
        genre: [],
        score,
        summary: item.contentSnippet ?? '',
        url,
        publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
        artworkUrl: null,
      };
    })
  );
  return reviews;
}

async function fetchProgressiveSubwayRating(item: any): Promise<number | null> {
  const encodedContent = item['content:encoded'] || '';
  if (encodedContent) {
    const rating = extractPSRating(encodedContent);
    if (rating !== null) {
      return rating;
    }
  }

  const url = item.link ?? '';
  if (!url) return null;
  try {
    const { data } = await axios.get(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    return extractPSRating(data);
  } catch (e) {
    console.warn(`Failed to fetch The Progressive Subway rating for ${url}:`, e);
    return null;
  }
}

// Same skip logic as fetchAngryMetalGuy — avoids re-fetching pages for known reviews.
async function fetchProgressiveSubway(
  ratingAlreadyFetched: Set<string>,
  existingById: Map<string, MetalReview>
): Promise<RawReview[]> {
  const feed = await parser.parseURL('https://theprogressivesubway.com/feed');
  const reviews = await Promise.all(
    feed.items.map(async (item) => {
      // PS RSS titles are formatted "Review: Band – Album". Strip the "Review: " prefix
      // before parsing so the band name stored in JSON (and used for MB search) is clean.
      const rawTitle = (item.title ?? '').replace(/^Review:\s*/i, '');
      const [band, album] = extractBandAlbum(rawTitle);
      const url = item.link ?? '';
      const id = computeId(band.trim() || 'Unknown Band', album.trim() || 'Unknown Album');
      let score: string;
      if (ratingAlreadyFetched.has(id)) {
        // Review already scored — reuse stored value, skip the HTTP fetch.
        score = existingById.get(id)?.score ?? '';
      } else {
        const rating = await fetchProgressiveSubwayRating(item);
        score = rating !== null ? `${rating}/10` : '';
      }
      return {
        source: 'The Progressive Subway',
        band,
        album,
        genre: [],
        score,
        summary: item.contentSnippet ?? '',
        url,
        publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
        artworkUrl: null,
      };
    })
  );
  return reviews;
}

// Metal Storm scores require JS rendering, so Puppeteer is used instead of axios+cheerio.
// Puppeteer launch is expensive (~3-5s) — we skip it entirely when all feed items are
// already scored, which is the common case on a warm refresh.
async function fetchMetalStorm(
  ratingAlreadyFetched: Set<string>,
  existingById: Map<string, MetalReview>
): Promise<RawReview[]> {
  const feed = await parser.parseURL('https://metalstorm.net/rss/reviews.xml');

  // Pre-compute IDs for all feed items so we can check the skip set before launching Puppeteer.
  const itemsWithMeta = feed.items.map((item) => {
    const [band, album] = extractBandAlbum(item.title ?? '', '–');
    const id = computeId(band.trim() || 'Unknown Band', album.trim() || 'Unknown Album');
    return { item, band, album, id };
  });

  // Only the subset of items not yet in Supabase need Puppeteer page loads.
  const needsFetch = itemsWithMeta.filter(({ id }) => !ratingAlreadyFetched.has(id));
  const scoreMap = new Map<string, string>(); // id -> fetched score string

  if (needsFetch.length > 0) {
    // Launch a single browser shared across all new review pages to minimise overhead.
    let browser;
    try {
      browser = await puppeteer.launch({ headless: true });
      try {
        await Promise.all(
          needsFetch.map(async ({ id, item }) => {
            const rating = await fetchMetalStormRating(browser!, item.link ?? '');
            scoreMap.set(id, rating !== null ? `${rating}/10` : '');
          })
        );
      } finally {
        await browser.close();
      }
    } catch (e) {
      // If Puppeteer fails to launch, skip new reviews but still return known ones below.
      console.warn(
        'Failed to launch Puppeteer for Metal Storm, skipping new Metal Storm reviews:',
        e
      );
    }
  }

  // Merge: known reviews get their stored score, new ones get the Puppeteer-fetched score.
  return itemsWithMeta.map(({ item, band, album, id }) => ({
    source: 'Metal Storm',
    band,
    album,
    genre: [],
    score: ratingAlreadyFetched.has(id)
      ? (existingById.get(id)?.score ?? '')
      : (scoreMap.get(id) ?? ''),
    summary: item.contentSnippet ?? '',
    url: item.link ?? '',
    publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
    artworkUrl: null,
  }));
}

async function fetchSputnik(): Promise<RawReview[]> {
  // SputnikMusic currently blocks scraping; returning empty list.
  console.warn('Skipping SputnikMusic source due to inaccessible page.');
  return [];
}

function extractBandAlbum(title: string): [string, string] {
  const delimiters = [' - ', ' – ', ' — ', ': ', '-', '–', '—', ':'];
  for (const delim of delimiters) {
    if (title.includes(delim)) {
      const parts = title.split(delim).map((p) => p.trim());
      if (parts.length >= 2) {
        return [parts[0], parts.slice(1).join(' ')];
      }
    }
  }
  const regex = /^(.*?)\s*[-–—:]\s*(.*)$/;
  const match = title.match(regex);
  if (match) {
    return [match[1].trim(), match[2].trim()];
  }
  return ['', ''];
}

function extractScore(content: string): string {
  const match = content.match(/([0-9]+(?:\.[0-9]+)\s*(?:\/\s*[0-9]+)?%?)/);
  return match ? match[1] : '';
}

async function fetchMetalStormRating(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  reviewUrl: string
): Promise<number | null> {
  if (!reviewUrl) return null;
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    try {
      await page.waitForSelector('.album-rating span.bold[style*="color:#eebb00"]', {
        timeout: 7000,
      });
    } catch {
      // Selector never appeared — score may not exist yet (too few votes) or
      // the page was unusually slow. Fall through and let extractMSRating's
      // fallback tiers + null-return handle it. Not a loggable error.
    }
    const html = await page.content();
    return extractMSRating(html);
  } catch (e) {
    console.warn(`Failed to fetch Metal Storm rating for ${reviewUrl}:`, e);
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

function normalizeScore(raw: string): number {
  // Convert various formats to a 0-100 scale.
  if (!raw) return 0;
  // Percentages
  if (raw.includes('%')) {
    const num = parseFloat(raw.replace('%', '').trim());
    return num;
  }
  // X/5, X/10 etc.
  const slashMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+)/);
  if (slashMatch) {
    const val = parseFloat(slashMatch[1]);
    const max = parseFloat(slashMatch[2]);
    return (val / max) * 100;
  }
  // Plain number (assume out of 10)
  const num = parseFloat(raw);
  if (!isNaN(num)) {
    return (num / 10) * 100;
  }
  return 0;
}


function computeId(band: string, album: string): string {
  const key = `${band.toLowerCase().replace(/\s+/g, '')}_${album.toLowerCase().replace(/\s+/g, '')}`;
  // Simple hash – we'll just use base64 of the key.
  return Buffer.from(key).toString('base64');
}

// Returns a precision rank so the merge guard can avoid downgrading an existing
// precise date with a less-precise fresh one. MB dates can be "2024", "2024-03",
// or "2024-03-15" — all valid, but not equally useful.
function releaseDatePrecision(d: string | null): number {
  if (!d) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return 3; // full date
  if (/^\d{4}-\d{2}$/.test(d)) return 2; // year-month
  if (/^\d{4}$/.test(d)) return 1; // year only
  return 0; // unrecognized format — treat as no info
}

// Returns existing reviews that need a MB backfill retry this run.
// A row is a candidate when: not already refreshed by the RSS loop (not in finalIds),
// missing at least one MB field, and not past the retry cap.
// Cap: skip permanently when attempts >= 5 AND review is older than 14 days —
// the age bound is the binding constraint in practice (see docs/decisions/release-date.md).
export function selectBackfillCandidates(
  existingReviews: MetalReview[],
  finalIds: Set<string>,
  mbAttemptsById: Map<string, number>,
  now: Date
): MetalReview[] {
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  return existingReviews.filter((r) => {
    if (finalIds.has(r.id)) return false;
    const mbComplete =
      typeof r.artworkUrl === 'string' && r.genre.length > 0 && typeof r.releaseDate === 'string';
    if (mbComplete) return false;
    const attempts = mbAttemptsById.get(r.id) ?? 0;
    const tooOld = new Date(r.publishedAt) < fourteenDaysAgo;
    if (attempts >= 5 && tooOld) return false;
    return true;
  });
}

export function applyMergeGuard(
  existingById: Map<string, MetalReview>,
  freshReviews: MetalReview[]
): MetalReview[] {
  const merged = new Map(existingById);
  for (const review of freshReviews) {
    const existing = merged.get(review.id);
    merged.set(review.id, {
      ...existing,
      ...review,
      artworkUrl: review.artworkUrl ?? existing?.artworkUrl ?? null,
      genre: review.genre && review.genre.length > 0 ? review.genre : (existing?.genre ?? []),
      // Precision-aware: keep existing if it's more precise than the fresh value.
      // Differs from artworkUrl/genre rules — do not replace with the simpler pattern.
      releaseDate:
        releaseDatePrecision(review.releaseDate) >=
        releaseDatePrecision(existing?.releaseDate ?? null)
          ? review.releaseDate
          : (existing?.releaseDate ?? null),
    });
  }
  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export async function runIngestion() {
  // Fetch all existing rows from Supabase to build skip-sets and the merge map.
  // A read failure is non-fatal — we start fresh rather than aborting the entire run.
  let existingReviews: MetalReview[] = [];
  let mbAttemptsById = new Map<string, number>();
  try {
    const { data, error } = await supabase.from('reviews').select('*');
    if (error) throw error;
    // Extract attempt counts before fromDbRow discards the field (not part of MetalReview).
    mbAttemptsById = new Map(
      (data as DbRow[]).map((row) => [row.id, row.mb_lookup_attempts ?? 0])
    );
    existingReviews = (data ?? []).map(fromDbRow);
  } catch (e) {
    console.warn('Failed to fetch existing reviews from Supabase, starting fresh:', e);
  }

  // Map for O(1) lookups when reusing stored scores and artwork URLs.
  const existingById = new Map(existingReviews.map((r) => [r.id, r]));

  // Reviews with a non-empty score don't need their rating page re-fetched.
  const ratingAlreadyFetched = new Set(
    existingReviews.filter((r) => r.score && r.score !== '').map((r) => r.id)
  );

  // Skip MusicBrainz only when artwork is a real URL (non-null string) AND genres are
  // non-empty. Using typeof === 'string' rather than !== undefined/null so that reviews
  // with artworkUrl: null (MB was tried but CAA returned nothing) are retried — CAA
  // coverage improves over time and null is not a permanent signal.
  const mbAlreadyFetched = new Set(
    existingReviews
      .filter(
        (r) =>
          typeof r.artworkUrl === 'string' &&
          Array.isArray(r.genre) &&
          r.genre.length > 0 &&
          typeof r.releaseDate === 'string'
      )
      .map((r) => r.id)
  );

  // All three source fetchers run in parallel. Each skips HTTP calls for known reviews.
  const [amg, ps, ms, sp] = await Promise.all([
    fetchAngryMetalGuy(ratingAlreadyFetched, existingById),
    fetchProgressiveSubway(ratingAlreadyFetched, existingById),
    fetchMetalStorm(ratingAlreadyFetched, existingById),
    fetchSputnik(),
  ]);
  const allRaw = [...amg, ...ps, ...ms, ...sp];
  const final: MetalReview[] = [];

  for (const r of allRaw) {
    const band = r.band.trim() || 'Unknown Band';
    const album = r.album.trim() || 'Unknown Album';
    const id = computeId(band, album);
    const publishedDate = new Date(r.publishedAt).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    let artworkUrl: string | null;
    let genres: string[];
    let releaseDate: string | null;
    if (mbAlreadyFetched.has(id)) {
      // artwork, genres, and releaseDate are all already stored — reuse them.
      // MusicBrainz enforces 1 req/sec; skipping known reviews keeps warm runs fast.
      artworkUrl = existingById.get(id)?.artworkUrl ?? null;
      genres = existingById.get(id)?.genre ?? [];
      releaseDate = existingById.get(id)?.releaseDate ?? null;
    } else {
      const mbData = await lookupMusicBrainz(band, album);
      artworkUrl = mbData.artworkUrl;
      genres = mbData.genres;
      releaseDate = mbData.releaseDate;
      await sleep(1000); // MB rate limit: gap between the last request in this review and the first of the next
    }
    final.push({
      id,
      source: r.source,
      band,
      album,
      genre: genres,
      score: r.score,
      normalizedScore: normalizeScore(r.score),
      summary: r.summary,
      url: r.url,
      publishedAt: r.publishedAt as unknown as string,
      publishedDate,
      artworkUrl,
      releaseDate,
    });
  }

  // Backfill pass: retry MB for reviews that have aged off the RSS window.
  // The main loop above only calls lookupMusicBrainz for reviews currently in allRaw.
  // Reviews older than the feed's rolling window never appear there, so any MB fields
  // that were null on first ingest (e.g. MB hadn't indexed the release yet) stay null
  // forever without this second pass.
  const finalIds = new Set(final.map((r) => r.id));
  const backfilledIds = new Set<string>();
  const candidates = selectBackfillCandidates(existingReviews, finalIds, mbAttemptsById, new Date());
  for (const r of candidates) {
    const mbData = await lookupMusicBrainz(r.band, r.album);
    backfilledIds.add(r.id);
    final.push({
      ...r,
      artworkUrl: mbData.artworkUrl ?? r.artworkUrl,
      genre: mbData.genres.length > 0 ? mbData.genres : r.genre,
      releaseDate: mbData.releaseDate ?? r.releaseDate,
    });
    await sleep(1000);
  }

  const output = applyMergeGuard(existingById, final);

  const { error: upsertError } = await supabase
    .from('reviews')
    .upsert(
      output.map((r) => ({
        ...toDbRow(r),
        // Increment only for backfill-path retries; RSS-path rows keep their existing count.
        // New rows not yet in existingById fall back to 0, which is correct.
        mb_lookup_attempts: backfilledIds.has(r.id)
          ? (mbAttemptsById.get(r.id) ?? 0) + 1
          : (mbAttemptsById.get(r.id) ?? 0),
      })),
      { onConflict: 'id' }
    );
  if (upsertError) {
    throw new Error(`Failed to upsert reviews to Supabase: ${upsertError.message}`);
  }
  console.log('✅ Ingestion completed, upserted', output.length, 'reviews to Supabase');
}
