import { randomUUID } from 'node:crypto';
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
import { lookupMusicBrainz, type MusicBrainzData } from './musicbrainz';
import { computeNormKey } from './normalizeKey';

interface RawReview {
  source: string;
  band: string;
  album: string;
  score: string;
  summary: string;
  url: string;
  publishedAt: Date;
}

// Mirrors the real, current `reviews` table columns (post album-identity migration:
// artwork_url/genre/release_date dropped, album_id added).
interface ExistingReviewRow {
  id: string;
  band: string;
  album: string;
  source: string;
  score: string | null;
  normalized_score: number | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  published_date: string | null;
  album_id: string;
  mb_lookup_attempts: number | null;
}

interface ReviewWriteRow {
  id: string;
  band: string;
  album: string;
  source: string;
  score: string | null;
  normalized_score: number | null;
  summary: string;
  url: string;
  published_at: string;
  published_date: string;
  album_id: string;
  mb_lookup_attempts: number;
}

// Mirrors the `albums` table (see supabase/albums.sql). created_by/created_at are
// intentionally omitted — this pipeline never sets them (defaults handle inserts;
// existing values must survive updates untouched, see the upsert note below).
export interface AlbumRow {
  id: string;
  band: string;
  album: string;
  mb_release_group_id: string | null;
  norm_key: string;
  artwork_url: string | null;
  genre: string[];
  release_date: string | null;
}

const parser = new RSSParser();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Per-source RSS <category> tag that marks a genuine single-album review post.
// Confirmed by direct feed inspection (docs/decisions/unknown-band-collision-audit.md,
// docs/decisions/roundup-skip-fix.md) — WordPress RSS feeds emit both taxonomy
// categories and post tags as <category> elements, so this is a substring match
// against item.categories, not a distinct "categories-only" field.
const REVIEW_CATEGORY_TAGS: Record<string, string[]> = {
  'Angry Metal Guy': ['Reviews', 'Review'],
  'The Progressive Subway': ['Album Reviews'],
};

// Franchises that are genuine reviews but are filed under their own category
// instead of the source's review tag, so they'd otherwise be false-negatived
// by isGenuineReview. Deliberately a short, audit-confirmed list — do not add
// speculative entries here (see roundup-skip-fix.md "judgment call flagged").
const ALLOWLISTED_FRANCHISE_CATEGORIES: Record<string, string[]> = {
  'Angry Metal Guy': ["Angry Metal Guy's Unsigned Band Rodeo"],
};

export function isGenuineReview(item: { categories?: string[] }, source: string): boolean {
  const tags = REVIEW_CATEGORY_TAGS[source];
  if (!tags) return true; // no tag check configured for this source (e.g. Metal Storm)
  const categories = item.categories ?? [];
  return tags.some((tag) => categories.includes(tag));
}

export function isAllowlistedFranchise(item: { categories?: string[] }, source: string): boolean {
  const franchises = ALLOWLISTED_FRANCHISE_CATEGORIES[source];
  if (!franchises) return false;
  const categories = item.categories ?? [];
  return franchises.some((name) => categories.includes(name));
}

// Logs a filtered-out (non-review) post for later manual review. Never throws —
// a logging failure must not block real review ingestion (matches the existing
// pattern of swallowing Supabase read/write failures elsewhere in this file).
//
// Dedups on `url` before inserting: every ingest run re-parses the full RSS feed
// window, so the same skipped post (e.g. a roundup still within the feed's
// retention window) would otherwise get a fresh row logged on every single run.
// Confirmed via live data — 40 rows accumulated from just 12 runs across two
// debugging sessions. This is a log for manual review, not a "last seen"
// tracker, so an existing row is left untouched rather than updated.
export async function logSkippedPost(
  source: string,
  item: { title?: string; link?: string; isoDate?: string; pubDate?: string },
  reason = 'non_review_category'
): Promise<void> {
  const url = item.link ?? '';
  try {
    // count: 'exact' + head: true → a COUNT(*) query; returns null when 0 rows,
    // and doesn't throw on multiple matches unlike .maybeSingle().
    const { count, error: lookupError } = await supabase
      .from('skipped_posts')
      .select('*', { count: 'exact', head: true })
      .eq('url', url);
    if (lookupError) throw lookupError;
    if (count && count > 0) return;

    const { error } = await supabase.from('skipped_posts').insert({
      source,
      title: item.title ?? '',
      url,
      published_at: item.isoDate ?? item.pubDate ?? null,
      reason,
    });
    if (error) throw error;
  } catch (e) {
    console.warn(`Failed to log skipped post for ${source} (${item.title}):`, e);
  }
}

// Combined skip decision: allowlisted franchises always proceed as reviews;
// otherwise a post must carry its source's review category tag to proceed.
// Metal Storm has no entry in either map above, so this always returns true
// for it (confirmed structurally review-only, see roundup-skip-fix.md).
export function shouldSkipPost(item: { categories?: string[] }, source: string): boolean {
  if (isAllowlistedFranchise(item, source)) return false;
  return !isGenuineReview(item, source);
}

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

// scoreByNormKey: norm_key -> score string, for existing reviews from THIS source only
// (see buildScoreByNormKey in runIngestion). Keying by norm_key instead of the old
// band+album-only computeId fixes the cross-source collision bug (see
// docs/decisions/album-identity-diagnosis.md) — two sources reviewing the same album now
// get distinct skip-set lookups since each fetcher only ever sees its own source's map.
async function fetchAngryMetalGuy(scoreByNormKey: Map<string, string>): Promise<RawReview[]> {
  const feed = await parser.parseURL('https://www.angrymetalguy.com/feed/');
  const genuineItems: (typeof feed.items)[number][] = [];
  for (const item of feed.items) {
    if (shouldSkipPost(item, 'Angry Metal Guy')) {
      await logSkippedPost('Angry Metal Guy', item);
    } else {
      genuineItems.push(item);
    }
  }
  const reviews = await Promise.all(
    genuineItems.map(async (item) => {
      // AMG RSS titles are formatted "Band – Album Review" or "Band – Album EP Review".
      // Strip the trailing suffix before parsing so the stored album name is clean.
      const rawTitle = (item.title ?? '').replace(/\s+(EP\s+)?Review$/i, '').trim();
      const [bandRaw, albumRaw] = extractBandAlbum(rawTitle);
      const band = bandRaw.trim() || 'Unknown Band';
      const album = albumRaw.trim() || 'Unknown Album';
      const url = item.link ?? '';
      const normKey = computeNormKey(band, album);
      let score: string;
      const knownScore = scoreByNormKey.get(normKey);
      if (knownScore) {
        // Review already scored — reuse stored value, skip the HTTP fetch.
        score = knownScore;
      } else {
        const rating = await fetchAngryMetalGuyRating(url);
        score = rating !== null ? `${rating}/10` : '';
      }
      return {
        source: 'Angry Metal Guy',
        band,
        album,
        score,
        summary: item.contentSnippet ?? '',
        url,
        publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
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
async function fetchProgressiveSubway(scoreByNormKey: Map<string, string>): Promise<RawReview[]> {
  const feed = await parser.parseURL('https://theprogressivesubway.com/feed');
  const genuineItems: (typeof feed.items)[number][] = [];
  for (const item of feed.items) {
    if (shouldSkipPost(item, 'The Progressive Subway')) {
      await logSkippedPost('The Progressive Subway', item);
    } else {
      genuineItems.push(item);
    }
  }
  const reviews = await Promise.all(
    genuineItems.map(async (item) => {
      // PS RSS titles are formatted "Review: Band – Album". Strip the "Review: " prefix
      // before parsing so the band name stored (and used for MB search) is clean.
      const rawTitle = (item.title ?? '').replace(/^Review:\s*/i, '');
      const [bandRaw, albumRaw] = extractBandAlbum(rawTitle);
      const band = bandRaw.trim() || 'Unknown Band';
      const album = albumRaw.trim() || 'Unknown Album';
      const url = item.link ?? '';
      const normKey = computeNormKey(band, album);
      let score: string;
      const knownScore = scoreByNormKey.get(normKey);
      if (knownScore) {
        score = knownScore;
      } else {
        const rating = await fetchProgressiveSubwayRating(item);
        score = rating !== null ? `${rating}/10` : '';
      }
      return {
        source: 'The Progressive Subway',
        band,
        album,
        score,
        summary: item.contentSnippet ?? '',
        url,
        publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
      };
    })
  );
  return reviews;
}

// Metal Storm scores require JS rendering, so Puppeteer is used instead of axios+cheerio.
// Puppeteer launch is expensive (~3-5s) — we skip it entirely when all feed items are
// already scored, which is the common case on a warm refresh.
async function fetchMetalStorm(scoreByNormKey: Map<string, string>): Promise<RawReview[]> {
  const feed = await parser.parseURL('https://metalstorm.net/rss/reviews.xml');

  // Pre-compute normKeys for all feed items so we can check the skip set before launching Puppeteer.
  const itemsWithMeta = feed.items.map((item) => {
    const [bandRaw, albumRaw] = extractBandAlbum(item.title ?? '', '–');
    const band = bandRaw.trim() || 'Unknown Band';
    const album = albumRaw.trim() || 'Unknown Album';
    const normKey = computeNormKey(band, album);
    return { item, band, album, normKey };
  });

  // Only the subset of items not yet in Supabase need Puppeteer page loads.
  const needsFetch = itemsWithMeta.filter(({ normKey }) => !scoreByNormKey.has(normKey));
  const scoreMap = new Map<string, string>(); // normKey -> fetched score string

  if (needsFetch.length > 0) {
    // Launch a single browser shared across all new review pages to minimise overhead.
    let browser;
    try {
      browser = await puppeteer.launch({ headless: true });
      try {
        await Promise.all(
          needsFetch.map(async ({ normKey, item }) => {
            const rating = await fetchMetalStormRating(browser!, item.link ?? '');
            scoreMap.set(normKey, rating !== null ? `${rating}/10` : '');
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
  return itemsWithMeta.map(({ item, band, album, normKey }) => ({
    source: 'Metal Storm',
    band,
    album,
    score: scoreByNormKey.has(normKey)
      ? (scoreByNormKey.get(normKey) ?? '')
      : (scoreMap.get(normKey) ?? ''),
    summary: item.contentSnippet ?? '',
    url: item.link ?? '',
    publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
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

// A normalized score must land in [0, 100] and never carry more precision than a
// real score can have (nothing on any source goes beyond one decimal place, e.g.
// "8.5/10" or "7.3/10"). Anything outside those bounds is treated as a failed
// extraction (returns null) rather than stored as a corrupted number — this is a
// safety net for unknown pollution patterns (e.g. footnote markers merging into a
// captured number upstream), not a substitute for fixing extraction at the source.
export function normalizeScore(raw: string): number | null {
  // Convert various formats to a 0-100 scale.
  if (!raw) return 0;
  // Percentages
  if (raw.includes('%')) {
    const num = parseFloat(raw.replace('%', '').trim());
    if (isNaN(num) || num < 0 || num > 100) return null;
    return num;
  }
  // X/5, X/10 etc.
  const slashMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+)/);
  if (slashMatch) {
    if (/\.\d{2,}$/.test(slashMatch[1])) return null;
    const val = parseFloat(slashMatch[1]);
    const max = parseFloat(slashMatch[2]);
    const result = (val / max) * 100;
    if (!isFinite(result) || result < 0 || result > 100) return null;
    return result;
  }
  // Plain number (assume out of 10)
  const num = parseFloat(raw);
  if (!isNaN(num)) {
    if (/\.\d{2,}$/.test(raw.trim())) return null;
    const result = (num / 10) * 100;
    if (result < 0 || result > 100) return null;
    return result;
  }
  return 0;
}

// Returns a precision rank so album enrichment never downgrades an existing precise date
// with a less-precise fresh one. MB dates can be "2024", "2024-03", or "2024-03-15" — all
// valid, but not equally useful.
function releaseDatePrecision(d: string | null): number {
  if (!d) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return 3; // full date
  if (/^\d{4}-\d{2}$/.test(d)) return 2; // year-month
  if (/^\d{4}$/.test(d)) return 1; // year only
  return 0; // unrecognized format — treat as no info
}

export function isAlbumEnriched(a: AlbumRow): boolean {
  return (
    typeof a.artwork_url === 'string' && a.genre.length > 0 && typeof a.release_date === 'string'
  );
}

// Album-level replacement for the old whole-table applyMergeGuard: instead of reconciling
// every existing review row against every fresh one on every run, enrichment merging now
// happens once, at the point a single album is resolved, against just that album's stored
// row. Same non-regression philosophy as before (never let a fresh empty/coarser value
// overwrite a good stored one) — see docs/decisions/release-date.md for why releaseDate
// needs the precision-aware rule instead of the simpler "fresh if non-null" one.
export function applyAlbumEnrichment(existing: AlbumRow, fresh: MusicBrainzData): AlbumRow {
  return {
    ...existing,
    artwork_url: fresh.artworkUrl ?? existing.artwork_url,
    genre: fresh.genres.length > 0 ? fresh.genres : existing.genre,
    release_date:
      releaseDatePrecision(fresh.releaseDate) >= releaseDatePrecision(existing.release_date)
        ? fresh.releaseDate
        : existing.release_date,
  };
}

export interface AlbumResolution {
  album: AlbumRow;
  isNewAlbum: boolean;
  backfilledMbId: boolean;
}

// Resolves which album a (band, album) pair belongs to, per docs/decisions/album-identity-decisions.md
// §4's dual-key strategy: mb_release_group_id checked first (when a fresh lookup resolved one),
// norm_key as the fallback — never the reverse. `mbResult` is null when the caller decided to
// skip the MusicBrainz call entirely (see needMbCall in runIngestion) — in that case only the
// norm_key path is available, mirroring "MB lookup failed or returned nothing" from the brief.
//
// makeId is injected (rather than calling randomUUID() directly) so this stays a pure,
// easily-testable function.
export function resolveAlbumIdentity(
  band: string,
  album: string,
  mbResult: MusicBrainzData | null,
  albumByNormKey: Map<string, AlbumRow>,
  albumByMbId: Map<string, AlbumRow>,
  makeId: () => string
): AlbumResolution {
  const normKey = computeNormKey(band, album);
  const normKeyMatch = albumByNormKey.get(normKey);

  if (mbResult?.releaseGroupId) {
    const mbMatch = albumByMbId.get(mbResult.releaseGroupId);
    if (mbMatch) {
      return {
        album: applyAlbumEnrichment(mbMatch, mbResult),
        isNewAlbum: false,
        backfilledMbId: false,
      };
    }
    // No album has this release-group id yet. Before creating a new album, check whether an
    // existing norm_key-matched row (created via fallback or manual add) can now be upgraded —
    // this is the "opportunistic, not retroactive-sweep" backfill from album-identity-decisions.md §4.
    if (normKeyMatch && !normKeyMatch.mb_release_group_id) {
      const enriched = applyAlbumEnrichment(normKeyMatch, mbResult);
      enriched.mb_release_group_id = mbResult.releaseGroupId;
      return { album: enriched, isNewAlbum: false, backfilledMbId: true };
    }
    return {
      album: {
        id: makeId(),
        band,
        album,
        norm_key: normKey,
        mb_release_group_id: mbResult.releaseGroupId,
        artwork_url: mbResult.artworkUrl,
        genre: mbResult.genres,
        release_date: mbResult.releaseDate,
      },
      isNewAlbum: true,
      backfilledMbId: false,
    };
  }

  // MB lookup was skipped, or ran and found nothing usable — fall back to norm_key.
  if (normKeyMatch) {
    return {
      album: mbResult ? applyAlbumEnrichment(normKeyMatch, mbResult) : normKeyMatch,
      isNewAlbum: false,
      backfilledMbId: false,
    };
  }
  return {
    album: {
      id: makeId(),
      band,
      album,
      norm_key: normKey,
      mb_release_group_id: null,
      artwork_url: mbResult?.artworkUrl ?? null,
      genre: mbResult?.genres ?? [],
      release_date: mbResult?.releaseDate ?? null,
    },
    isNewAlbum: true,
    backfilledMbId: false,
  };
}

// Returns existing albums that need an MB backfill retry this run — the album-level
// replacement for the old selectBackfillCandidates (see docs/decisions/release-date.md's
// "Bug: MB fields frozen..." section for why this pass exists at all: reviews age off the
// RSS window before MB has finished indexing them, so nothing else ever revisits them).
//
// mb_lookup_attempts still lives on `reviews`, not `albums` (no schema change made this
// session — re-deriving the retry cap at album granularity from review-level counters was
// judged preferable to an extra migration). Since up to 3 reviews can share one album, the
// cap is evaluated as "at least one attached review hasn't exhausted its budget" (OR across
// attached reviews) rather than requiring all of them to agree — a newer source's review
// shouldn't be blocked from retrying just because an older source's review on the same
// album already hit its cap.
export function selectAlbumBackfillCandidates(
  existingAlbums: AlbumRow[],
  touchedAlbumIds: Set<string>,
  reviewsByAlbumId: Map<string, ExistingReviewRow[]>,
  now: Date
): AlbumRow[] {
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  return existingAlbums.filter((a) => {
    if (touchedAlbumIds.has(a.id)) return false;
    if (isAlbumEnriched(a)) return false;
    const reviews = reviewsByAlbumId.get(a.id) ?? [];
    if (reviews.length === 0) return true; // no attempt history at all — worth trying
    return reviews.some((r) => {
      const attempts = r.mb_lookup_attempts ?? 0;
      const tooOld = new Date(r.published_at ?? 0) < fourteenDaysAgo;
      return !(attempts >= 5 && tooOld);
    });
  });
}

export async function runIngestion() {
  // Load current state once, up front: reviews (real post-migration columns) and albums.
  // A read failure is non-fatal — we start fresh rather than aborting the entire run.
  let existingReviews: ExistingReviewRow[] = [];
  let existingAlbums: AlbumRow[] = [];
  try {
    const [reviewsRes, albumsRes] = await Promise.all([
      supabase
        .from('reviews')
        .select(
          'id, band, album, source, score, normalized_score, summary, url, published_at, published_date, album_id, mb_lookup_attempts'
        ),
      supabase
        .from('albums')
        .select('id, band, album, mb_release_group_id, norm_key, artwork_url, genre, release_date'),
    ]);
    if (reviewsRes.error) throw reviewsRes.error;
    if (albumsRes.error) throw albumsRes.error;
    existingReviews = (reviewsRes.data ?? []) as ExistingReviewRow[];
    existingAlbums = (albumsRes.data ?? []) as AlbumRow[];
  } catch (e) {
    console.warn('Failed to fetch existing reviews/albums from Supabase, starting fresh:', e);
  }

  const albumById = new Map(existingAlbums.map((a) => [a.id, a]));
  const reviewsByAlbumId = new Map<string, ExistingReviewRow[]>();
  for (const r of existingReviews) {
    if (!reviewsByAlbumId.has(r.album_id)) reviewsByAlbumId.set(r.album_id, []);
    reviewsByAlbumId.get(r.album_id)!.push(r);
  }
  const existingReviewByAlbumSource = new Map(
    existingReviews.map((r) => [`${r.album_id}::${r.source}`, r])
  );

  // Rating-fetch skip set, per source: norm_key -> already-stored score. Deliberately
  // decoupled from any MB/album lookup — this only needs to answer "do we already have a
  // non-empty score for this (band+album) from this specific source," which is knowable
  // purely from existing reviews joined through their album's norm_key. No network cost.
  function scoreByNormKeyForSource(source: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const r of existingReviews) {
      if (r.source !== source || !r.score) continue;
      const album = albumById.get(r.album_id);
      if (!album) continue;
      map.set(album.norm_key, r.score);
    }
    return map;
  }

  // All three source fetchers run in parallel. Each skips HTTP calls for known reviews.
  const [amg, ps, ms, sp] = await Promise.all([
    fetchAngryMetalGuy(scoreByNormKeyForSource('Angry Metal Guy')),
    fetchProgressiveSubway(scoreByNormKeyForSource('The Progressive Subway')),
    fetchMetalStorm(scoreByNormKeyForSource('Metal Storm')),
    fetchSputnik(),
  ]);
  const allRaw = [...amg, ...ps, ...ms, ...sp];

  // Live album-lookup maps, seeded from Supabase and updated as this run resolves/creates
  // albums — so if two sources in the same run both review a brand-new album, the second
  // one sees the first one's resolution instead of creating a duplicate row.
  const liveAlbumByNormKey = new Map(existingAlbums.map((a) => [a.norm_key, a]));
  const liveAlbumByMbId = new Map(
    existingAlbums
      .filter((a) => a.mb_release_group_id)
      .map((a) => [a.mb_release_group_id as string, a])
  );
  const albumsToUpsert = new Map<string, AlbumRow>();
  const reviewsToUpsert = new Map<string, ReviewWriteRow>();
  const touchedAlbumIds = new Set<string>();

  // Sequential — MB lookups below share MusicBrainz's 1 req/sec limit, so this loop cannot
  // be parallelized without breaking rate-limit discipline (same constraint as before).
  for (const r of allRaw) {
    const band = r.band.trim() || 'Unknown Band';
    const album = r.album.trim() || 'Unknown Album';
    const normKey = computeNormKey(band, album);
    const normKeyMatch = liveAlbumByNormKey.get(normKey);

    // Skip the MB call only when we already have a norm_key match with complete enrichment —
    // the album-scoped equivalent of the old mbAlreadyFetched set. Note: this means a fully
    // enriched norm_key-matched album whose mb_release_group_id is still null will NOT get an
    // opportunistic backfill attempt here (that only happens when resolveAlbumIdentity is
    // actually given a fresh mbResult). See docs/decisions/album-identity-ingest.md for why
    // this coverage gap is accepted rather than closed this session.
    const needMbCall = !normKeyMatch || !isAlbumEnriched(normKeyMatch);
    let mbResult: MusicBrainzData | null = null;
    if (needMbCall) {
      mbResult = await lookupMusicBrainz(band, album);
      await sleep(1000); // MB rate limit: gap before the next lookup
    }

    const resolution = resolveAlbumIdentity(
      band,
      album,
      mbResult,
      liveAlbumByNormKey,
      liveAlbumByMbId,
      randomUUID
    );
    const resolvedAlbum = resolution.album;

    liveAlbumByNormKey.set(resolvedAlbum.norm_key, resolvedAlbum);
    if (resolvedAlbum.mb_release_group_id)
      liveAlbumByMbId.set(resolvedAlbum.mb_release_group_id, resolvedAlbum);
    if (needMbCall) albumsToUpsert.set(resolvedAlbum.id, resolvedAlbum);
    touchedAlbumIds.add(resolvedAlbum.id);

    // Two distinct "no usable score" cases, kept separate on purpose:
    // - r.score is empty: nothing was ever fetched (e.g. a Metal Storm page.goto()
    //   timeout never reached the rating text at all). Stored as a real null so it's
    //   excluded from the frontend's average-score calculation
    //   (src/dbMapping.ts) instead of silently averaging in as a 0/10. Falsy r.score also
    //   means the retry skip-set (scoreByNormKeyForSource) will pick it up again next run.
    // - r.score is non-empty but normalizeScore() rejects it (its sanity guard): a
    //   malformed/corrupted score string got past extraction. Existing behavior, left
    //   untouched — stored as the empty-string/0 sentinel, not null, since this isn't a
    //   "nothing fetched yet" state that a retry will naturally resolve.
    const normalized = r.score ? normalizeScore(r.score) : null;
    const publishedDate = new Date(r.publishedAt).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const existingReview = existingReviewByAlbumSource.get(`${resolvedAlbum.id}::${r.source}`);
    const reviewId = existingReview?.id ?? randomUUID();

    reviewsToUpsert.set(reviewId, {
      id: reviewId,
      band,
      album,
      source: r.source,
      score: !r.score ? null : normalized === null ? '' : r.score,
      normalized_score: !r.score ? null : normalized === null ? 0 : normalized,
      summary: r.summary,
      url: r.url,
      published_at: r.publishedAt as unknown as string,
      published_date: publishedDate,
      album_id: resolvedAlbum.id,
      mb_lookup_attempts: existingReview?.mb_lookup_attempts ?? 0, // RSS path never increments this
    });
  }

  // Backfill pass: retry MB for albums that have aged off the RSS window without ever
  // completing enrichment (see selectAlbumBackfillCandidates for why this is evaluated at
  // album granularity now, and how the review-level attempts counter is aggregated).
  const candidates = selectAlbumBackfillCandidates(
    existingAlbums,
    touchedAlbumIds,
    reviewsByAlbumId,
    new Date()
  );
  for (const a of candidates) {
    const mbData = await lookupMusicBrainz(a.band, a.album);
    const enriched = applyAlbumEnrichment(a, mbData);
    if (mbData.releaseGroupId && !enriched.mb_release_group_id) {
      enriched.mb_release_group_id = mbData.releaseGroupId;
    }
    albumsToUpsert.set(a.id, enriched);
    // Bump the retry counter on every review attached to this album — see
    // selectAlbumBackfillCandidates for why attempts live on reviews, not albums.
    for (const rv of reviewsByAlbumId.get(a.id) ?? []) {
      reviewsToUpsert.set(rv.id, {
        id: rv.id,
        band: rv.band,
        album: rv.album,
        source: rv.source,
        // Pass score/normalized_score through as stored — this loop only bumps
        // mb_lookup_attempts, it must not resurrect a genuine null (no score fetched yet)
        // back into the empty-string/0 sentinel.
        score: rv.score,
        normalized_score: rv.normalized_score,
        summary: rv.summary ?? '',
        url: rv.url ?? '',
        published_at: rv.published_at ?? new Date().toISOString(),
        published_date: rv.published_date ?? '',
        album_id: rv.album_id,
        mb_lookup_attempts: (rv.mb_lookup_attempts ?? 0) + 1,
      });
    }
    await sleep(1000);
  }

  if (albumsToUpsert.size > 0) {
    const { error: albumsError } = await supabase
      .from('albums')
      .upsert([...albumsToUpsert.values()], { onConflict: 'id' });
    if (albumsError) {
      throw new Error(`Failed to upsert albums to Supabase: ${albumsError.message}`);
    }
  }

  if (reviewsToUpsert.size > 0) {
    // onConflict targets `id` (still the PK), not (album_id, source) — but by this point
    // every row's `id` was already resolved via existingReviewByAlbumSource (reused for
    // updates, freshly generated only for genuine new (album_id, source) pairs), so the
    // (album_id, source) uniqueness check has already happened in application code above.
    // reviews.id itself is no longer read or branched on anywhere in this file beyond that
    // — it survives purely because the column is a NOT NULL PK and Supabase upsert needs a
    // conflict target.
    const { error: reviewsError } = await supabase
      .from('reviews')
      .upsert([...reviewsToUpsert.values()], { onConflict: 'id' });
    if (reviewsError) {
      throw new Error(`Failed to upsert reviews to Supabase: ${reviewsError.message}`);
    }
  }

  console.log(
    `✅ Ingestion completed — upserted ${albumsToUpsert.size} album(s), ${reviewsToUpsert.size} review(s)`
  );
}
