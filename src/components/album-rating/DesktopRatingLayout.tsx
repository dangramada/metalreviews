// Desktop (>= md) layout for the Album Rating Page: one bordered card containing 3 sections
// (artwork+meta, criteria+levels, rank/score+chart) per the reference design — see
// docs/decisions/album-rating-page.md's dated entry for the redesign from the original
// 3-simultaneous-columns layout this replaces.
import { Box, Flex, Heading, Text, VStack } from '@chakra-ui/react';
import { AlbumArtwork } from './AlbumArtwork';
import { AlbumMeta } from './AlbumMeta';
import { CriterionLevelPicker } from './CriterionLevelPicker';
import { RatingSlab } from './RatingSlab';
import { RatingRadarChart, type CriterionLevelWeight } from './RatingRadarChart';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';

interface DesktopRatingLayoutProps {
  artworkUrl: string | null;
  band: string;
  album: string;
  releaseDate: string | null;
  genre: string[];
  catalog: CriteriaCatalog | null;
  order: number[];
  ratings: Map<number, number>;
  weights: CriterionLevelWeight[];
  selectedCriterionId: number;
  onSelectCriterion: (id: number) => void;
  onPick: (criterionId: number, level: number) => void;
  savingCriterionId: number | null;
  ratingSummary: AlbumRatingSummary | undefined;
}

export function DesktopRatingLayout({
  artworkUrl,
  band,
  album,
  releaseDate,
  genre,
  catalog,
  order,
  ratings,
  weights,
  selectedCriterionId,
  onSelectCriterion,
  onPick,
  savingCriterionId,
  ratingSummary,
}: DesktopRatingLayoutProps) {
  const selectedEntry = catalog?.entries[selectedCriterionId];

  const rankValue = ratingSummary ? `#${ratingSummary.rank}` : '—';
  const scoreValue = ratingSummary ? `${Math.min(100, Math.round(ratingSummary.score * 100))}%` : '—';

  return (
    // Static border only, matching the review card's border.ruleStrong — but not its
    // score-conditional hover mechanism (cardHoverBorderColor in App.tsx), since this page has
    // no score to link a hover state to. No hover treatment at all: unlike the review card and
    // the Favorites-row precedent (FavoritesPage.tsx's plain border.hover-on-hover fallback for
    // exactly this "no score" case, from slant-take-design-system.md pass 9), this card isn't a
    // link/button — nothing happens on hover, so there's no interaction to give feedback for.
    <Box bg="surface.ratingCardFill" border="2px solid" borderColor="border.ruleStrong" p={6}>
      {/* fontFamily="body", never "heading" — same rule as the shared page-level heading this
          replaced (see StyleGuide.tsx's "Band/album card typography" specimen). Moved inside
          the card, at the top, per the retouch pass — was previously a separate page heading
          above/outside the card. */}
      <Heading
        as="h2"
        fontFamily="body"
        fontSize="19px"
        fontWeight={700}
        textTransform="uppercase"
        mb={4}
      >
        {band} –{' '}
        <Text as="span" fontWeight={500} textTransform="none">
          {album}
        </Text>
      </Heading>
      <Flex gap={6} align="flex-start">
        {/* Section 1: artwork + release date/genre */}
        <VStack flex="0 0 300px" align="stretch" gap={3}>
          <AlbumArtwork artworkUrl={artworkUrl} band={band} album={album} size="300px" />
          <AlbumMeta releaseDate={releaseDate} genre={genre} />
        </VStack>

        {/* Section 2: one bordered wrapper, horizontal split — criteria list left, active
            criterion's levels right */}
        <Flex flex="1 1 0" minW={0} border="1px solid" borderColor="surface.ratingCard">
          <VStack flex="1 1 0" minW={0} align="stretch" gap={0}>
            {order.map((id) => {
              const entry = catalog?.entries[id];
              const level = ratings.get(id);
              const isSelected = selectedCriterionId === id;
              const isRated = level !== undefined;
              const statusLabel = isRated && entry ? `${level}–${entry.levels[level]?.label}` : 'NOT EVALUATED';
              return (
                <Flex
                  key={id}
                  as="button"
                  onClick={() => onSelectCriterion(id)}
                  direction="column"
                  align="flex-start"
                  gap={1}
                  px={4}
                  py={3}
                  bg={isSelected ? 'surface.criterionActive' : 'transparent'}
                  _hover={{ bg: isSelected ? 'surface.criterionActive' : 'surface.criterionHover' }}
                >
                  <Text fontWeight="semibold" color="text.primary" fontSize="sm" textTransform="uppercase">
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
                    // Rated: accent.border/accent.ink — same pairing as scoreSlabHigh, ~6.8:1
                    // contrast. Not-evaluated: sand.700/text.dim measured live at only ~4.1:1
                    // (fails WCAG AA's 4.5:1 for this 10px text) — text.primary (sand.200)
                    // brings the same sand.700 bg to ~6.9:1, both verified via computed
                    // sRGB values, not eyeballed.
                    bg={isRated ? 'accent.border' : 'sand.700'}
                    color={isRated ? 'accent.ink' : 'text.primary'}
                  >
                    {statusLabel}
                  </Text>
                </Flex>
              );
            })}
          </VStack>

          <Box flex="1.4 1 0" minW={0} bg="surface.criterionActive" p={4}>
            {selectedEntry && (
              <CriterionLevelPicker
                entry={selectedEntry}
                selectedLevel={ratings.get(selectedEntry.index)}
                onPick={(level) => onPick(selectedEntry.index, level)}
                disabled={savingCriterionId !== null}
              />
            )}
          </Box>
        </Flex>

        {/* Section 3: rank/score slabs + radar chart */}
        <VStack flex="0 0 220px" align="stretch" gap={4}>
          <Flex gap={0}>
            <RatingSlab label="Rank" value={rankValue} variant="high" />
            <RatingSlab label="Score" value={scoreValue} variant="base" />
          </Flex>
          <RatingRadarChart catalog={catalog} ratings={ratings} order={order} weights={weights} size="full" />
        </VStack>
      </Flex>
    </Box>
  );
}
