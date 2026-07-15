import { describe, it, expect } from 'vitest';
import { computeNormKey } from '../normalizeKey';

describe('computeNormKey', () => {
  it('folds diacritics', () => {
    expect(computeNormKey('Mötley Crüe', 'Dr. Feelgood')).toBe(
      computeNormKey('Motley Crue', 'Dr. Feelgood')
    );
  });

  it('collapses punctuation variants to the same key', () => {
    expect(computeNormKey('Fires in the Distance', 'Circadian Promise:')).toBe(
      computeNormKey('Fires in the Distance', 'Circadian Promise -')
    );
  });

  it('is case- and whitespace-insensitive', () => {
    expect(computeNormKey('  Elder ', 'Through Zero')).toBe(computeNormKey('ELDER', '  through   zero'));
  });

  it('replaces punctuation with a space rather than deleting it, so words do not glue together', () => {
    // If punctuation were deleted outright, "St.Louis" would become "stlouis" (one word)
    // instead of "st louis" (two) — space-replacement avoids that false collision risk.
    expect(computeNormKey('Band', 'St.Louis')).toBe(computeNormKey('Band', 'St Louis'));
    expect(computeNormKey('Band', 'St.Louis')).not.toBe(computeNormKey('Band', 'Stlouis'));
  });

  it('produces distinct keys for genuinely different albums', () => {
    expect(computeNormKey('Draconian', 'In Somnolent Ruin')).not.toBe(
      computeNormKey('Elder', 'Through Zero')
    );
  });

  it('handles empty strings without throwing', () => {
    expect(computeNormKey('', '')).toBe('__');
  });
});
