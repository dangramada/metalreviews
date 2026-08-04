// Mobile (< md) layout for the Album Rating Page: two sequential screens (Overview/Detail),
// not the desktop columns compressed. Fixed header (artwork + title + small radar) present on
// both screens; the "back to source" link only appears on Overview — the Detail screen's own
// back arrow always means "back within the rating flow," a deliberately separate action at a
// deliberately separate scope. See docs/decisions/album-rating-page.md.
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Icon, Link as ChakraLink, Text, VStack } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { LuArrowLeft, LuCheck, LuCircle } from 'react-icons/lu';
import { AlbumArtwork } from './AlbumArtwork';
import { CriterionLevelPicker } from './CriterionLevelPicker';
import { RatingRadarChart, type CriterionLevelWeight } from './RatingRadarChart';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import { primaryButton } from '../../theme';

// Auto-return delay after a pick, then how long the just-updated row stays highlighted before
// settling to its normal completed appearance — both "use your judgment" per the brief, not
// precisely specified.
const AUTO_RETURN_MS = 1750;
const HIGHLIGHT_FADE_MS = 2500;

interface MobileRatingLayoutProps {
  artworkUrl: string | null;
  band: string;
  album: string;
  catalog: CriteriaCatalog | null;
  order: number[];
  ratings: Map<number, number>;
  // Now required by RatingRadarChart even in its small size — the chart plots weight
  // directly, not just level, so the ambient header chart needs real weight data too.
  weights: CriterionLevelWeight[];
  onPick: (criterionId: number, level: number) => Promise<void>;
  savingCriterionId: number | null;
  isComplete: boolean;
  onOpenSummary: () => void;
  backHref: string;
  backLabel: string;
}

export function MobileRatingLayout({
  artworkUrl,
  band,
  album,
  catalog,
  order,
  ratings,
  weights,
  onPick,
  savingCriterionId,
  isComplete,
  onOpenSummary,
  backHref,
  backLabel,
}: MobileRatingLayoutProps) {
  const [screen, setScreen] = useState<'overview' | 'detail'>('overview');
  const [detailCriterionId, setDetailCriterionId] = useState<number | null>(null);
  const [highlightedCriterionId, setHighlightedCriterionId] = useState<number | null>(null);
  const returnTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (returnTimeout.current) clearTimeout(returnTimeout.current);
      if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
    };
  }, []);

  async function handlePick(criterionId: number, level: number) {
    await onPick(criterionId, level);
    returnTimeout.current = setTimeout(() => {
      setScreen('overview');
      setHighlightedCriterionId(criterionId);
      fadeTimeout.current = setTimeout(() => setHighlightedCriterionId(null), HIGHLIGHT_FADE_MS);
    }, AUTO_RETURN_MS);
  }

  const detailEntry = detailCriterionId !== null ? catalog?.entries[detailCriterionId] : undefined;

  return (
    <VStack align="stretch" gap={4}>
      {/* Fixed header, present on both screens */}
      <Flex align="center" gap={3}>
        <AlbumArtwork artworkUrl={artworkUrl} band={band} album={album} size="56px" />
        <Box flex={1} minW={0}>
          <Text fontWeight="semibold" lineClamp={1}>
            {band} – {album}
          </Text>
          {screen === 'overview' && (
            <ChakraLink as={RouterLink} to={backHref} color="text.dim" fontSize="sm" _hover={{ color: 'accent.text' }}>
              {backLabel}
            </ChakraLink>
          )}
        </Box>
        <RatingRadarChart catalog={catalog} ratings={ratings} order={order} weights={weights} size="small" />
      </Flex>

      {screen === 'overview' ? (
        <VStack align="stretch" gap={1}>
          {order.map((id) => {
            const entry = catalog?.entries[id];
            const level = ratings.get(id);
            const rated = level !== undefined;
            const highlighted = highlightedCriterionId === id;
            return (
              <Flex
                key={id}
                as="button"
                onClick={() => {
                  setDetailCriterionId(id);
                  setScreen('detail');
                }}
                align="center"
                gap={3}
                px={4}
                py={3}
                borderRadius="md"
                border="1px solid"
                borderColor={highlighted ? 'accent.border' : 'transparent'}
                bg={highlighted ? 'accent.border' : 'transparent'}
                _hover={{ bg: highlighted ? 'accent.border' : 'surface.raised' }}
              >
                <Icon as={rated ? LuCheck : LuCircle} color={highlighted ? 'accent.ink' : rated ? 'accent.text' : 'text.dim'} />
                <Text flex={1} textAlign="left" color={highlighted ? 'accent.ink' : 'text.primary'} fontWeight={rated ? 'semibold' : 'normal'}>
                  {entry?.name}
                </Text>
                {rated && entry && (
                  <Text fontSize="sm" color={highlighted ? 'accent.ink' : 'text.dim'}>
                    {entry.levels[level]?.label}
                  </Text>
                )}
              </Flex>
            );
          })}
          {isComplete && (
            <Button {...primaryButton} mt={2} onClick={onOpenSummary}>
              View Your Evaluation
            </Button>
          )}
        </VStack>
      ) : (
        detailEntry && (
          <VStack align="stretch" gap={4}>
            <Flex
              as="button"
              onClick={() => setScreen('overview')}
              align="center"
              gap={2}
              color="text.dim"
              _hover={{ color: 'text.primary' }}
              alignSelf="flex-start"
            >
              <Icon as={LuArrowLeft} />
              <Text>Back</Text>
            </Flex>
            <CriterionLevelPicker
              entry={detailEntry}
              selectedLevel={ratings.get(detailEntry.index)}
              onPick={(level) => handlePick(detailEntry.index, level)}
              disabled={savingCriterionId !== null}
            />
          </VStack>
        )
      )}
    </VStack>
  );
}
