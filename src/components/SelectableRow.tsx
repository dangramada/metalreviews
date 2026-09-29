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

// Visually hides the checkbox without pulling it out of the accessibility tree — a screen
// reader must still announce it. This is Chakra's own `srOnly` utility's exact value
// (node_modules/@chakra-ui/react/dist/esm/preset-base.js's `srMapping.true`), copied as raw CSS
// rather than used via the `srOnly` prop itself: that prop's responsive form takes Chakra's own
// breakpoint object, and this component stays on the raw-@media convention above instead.
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
} as const;

interface SelectableRowProps {
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  ariaLabel: string;
  children: ReactNode;
  // ContendersPage's desktop-only bulk selection (docs/decisions/aoty/aoty-hub-population.md:
  // checkboxes and the bulk action bar are desktop-only, mobile keeps single-row remove). Hides
  // the checkbox with display:none (removed from the a11y tree too — there's genuinely no
  // selection feature on Contenders mobile) and disables click-to-toggle there via the
  // getComputedStyle guard below. Never combine with hideCheckboxOnMobile.
  desktopOnly?: boolean;
  // AddToContendersPicker: hides the checkbox visually below md to give the card's title/artist
  // more width, without removing it from the accessibility tree (unlike desktopOnly's
  // display:none) and without touching click-to-toggle or the selected-state ring — both stay
  // the only way to select on that narrow layout, since the picker's checkbox is otherwise its
  // sole selection affordance (see AddToContendersPicker's own comment on why desktopOnly
  // itself doesn't fit there).
  hideCheckboxOnMobile?: boolean;
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
  hideCheckboxOnMobile = false,
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
        css={
          desktopOnly
            ? { [MOBILE_QUERY]: { display: 'none' } }
            : hideCheckboxOnMobile
              ? { [MOBILE_QUERY]: VISUALLY_HIDDEN }
              : undefined
        }
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
