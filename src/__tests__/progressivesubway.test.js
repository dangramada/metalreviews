import { describe, it, expect } from 'vitest';
import { extractRating } from '../scraper/progressivesubway';

describe('Progressive Subway extractRating', () => {
  it('extracts numeric rating with slash', () => {
    const html = `<p><strong>Final verdict: 7.5/10</strong></p>`;
    expect(extractRating(html)).toBe(7.5);
  });

  it('extracts simple numeric rating', () => {
    const html = `<p><strong>Final verdict: 8</strong></p>`;
    expect(extractRating(html)).toBe(8);
  });

  it('maps textual rating to numeric rating', () => {
    const html = `<p><strong>Final verdict: Exemplary</strong></p>`;
    expect(extractRating(html)).toBe(8.0);
  });

  it('maps case-insensitive textual rating', () => {
    const html = `<p><strong>Final verdict: sublime</strong></p>`;
    expect(extractRating(html)).toBe(10.0);
  });

  it('handles nested HTML tags in final verdict', () => {
    const html = `<p><strong>Final verdict:</strong> <strong>5/10</strong></p>`;
    expect(extractRating(html)).toBe(5.0);
  });

  it('handles spaces and newlines around verdict', () => {
    const html = `<p>
      Final 
      verdict: 
      Noteworthy
    </p>`;
    expect(extractRating(html)).toBe(7.0);
  });

  it('handles missing rating gracefully', () => {
    const html = `<p>No verdict here</p>`;
    expect(extractRating(html)).toBeNull();
  });
});
