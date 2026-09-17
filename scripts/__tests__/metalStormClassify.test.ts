import { describe, it, expect } from 'vitest';
import { classifyMetalStormPage, formatMetalStormOutcomeSummary } from '../ingest';

// Trimmed from the real review page structure seen 2026-09-16 (review_id=21398).
const scoredHtml = `
<html><head><title>Kamelot - Dark Asylum - review - Metal Storm</title></head><body>
<div class="album-rating">
  <div class="mb-3"><div class="form-text">Reviewer</div>
    <span class="megatitle" style="color:#666666"> N/A </span></div>
  <div><a class="form-text" href="/bands/rating.php?album_id=207878"> 114 users </a></div>
  <span class="bold" style="color:#eebb00"> 7.3 </span>
</div></body></html>`;

const noUserScoreHtml = `
<html><head><title>Some Band - Some Album - review - Metal Storm</title></head><body>
<div class="album-rating">
  <div class="mb-3"><div class="form-text">Reviewer</div>
    <span class="megatitle" style="color:#666666"> 8 </span></div>
  <div><a class="form-text" href="/bands/rating.php?album_id=1"> 2 users </a></div>
</div></body></html>`;

const challengeHtml = `
<html><head><title>Just a moment...</title></head><body>
<div id="challenge-running"></div>
<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>
</body></html>`;

const otherPageHtml = `<html><head><title>Metal Storm</title></head><body><p>News</p></body></html>`;

describe('classifyMetalStormPage', () => {
  it('classifies a page with an extracted rating as scored, with vote count', () => {
    expect(
      classifyMetalStormPage({ status: 200, title: 'Kamelot', html: scoredHtml, rating: 7.3 })
    ).toEqual({ outcome: 'scored', votes: '114 users' });
  });

  it('classifies a 403 as a Cloudflare challenge', () => {
    expect(
      classifyMetalStormPage({
        status: 403,
        title: 'Just a moment...',
        html: challengeHtml,
        rating: null,
      }).outcome
    ).toBe('cloudflare-challenge');
  });

  it('classifies a 200 challenge interstitial by title/markup, not status', () => {
    expect(
      classifyMetalStormPage({
        status: 200,
        title: 'Just a moment...',
        html: challengeHtml,
        rating: null,
      }).outcome
    ).toBe('cloudflare-challenge');
    expect(
      classifyMetalStormPage({ status: 200, title: '', html: challengeHtml, rating: null }).outcome
    ).toBe('cloudflare-challenge');
  });

  it('classifies a 503 as a Cloudflare challenge', () => {
    expect(classifyMetalStormPage({ status: 503, title: '', html: '', rating: null }).outcome).toBe(
      'cloudflare-challenge'
    );
  });

  it('classifies a real page with a rating block but no user score as no-user-score', () => {
    expect(
      classifyMetalStormPage({ status: 200, title: 'x', html: noUserScoreHtml, rating: null })
    ).toEqual({ outcome: 'no-user-score', votes: '2 users' });
  });

  it('classifies a 200 page without a rating block as unexpected-page', () => {
    expect(
      classifyMetalStormPage({
        status: 200,
        title: 'Metal Storm',
        html: otherPageHtml,
        rating: null,
      })
    ).toEqual({ outcome: 'unexpected-page', votes: null });
  });

  it('treats a missing response (status null) by content alone', () => {
    expect(
      classifyMetalStormPage({ status: null, title: 'x', html: noUserScoreHtml, rating: null })
        .outcome
    ).toBe('no-user-score');
  });
});

describe('formatMetalStormOutcomeSummary', () => {
  it('lists every outcome with its count, including zeros', () => {
    expect(
      formatMetalStormOutcomeSummary([
        'cloudflare-challenge',
        'cloudflare-challenge',
        'scored',
        'fetch-error',
      ])
    ).toBe(
      'Metal Storm: 4 fetched — scored 1, cloudflare-challenge 2, no-user-score 0, unexpected-page 0, fetch-error 1'
    );
  });
});
