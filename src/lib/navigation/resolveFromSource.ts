// Shared "which page sent the user here" resolver, generalized out of AlbumRatingPage.tsx's
// original resolveBackDestination (see docs/decisions/album-rating-page.md) now that
// CriteriaCalibrationPage needs the same shape for its breadcrumb — same `?from=` param,
// same allowlist-not-raw-path convention as CriteriaCalibrationPage.tsx's own
// EXIT_DESTINATIONS. Centralizing this means the two pages can't drift on how a `from` value
// maps to a source label/href.

export interface FromSourceEntry {
  href: string;
  label: string;
}

/**
 * Resolves a `?from=` value to where "back" goes and what to call it. `entries` is the
 * allowlist for the calling page (a raw, uncontrolled `from` can never redirect anywhere the
 * caller didn't list). `fallback` is used both for an absent/unrecognised `from` and must be
 * one of `entries`' own values (enforced by the caller, not this function).
 */
export function resolveFromSource(
  from: string | null,
  entries: Record<string, FromSourceEntry>,
  fallback: FromSourceEntry
): FromSourceEntry {
  if (from && entries[from]) return entries[from];
  return fallback;
}
