// Album identity fallback key. Folds diacritics and collapses punctuation so
// formatting variants of the same title collide deterministically (unlike the
// old computeId in ingest.ts, which only lowercases and strips whitespace —
// see docs/decisions/album-identity/album-identity-diagnosis.md for the collisions that missed).
export function computeNormKey(band: string, album: string): string {
  const fold = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks left by NFKD
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ') // punctuation -> space, so words don't glue together
      .replace(/\s+/g, ' ')
      .trim();
  return `${fold(band)}__${fold(album)}`;
}
