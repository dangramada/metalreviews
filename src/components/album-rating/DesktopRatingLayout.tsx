// Desktop (>= md) layout for the Album Rating Page: 3 fluid columns, all visible
// simultaneously — clicking a Column 2 row only changes what Column 3 renders, no route
// change. See docs/decisions/album-rating-page.md and the concept draft this implements.
import { Box, Button, Flex, Text, VStack } from '@chakra-ui/react';
import { AlbumArtwork } from './AlbumArtwork';
import { CriterionLevelPicker } from './CriterionLevelPicker';
import { RatingRadarChart, type CriterionLevelWeight } from './RatingRadarChart';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import { primaryButton } from '../../theme';

interface DesktopRatingLayoutProps {
  artworkUrl: string | null;
  band: string;
  album: string;
  catalog: CriteriaCatalog | null;
  order: number[];
  ratings: Map<number, number>;
  weights: CriterionLevelWeight[];
  selectedCriterionId: number | null;
  onSelectCriterion: (id: number) => void;
  onPick: (criterionId: number, level: number) => void;
  savingCriterionId: number | null;
  isComplete: boolean;
  onOpenSummary: () => void;
}

export function DesktopRatingLayout({
  artworkUrl,
  band,
  album,
  catalog,
  order,
  ratings,
  weights,
  selectedCriterionId,
  onSelectCriterion,
  onPick,
  savingCriterionId,
  isComplete,
  onOpenSummary,
}: DesktopRatingLayoutProps) {
  const selectedEntry =
    selectedCriterionId !== null ? catalog?.entries[selectedCriterionId] : undefined;

  return (
    <Flex gap={8} align="flex-start">
      {/* Column 1: artwork + radar chart + completion CTA */}
      <VStack flex="1 1 0" minW={0} align="stretch" gap={4}>
        <Flex justify="center">
          <AlbumArtwork artworkUrl={artworkUrl} band={band} album={album} size="220px" />
        </Flex>
        <RatingRadarChart catalog={catalog} ratings={ratings} order={order} weights={weights} size="full" />
        {isComplete && (
          <Button {...primaryButton} onClick={onOpenSummary}>
            View Your Evaluation
          </Button>
        )}
      </VStack>

      {/* Column 2: criterion names only, no values inline */}
      <VStack flex="1 1 0" minW={0} align="stretch" gap={1}>
        {order.map((id) => {
          const entry = catalog?.entries[id];
          const selected = selectedCriterionId === id;
          return (
            <Box
              key={id}
              as="button"
              onClick={() => onSelectCriterion(id)}
              textAlign="left"
              px={4}
              py={3}
              borderRadius="md"
              fontWeight="semibold"
              bg={selected ? 'accent.border' : 'transparent'}
              color={selected ? 'accent.ink' : 'text.primary'}
              _hover={{ bg: selected ? 'accent.border' : 'surface.raised' }}
            >
              {entry?.name}
            </Box>
          );
        })}
      </VStack>

      {/* Column 3: placeholder until a criterion is selected, then its 5 levels */}
      <Box flex="1.4 1 0" minW={0}>
        {!selectedEntry ? (
          <Flex minH="300px" align="center" justify="center">
            <Text color="text.muted">Select a criterion to begin</Text>
          </Flex>
        ) : (
          <CriterionLevelPicker
            entry={selectedEntry}
            selectedLevel={ratings.get(selectedEntry.index)}
            onPick={(level) => onPick(selectedEntry.index, level)}
            disabled={savingCriterionId !== null}
          />
        )}
      </Box>
    </Flex>
  );
}
