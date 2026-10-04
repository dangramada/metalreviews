// Focus restoration for lists where acting on a row removes it (Select for AOTY, Back to
// Contenders): without it focus falls to <body>. Row controls carry `data-primary-for={albumId}`;
// FavoriteListItemRow mounts a desktop and a mobile tree (CSS-toggled), so prefer the one that
// is actually laid out.
export function findRowControl(albumId: string): HTMLElement | null {
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-primary-for="${albumId}"]`)
  );
  return matches.find((el) => el.getClientRects().length > 0) ?? matches[0] ?? null;
}

export function focusRowOrHeading(albumId: string | null, heading: HTMLElement | null) {
  const target = (albumId ? findRowControl(albumId) : null) ?? heading;
  target?.focus();
}
