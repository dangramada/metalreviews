// src/__tests__/angrymetal.test.js
import { describe, it, expect } from 'vitest';
import { extractRating } from '../scraper/angrymetal';

describe('extractRating', () => {
  it('extracts numeric rating with slash', () => {
    const html = `<span class="rating">8.5/10</span>`;
    expect(extractRating(html)).toBe(8.5);
  });
  it('maps textual rating to numeric', () => {
    const html = `<div class="rating">Excellent</div>`;
    // Excellent maps to 9.0 according to RATING_MAP (normalized to 0-10)
    expect(extractRating(html)).toBe(9.0);
  });
  it('extracts textual rating from "Rating: Great" text elements', () => {
    const html = `<p><strong>Rating:</strong> Great<br><strong>DR:</strong> 7</p>`;
    expect(extractRating(html)).toBe(8.0);
  });
  it('extracts multi-word textual rating like "Very Good"', () => {
    const html = `<p><strong>Rating:</strong> Very Good<br><strong>DR:</strong> 8</p>`;
    expect(extractRating(html)).toBe(7.0);
  });
  it('handles case variations of textual ratings case-insensitively', () => {
    const html = `<p><strong>Rating:</strong> great<br></p>`;
    expect(extractRating(html)).toBe(8.0);
  });
  it('handles missing rating gracefully', () => {
    const html = `<p>No rating here</p>`;
    expect(extractRating(html)).toBeNull();
  });
});
