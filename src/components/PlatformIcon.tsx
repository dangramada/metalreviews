// src/components/PlatformIcon.tsx
//
// Renders one simple-icons brand mark as an inline monochrome SVG (fill="currentColor",
// so it inherits the menu item's text color rather than the brand's own hex). simple-icons
// is scoped to this one file — see docs/decisions/streaming-links--concept-draft.md: Lucide
// (the app's one other icon source) has no brand/logo icons, so this is a narrow second
// source rather than a general replacement.
import type { SimpleIcon } from 'simple-icons';

export function PlatformIcon({ icon, size = 16 }: { icon: SimpleIcon; size?: number }) {
  return (
    <svg
      role="img"
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
    >
      <path d={icon.path} />
    </svg>
  );
}
