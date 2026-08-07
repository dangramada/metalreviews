import { Box } from '@chakra-ui/react';
import { CriterionLevelList } from './CriterionLevelList';
import { SelectAction } from './SelectAction';
import type { CriterionData } from './CriterionRow';

interface OptionCardProps {
  criteria: CriterionData[];
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

// No "Card A"/"Card B" label — options are distinguished by position only
// (decision this session; matches the reference pattern this was checked
// against). Deliberately a plain Box, not Chakra's RadioCard: RadioCard makes
// the whole card the click target via its hidden-input label, but the spec
// wants SelectAction (a real full-width button) to be the only click target.
// Selected state reuses the existing accent.border/accent.ink convention
// directly (same as the active nav tab and the score-slab threshold) — no new
// color treatment invented here.
//
// Hover: same 2px border + plain borderColor-swap-to-border.hover language as
// the reviews-grid card and the favorites row (FavoritesPage.tsx) — no
// transition property, no background shift. That's deliberate: this app's
// brutalist visual language treats hover as an abrupt state snap, not an
// animated one. Suppressed once a card is selected or a transition is in
// flight, so hovering never fights the accent highlight or invites a click
// that's currently blocked.
export function OptionCard({ criteria, selected, disabled, onSelect }: OptionCardProps) {
  return (
    <Box
      as="article"
      flex="1"
      display="flex"
      flexDirection="column"
      gap={4}
      p={6}
      border="2px solid"
      borderColor={selected ? 'accent.border' : 'border.ruleStrong'}
      borderRadius="none"
      bg={selected ? 'accent.border' : 'surface.card'}
      _hover={!selected && !disabled ? { borderColor: 'border.hover' } : undefined}
    >
      <CriterionLevelList criteria={criteria} selected={selected} />
      <SelectAction onClick={onSelect} disabled={disabled} />
    </Box>
  );
}
