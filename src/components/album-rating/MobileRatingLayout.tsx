// Mobile (< md) layout for the Album Rating Page: two sequential screens (Overview/Detail),
// not the desktop columns compressed. Stage 1 of the mobile-album-evaluation-redesign brief
// brought this in line with DesktopRatingLayout's bordered-card visual language: one 2px-bordered
// card (surface.ratingCardFill / border.ruleStrong, same tokens as desktop) wrapping an
// album-info zone, the progress/rank+score box (RatingProgressBox, shared with desktop), and a
// criteria list with desktop's exact text-badge format — replacing the old fixed header
// (56px artwork + ambient radar chart + "← Favorites" link) and checkmark/circle row icons.
// See docs/decisions/album-rating-page.md for the dated stage-1 entry.
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Icon, Text, VStack } from '@chakra-ui/react';
import { LuArrowLeft, LuChevronRight } from 'react-icons/lu';
import { AlbumArtwork } from './AlbumArtwork';
import { AlbumMetaBlock } from './AlbumMetaBlock';
import { CriterionLevelPicker } from './CriterionLevelPicker';
import { RatingProgressBox } from './RatingProgressBox';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';
import type { CriterionLevelWeight } from './RatingRadarChart';
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
  releaseDate: string | null;
  genre: string[];
  catalog: CriteriaCatalog | null;
  order: number[];
  ratings: Map<number, number>;
  weights: CriterionLevelWeight[];
  ratingSummary: AlbumRatingSummary | undefined;
  onPick: (criterionId: number, level: number) => Promise<void>;
  savingCriterionId: number | null;
  isComplete: boolean;
  onOpenSummary: () => void;
}

export function MobileRatingLayout({
  artworkUrl,
  band,
  album,
  releaseDate,
  genre,
  catalog,
  order,
  ratings,
  ratingSummary,
  onPick,
  savingCriterionId,
  isComplete,
  onOpenSummary,
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

  // Zone 1 — artwork-left/meta-right, reimplemented locally from FavoriteListItemRow's desktop
  // tree (FavoritesPage.tsx, the >=768px `Flex` there) rather than shared/extracted this pass —
  // 96px here vs. that row's 128px, hideGenres since this page shows genre nowhere else either.
  const albumInfo = (
    <Flex align="center" gap={4} p={4}>
      <Box flexShrink={0}>
        <AlbumArtwork artworkUrl={artworkUrl} band={band} album={album} size="96px" />
      </Box>
      <Box flex={1} minW={0}>
        <AlbumMetaBlock
          band={band}
          album={album}
          releaseDate={releaseDate}
          genre={genre}
          titleLayout="stacked"
          hideGenres
          padding={{ x: 0, y: 0 }}
        />
      </Box>
    </Flex>
  );

  return (
    <Box bg="surface.ratingCardFill" border="2px solid" borderColor="border.ruleStrong" borderRadius="none">
      {screen === 'overview' ? (
        <VStack align="stretch" gap={0}>
          {albumInfo}
          <Box borderTop="1px solid" borderColor="border.ruleStrong" px={4} py={4}>
            <RatingProgressBox ratedCount={ratings.size} totalCount={order.length} ratingSummary={ratingSummary} />
          </Box>
          <VStack align="stretch" gap={0} borderTop="1px solid" borderColor="border.ruleStrong">
            {order.map((id, index) => {
              const entry = catalog?.entries[id];
              const level = ratings.get(id);
              const isRated = level !== undefined;
              const isLast = index === order.length - 1;
              const highlighted = highlightedCriterionId === id;
              // Same inline format as DesktopRatingLayout's criteria-row badge — no shared
              // helper exists yet to call instead (confirmed via grep), so this replicates the
              // exact expression rather than inventing a new one.
              const statusLabel = isRated && entry ? `${level}–${entry.levels[level]?.label}` : 'NOT EVALUATED';
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
                  py={4}
                  borderBottom={isLast ? 'none' : '1px solid'}
                  borderColor="sand.600"
                  bg={highlighted ? 'accent.border' : undefined}
                  _hover={{ bg: highlighted ? 'accent.border' : 'surface.criterionHover' }}
                >
                  <Text
                    flex={1}
                    textAlign="left"
                    fontWeight="semibold"
                    fontSize="sm"
                    textTransform="uppercase"
                    color={highlighted ? 'accent.ink' : 'text.primary'}
                  >
                    {entry?.name}
                  </Text>
                  <Text
                    as="span"
                    fontFamily="mono"
                    fontSize="11px"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing="0.06em"
                    px="8px"
                    py="4px"
                    bg={isRated ? 'accent.border' : 'sand.700'}
                    color={isRated ? 'accent.ink' : 'text.primary'}
                  >
                    {statusLabel}
                  </Text>
                  <Icon as={LuChevronRight} color={highlighted ? 'accent.ink' : 'text.dim'} />
                </Flex>
              );
            })}
          </VStack>
          {isComplete && (
            <Box px={4} py={4}>
              <Button {...primaryButton} w="100%" onClick={onOpenSummary}>
                View Your Evaluation
              </Button>
            </Box>
          )}
        </VStack>
      ) : (
        detailEntry && (
          <VStack align="stretch" gap={0}>
            {albumInfo}
            <Flex
              as="button"
              onClick={() => setScreen('overview')}
              align="center"
              gap={2}
              px={4}
              py={4}
              borderTop="1px solid"
              borderColor="border.ruleStrong"
              color="text.dim"
              _hover={{ color: 'text.primary' }}
            >
              <Icon as={LuArrowLeft} />
              <Text fontWeight="semibold" fontSize="sm" textTransform="uppercase">
                {detailEntry.name}
              </Text>
            </Flex>
            <Box px={4} pb={4}>
              <CriterionLevelPicker
                entry={detailEntry}
                selectedLevel={ratings.get(detailEntry.index)}
                onPick={(level) => handlePick(detailEntry.index, level)}
                disabled={savingCriterionId !== null}
                showTitle={false}
              />
            </Box>
          </VStack>
        )
      )}
    </Box>
  );
}
