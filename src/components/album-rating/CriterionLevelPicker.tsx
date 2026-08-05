// Level picker for a single criterion — same RadioCardRoot/RadioCardItem (Chakra native,
// src/components/ui/radio-card.tsx) and label/description shape the old AlbumRatingDrawer
// used per criterion, just scoped to one criterion at a time instead of looping over all six
// in a flat scrollable list. Shared by DesktopRatingLayout's Column 3 and MobileRatingLayout's
// Detail screen so both layouts render levels identically.
import { Heading, Text, VStack } from '@chakra-ui/react';
import { RadioCardItem, RadioCardItemIndicator, RadioCardRoot } from '../ui/radio-card';
import { formatLevelDescription, type CriterionCatalogEntry } from '../../lib/criteria-calibration/criteriaCatalog';

export function CriterionLevelPicker({
  entry,
  selectedLevel,
  onPick,
  disabled,
  // Desktop's row already shows the criterion name to the left of the picker, so this
  // component's own title is redundant there — but MobileRatingLayout's Detail screen has no
  // such row (it's a full-screen view keyed only on the selected criterion), so it still needs
  // this heading. Defaults to shown, so mobile is unaffected.
  showTitle = true,
}: {
  entry: CriterionCatalogEntry;
  selectedLevel: number | undefined;
  onPick: (level: number) => void;
  disabled: boolean;
  showTitle?: boolean;
}) {
  return (
    <VStack align="stretch" gap={4}>
      {showTitle && (
        <Heading as="h3" size="md">
          {entry.name}
        </Heading>
      )}
      <RadioCardRoot
        value={selectedLevel?.toString() ?? null}
        onValueChange={(details) => {
          if (details.value) onPick(parseInt(details.value, 10));
        }}
        // `justify="space-between"` was here before but is not a valid value for this recipe's
        // `justify` variant (only start/end/center are defined) — confirmed live via computed
        // style that it silently did nothing (`--radio-card-justify` was empty). Removed rather
        // than kept as inert/misleading; the indicator still lands at the row's end because
        // ItemContent's own `flex: 1` already fills the remaining space.
        orientation="horizontal"
        align="center"
      >
        <VStack gap={2} align="stretch">
          {Object.entries(entry.levels)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([level, info]) => (
              <RadioCardItem
                key={level}
                value={level}
                // Chakra's radio-card recipe couples `align="center"` (needed below for the
                // indicator's vertical centering) to ItemContent's own `alignItems`, which
                // centers the whole label/description block as a flex item — the block shrinks
                // to its content width, so text-align inside it has no visible effect (verified
                // live via computed style: the inner text WAS text-align:left, but still
                // rendered centered because the block containing it was). Fixed via
                // `contentAlignItems="flex-start"`, which targets only ItemContent, not
                // ItemControl — the indicator's centering is untouched.
                label={
                  <Text textAlign="left" textTransform="uppercase">
                    {level} – {info.label}
                  </Text>
                }
                description={
                  <Text textAlign="left">{formatLevelDescription(info.description)}</Text>
                }
                disabled={disabled}
                // `sand.200` checked highlight, overridden explicitly rather than via
                // `colorPalette` — `sand` isn't registered as a full color palette (only
                // `ember` is, see theme.ts's semantic-token block), so `colorPalette.solid`
                // wouldn't resolve correctly for a raw ramp with no semantic sub-keys. Item's
                // own `_checked` covers the outline/box-shadow ring; the indicator's `_checked`
                // covers its fill dot — both driven by `colorPalette.solid`/`.contrast` in the
                // recipe otherwise.
                _checked={{ borderColor: 'sand.200', boxShadowColor: 'sand.200' }}
                indicator={
                  <RadioCardItemIndicator
                    borderRadius="circle"
                    // Default (unchecked) state — this project never set its own value here
                    // before, so it was falling back to Chakra's built-in `border.emphasized` at
                    // 1px. Explicit sand.600/2px now; `_checked` below still overrides both for
                    // the selected state.
                    borderColor="sand.600"
                    borderWidth="2px"
                    _checked={{ bg: 'sand.200', borderColor: 'sand.200', color: 'ink.900' }}
                  />
                }
                contentAlignItems="flex-start"
              />
            ))}
        </VStack>
      </RadioCardRoot>
    </VStack>
  );
}
