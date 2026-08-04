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
        orientation="horizontal"
        justify="space-between"
        align="center"
      >
        <VStack gap={2} align="stretch">
          {Object.entries(entry.levels)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([level, info]) => (
              <RadioCardItem
                key={level}
                value={level}
                // Chakra's radio-card recipe couples the `align="center"` variant (needed below
                // for vertical centering) to itemControl's textAlign, forcing center-aligned
                // text — overridden here via explicit textAlign on the content itself rather
                // than by changing `align`, which would also break the indicator's centering.
                label={
                  <Text textAlign="left" textTransform="uppercase">
                    {level} — {info.label}
                  </Text>
                }
                description={
                  <Text textAlign="left">{formatLevelDescription(info.description)}</Text>
                }
                disabled={disabled}
                indicator={<RadioCardItemIndicator borderRadius="circle" />}
              />
            ))}
        </VStack>
      </RadioCardRoot>
    </VStack>
  );
}
