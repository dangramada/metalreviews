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
}: {
  entry: CriterionCatalogEntry;
  selectedLevel: number | undefined;
  onPick: (level: number) => void;
  disabled: boolean;
}) {
  return (
    <VStack align="stretch" gap={4}>
      <Heading as="h3" size="md">
        {entry.name}
      </Heading>
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
                  <Text textTransform="uppercase">
                    {level} – {info.label}
                  </Text>
                }
                description={<Text>{formatLevelDescription(info.description)}</Text>}
                disabled={disabled}
                indicator={<RadioCardItemIndicator borderRadius="circle" />}
                contentAlignItems="flex-start"
              />
            ))}
        </VStack>
      </RadioCardRoot>
    </VStack>
  );
}
