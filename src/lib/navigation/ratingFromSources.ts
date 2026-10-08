import { resolveFromSource, type FromSourceEntry } from './resolveFromSource';

// Reached from FavoritesPage's rate control today (?from=favorites); the future Ranked
// Albums/AOTY hub will link here too (?from=aoty). That route doesn't exist yet, so the
// `aoty` case falls back to /favorites for now — flagged here rather than guessed at, per
// the brief. Update this map once the real AOTY route lands. The resolved `label` feeds the
// PageBreadcrumb's shorter, arrow-free source name — the standalone "← Back to X" link this
// used to also provide was MobileRatingLayout's own header link, removed in the mobile
// stage-1 restructure (docs/decisions/album-rating-page.md) now that the breadcrumb above
// both layouts covers that navigation.
//
// Uses the shared resolveFromSource helper (resolveFromSource.ts),
// extracted here on its second use (CriteriaCalibrationPage's own breadcrumb) so both pages
// read the same `?from=` allowlist convention instead of maintaining two copies of the same
// shape.
export const RATING_FALLBACK_SOURCE: FromSourceEntry = { href: '/favorites', label: 'Favorites' };
export const RATING_FROM_SOURCES: Record<string, FromSourceEntry> = {
  aoty: { href: '/aoty', label: 'AOTY' },
  favorites: RATING_FALLBACK_SOURCE,
  contenders: { href: '/aoty?view=contenders', label: 'Contenders' },
};
export function resolveBackDestination(from: string | null): { href: string; sourceLabel: string } {
  const { href, label } = resolveFromSource(from, RATING_FROM_SOURCES, RATING_FALLBACK_SOURCE);
  return { href, sourceLabel: label };
}
