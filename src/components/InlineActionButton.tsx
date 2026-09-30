// src/components/InlineActionButton.tsx
//
// A <Button> styled to read as inline text — for actions (an onClick handler that changes
// state on the current page), not navigation, which should use <Link asChild> instead. Chakra
// v3's default theme has no "link" button variant (v2 had one); this composes the existing
// "plain" variant (no bg/border) with explicit size overrides instead of adding a new variant
// to the theme, so it doesn't touch theme.ts/BUTTON_VARIANTS. h/px are on the component's own
// props, which override whatever the `size` prop's recipe axis would otherwise set (props beat
// recipe-generated styles — same precedence used everywhere else in this codebase that passes
// style props directly to a themed component). minH: 24px is a deliberate touch-target floor,
// smaller than the theme's own button sizes on purpose since this reads as text, not a button.
import { Button, type ButtonProps } from '@chakra-ui/react';

export function InlineActionButton(props: ButtonProps) {
  return <Button variant="plain" h="auto" minH="24px" px={0} {...props} />;
}
