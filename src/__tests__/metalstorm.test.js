// src/__tests__/metalstorm.test.js
import { describe, it, expect } from 'vitest';
import { extractRating } from '../scraper/metalstorm';

describe('Metal Storm extractRating', () => {
  it('extracts user score from typical review page HTML', () => {
    const html = `
      <div class="album-rating">
        <div class="mb-3">
          <div class="form-text">Reviewer</div>
          <span class="megatitle" style="color:#666666">N/A</span>
        </div>
        <div>
          <a class="form-text" href="/bands/rating.php?album_id=205537">89 users</a>
        </div>
        <span class="bold" style="color:#eebb00">8.0</span>
      </div>
    `;
    expect(extractRating(html)).toBe(8.0);
  });

  it('extracts decimal user score (e.g. 7.3)', () => {
    const html = `
      <div class="album-rating">
        <div class="mb-3">
          <div class="form-text">Reviewer</div>
          <span class="megatitle" style="color:#eebb00">8.5</span>
        </div>
        <div>
          <a class="form-text" href="/bands/rating.php?album_id=12345">42 users</a>
        </div>
        <span class="bold" style="color:#eebb00">7.3</span>
      </div>
    `;
    expect(extractRating(html)).toBe(7.3);
  });

  it('handles integer score (e.g. 9)', () => {
    const html = `
      <div class="album-rating">
        <span class="bold" style="color:#eebb00">9</span>
      </div>
    `;
    expect(extractRating(html)).toBe(9);
  });

  it('handles reviewer score present alongside user score', () => {
    const html = `
      <div class="album-rating">
        <div class="mb-3">
          <div class="form-text">Reviewer</div>
          <span class="megatitle" style="color:#eebb00">7.0</span>
        </div>
        <div>
          <a class="form-text" href="/bands/rating.php?album_id=99999">150 users</a>
        </div>
        <span class="bold" style="color:#eebb00">6.5</span>
      </div>
    `;
    // Should pick the user score (span.bold), not the reviewer (span.megatitle)
    expect(extractRating(html)).toBe(6.5);
  });

  it('returns null when reviewer is N/A and no user score exists', () => {
    const html = `
      <div class="album-rating">
        <div class="mb-3">
          <div class="form-text">Reviewer</div>
          <span class="megatitle" style="color:#666666">N/A</span>
        </div>
      </div>
    `;
    expect(extractRating(html)).toBeNull();
  });

  it('returns null when no album-rating div exists', () => {
    const html = `<div class="review-content"><p>Great album!</p></div>`;
    expect(extractRating(html)).toBeNull();
  });

  it('returns null for empty HTML', () => {
    expect(extractRating('')).toBeNull();
  });

  it('returns null for null-ish input', () => {
    // @ts-ignore - testing defensive behaviour
    expect(extractRating(null)).toBeNull();
  });

  it('preserves score of 10.0', () => {
    const html = `
      <div class="album-rating">
        <span class="bold" style="color:#eebb00">10.0</span>
      </div>
    `;
    expect(extractRating(html)).toBe(10.0);
  });

  it('handles low score like 1.5', () => {
    const html = `
      <div class="album-rating">
        <span class="bold" style="color:#eebb00">1.5</span>
      </div>
    `;
    expect(extractRating(html)).toBe(1.5);
  });

  it('falls back to span.bold without style attribute', () => {
    const html = `
      <div class="album-rating">
        <span class="bold">7.8</span>
      </div>
    `;
    expect(extractRating(html)).toBe(7.8);
  });
});
