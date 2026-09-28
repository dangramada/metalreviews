import { useRef, type MouseEvent, type ReactNode } from 'react';
import { Box, Flex, useToken } from '@chakra-ui/react';
import { Checkbox } from './ui/checkbox';

// Clicks inside any of these never toggle selection — the row's own actions (buttons, future
// links) and the checkbox itself (Ark's Checkbox.Root renders as a <label>, so a click anywhere
// on it — including the synthetic click it forwards to the hidden input — lands here too;
// ignoring it avoids a double toggle on top of the checkbox's own onCheckedChange). Escape hatch
// for anything added later: mark it data-no-select.
const IGNORE_SELECTOR = 'button, a, input, label, [data-no-select]';

// Same raw-CSS breakpoint FavoriteListItemRow's own desktop/mobile split uses (not Chakra's
// responsive prop — see that component's comment for why).
const MOBILE_QUERY = '@media (max-width: 47.9375em)';

interface SelectableRowProps {
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  ariaLabel: string;
  children: ReactNode;
  // ContendersPage's desktop-only bulk selection (docs/decisions/aoty/aoty-hub-population.md:
  // checkboxes and the bulk action bar are desktop-only, mobile keeps single-row remove).
  // AddToContendersPicker leaves this false — its checkbox is the only selection affordance it
  // has, always narrower than md inside a Drawer, so it must always show.
  desktopOnly?: boolean;
}

// Shared selection wrapper for FavoriteListItemRow-shaped rows (ContendersPage, AddToContenders
// Picker): checkbox column outside the wrapped card's own frame, click-anywhere-on-the-row
// toggle. The wrapped row stays selection-agnostic — this owns all selection UI/state plumbing.
export function SelectableRow({
  selected,
  onToggleSelect,
  ariaLabel,
  children,
  desktopOnly = false,
}: SelectableRowProps) {
  const [accentBorderColor] = useToken('colors', 'accent.border');
  const checkboxColumnRef = useRef<HTMLDivElement>(null);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return;
    // desktopOnly hides the checkbox column below md via CSS, not a conditional render — so a
    // stale ref isn't a risk, but there's genuinely no selection UI to react to at that width.
    // getComputedStyle re-reads the live cascade on every call (no cached/stale value, no
    // matchMedia/resize listener needed), so this stays correct across a mid-session resize too.
    if (
      desktopOnly &&
      checkboxColumnRef.current &&
      getComputedStyle(checkboxColumnRef.current).display === 'none'
    ) {
      return;
    }
    onToggleSelect(!selected);
  }

  return (
    <Flex align="center" gap={3} cursor="pointer" onClick={handleClick}>
      <Box
        ref={checkboxColumnRef}
        flexShrink={0}
        css={desktopOnly ? { [MOBILE_QUERY]: { display: 'none' } } : undefined}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(details) => onToggleSelect(!!details.checked)}
          inputProps={{ 'aria-label': ariaLabel }}
        />
      </Box>
      <Box
        flex={1}
        minW={0}
        css={{
          boxShadow: selected ? `0 0 0 2px ${accentBorderColor}` : 'none',
          ...(desktopOnly ? { [MOBILE_QUERY]: { boxShadow: 'none' } } : {}),
        }}
      >
        {children}
      </Box>
    </Flex>
  );
}
