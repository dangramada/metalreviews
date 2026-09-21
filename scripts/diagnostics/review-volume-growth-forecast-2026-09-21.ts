// One-off diagnostic: weekly review/album growth series + linear-fit projections, for the
// Home page pagination/virtualization architecture decision. Read-only. See brief in the
// session that produced this file; output feeds a future docs/decisions/ writeup, not this
// script itself.
import { supabase } from '../supabaseClient';
import type { AlbumWithReviewsRow } from '../../src/dbMapping';

const UNKNOWN_SENTINEL_NORM_KEY = 'unknown band__unknown album';

// Same PostgREST embed shape the frontend actually uses (src/App.tsx ALBUMS_WITH_REVIEWS_SELECT),
// for a realistic payload-size measurement.
const ALBUMS_WITH_REVIEWS_SELECT =
  'id, band, album, artwork_url, release_date, genre, created_at, norm_key, ' +
  'reviews!inner(id, source, score, normalized_score, summary, url, published_at, published_date)';

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Simple linear regression y = a + b*x, x = week index (0, 1, 2, ...).
function linearFit(ys: number[]): { intercept: number; slope: number } {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { intercept, slope };
}

async function main() {
  // --- 1. Pull every review with its album's norm_key + release_date for filtering. ---
  const { data: reviewRows, error: reviewErr } = await supabase
    .from('reviews')
    .select('id, source, published_at, album_id, albums(norm_key, release_date)')
    .order('published_at', { ascending: true });
  if (reviewErr) throw reviewErr;

  type Row = {
    id: string;
    source: string;
    published_at: string | null;
    album_id: string;
    albums: { norm_key: string; release_date: string | null } | null;
  };
  const rows = (reviewRows as unknown as Row[]).filter(
    (r) => r.published_at && r.albums?.norm_key !== UNKNOWN_SENTINEL_NORM_KEY
  );

  console.log(`Total reviews (raw): ${reviewRows!.length}`);
  console.log(`Total reviews (excl. Unknown Band sentinel, null published_at): ${rows.length}`);

  const sources = ['Angry Metal Guy', 'The Progressive Subway', 'Metal Storm'];

  // --- 2. Weekly review counts by source. ---
  const weeklyBySource: Record<string, Record<string, number>> = {};
  for (const s of sources) weeklyBySource[s] = {};
  for (const r of rows) {
    const wk = isoWeekKey(r.published_at!);
    weeklyBySource[r.source] ??= {};
    weeklyBySource[r.source][wk] = (weeklyBySource[r.source][wk] ?? 0) + 1;
  }

  const allWeeks = Array.from(
    new Set(rows.map((r) => isoWeekKey(r.published_at!)))
  ).sort();

  console.log('\n=== Weekly review counts by source (ISO week) ===');
  console.log(['week', ...sources, 'total'].join('\t'));
  const weeklyTotals: number[] = [];
  for (const wk of allWeeks) {
    const counts = sources.map((s) => weeklyBySource[s][wk] ?? 0);
    const total = counts.reduce((a, b) => a + b, 0);
    weeklyTotals.push(total);
    console.log([wk, ...counts, total].join('\t'));
  }

  // --- 3. Weekly distinct-album counts (album "arrival week" = its earliest review's week). ---
  const albumFirstWeek = new Map<string, string>();
  for (const r of rows) {
    const wk = isoWeekKey(r.published_at!);
    const existing = albumFirstWeek.get(r.album_id);
    if (!existing || wk < existing) albumFirstWeek.set(r.album_id, wk);
  }
  const weeklyAlbumCounts: Record<string, number> = {};
  for (const wk of albumFirstWeek.values()) {
    weeklyAlbumCounts[wk] = (weeklyAlbumCounts[wk] ?? 0) + 1;
  }
  console.log('\n=== Weekly distinct-album counts (album\'s first-review week) ===');
  const albumWeeklySeries: number[] = [];
  for (const wk of allWeeks) {
    const c = weeklyAlbumCounts[wk] ?? 0;
    albumWeeklySeries.push(c);
    console.log(`${wk}\t${c}`);
  }
  console.log(`Distinct albums total: ${albumFirstWeek.size}`);

  // --- 4. Linear fit: reviews/week combined, per source, and albums/week. ---
  const fitCombined = linearFit(weeklyTotals);
  console.log('\n=== Linear fit (y = reviews/week, x = week index) ===');
  console.log(`combined: intercept=${fitCombined.intercept.toFixed(2)} slope=${fitCombined.slope.toFixed(3)}/wk`);
  const fitBySource: Record<string, { intercept: number; slope: number }> = {};
  for (const s of sources) {
    const series = allWeeks.map((wk) => weeklyBySource[s][wk] ?? 0);
    fitBySource[s] = linearFit(series);
    console.log(
      `${s}: intercept=${fitBySource[s].intercept.toFixed(2)} slope=${fitBySource[s].slope.toFixed(3)}/wk`
    );
  }
  const fitAlbums = linearFit(albumWeeklySeries);
  console.log(`albums: intercept=${fitAlbums.intercept.toFixed(2)} slope=${fitAlbums.slope.toFixed(3)}/wk`);

  // --- 5. Projections at +3/+6/+12 months (13/26/52 weeks) from today. ---
  const totalReviews = rows.length;
  const totalAlbums = albumFirstWeek.size;
  const n = allWeeks.length; // next future week starts at index n
  // Integrate the fitted weekly-rate line over the future window (rate at its midpoint *
  // window length), not just slope*weeks — the fit predicts a RATE per week, not a
  // cumulative count, so projected reviews added = area under the rate line.
  function projectAdded(fit: { intercept: number; slope: number }, weeksAhead: number): number {
    const midX = n + (weeksAhead - 1) / 2;
    const rateAtMid = fit.intercept + fit.slope * midX;
    return Math.max(0, rateAtMid) * weeksAhead;
  }
  console.log('\n=== Projections: trend (integrated fitted rate) vs. flat (recent 8-wk avg held constant) ===');
  const recent8 = weeklyTotals.slice(-8);
  const recentAvgReviewsPerWeek = recent8.reduce((a, b) => a + b, 0) / recent8.length;
  const recentAlbums8 = albumWeeklySeries.slice(-8);
  const recentAvgAlbumsPerWeek = recentAlbums8.reduce((a, b) => a + b, 0) / recentAlbums8.length;
  console.log(`Recent 8-week avg: ${recentAvgReviewsPerWeek.toFixed(1)} reviews/wk, ${recentAvgAlbumsPerWeek.toFixed(1)} albums/wk`);
  for (const [label, weeksAhead] of [
    ['+3mo', 13],
    ['+6mo', 26],
    ['+12mo', 52],
  ] as const) {
    const projReviewsTrend = totalReviews + projectAdded(fitCombined, weeksAhead);
    const projAlbumsTrend = totalAlbums + projectAdded(fitAlbums, weeksAhead);
    const projReviewsFlat = totalReviews + recentAvgReviewsPerWeek * weeksAhead;
    const projAlbumsFlat = totalAlbums + recentAvgAlbumsPerWeek * weeksAhead;
    console.log(
      `${label}: trend reviews≈${Math.round(projReviewsTrend)} albums≈${Math.round(projAlbumsTrend)} | flat reviews≈${Math.round(projReviewsFlat)} albums≈${Math.round(projAlbumsFlat)}`
    );
  }

  // --- 6. Average payload size per review row, using the app's real select. ---
  const { data: albumsData, error: albumsErr } = await supabase
    .from('albums')
    .select(
      'id, band, album, artwork_url, release_date, genre, created_at, norm_key, ' +
        'reviews!inner(id, source, score, normalized_score, summary, url, published_at, published_date)'
    );
  if (albumsErr) throw albumsErr;
  const cleanAlbumRows = (albumsData as unknown as (AlbumWithReviewsRow & { norm_key: string })[]).filter(
    (a) => a.norm_key !== UNKNOWN_SENTINEL_NORM_KEY
  );

  const jsonBytes = Buffer.byteLength(JSON.stringify(albumsData), 'utf8');
  const reviewRowCount = cleanAlbumRows.reduce((sum, a) => sum + a.reviews.length, 0);
  const albumRowCount = cleanAlbumRows.length;
  console.log('\n=== Payload size (actual ALBUMS_WITH_REVIEWS_SELECT response) ===');
  console.log(`Total JSON size: ${(jsonBytes / 1024).toFixed(1)} KB`);
  console.log(`Album rows: ${albumRowCount}, review rows: ${reviewRowCount}`);
  console.log(`Avg KB per review row: ${(jsonBytes / 1024 / reviewRowCount).toFixed(3)}`);
  console.log(`Avg KB per album row: ${(jsonBytes / 1024 / albumRowCount).toFixed(3)}`);

  for (const [label, weeksAhead] of [
    ['+3mo', 13],
    ['+6mo', 26],
    ['+12mo', 52],
  ] as const) {
    const projReviewsTrend = totalReviews + projectAdded(fitCombined, weeksAhead);
    const projReviewsFlat = totalReviews + recentAvgReviewsPerWeek * weeksAhead;
    const kbPerReview = jsonBytes / 1024 / reviewRowCount;
    console.log(
      `${label} projected payload: trend=${(kbPerReview * projReviewsTrend).toFixed(0)} KB | flat=${(kbPerReview * projReviewsFlat).toFixed(0)} KB`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
