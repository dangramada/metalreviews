// Focus restoration for lists where acting on a row removes it (Select for AOTY, Back to
// Contenders): without it focus falls to <body>. Row controls carry `data-primary-for={albumId}`;
// FavoriteListItemRow mounts a desktop and a mobile tree (CSS-toggled), so prefer the one that
// is actually laid out.
export function focusRowOrHeading(albumId: string | null, heading: HTMLElement | null) {
  const matches = albumId
    ? Array.from(document.querySelectorAll<HTMLElement>(`[data-primary-for="${albumId}"]`))
    : [];
  const target = matches.find((el) => el.getClientRects().length > 0) ?? matches[0] ?? heading;
  target?.focus();
}
