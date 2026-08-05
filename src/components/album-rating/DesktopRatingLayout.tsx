// Desktop (>= md) layout for the Album Rating Page: one bordered card containing 3 sections
// (artwork+meta, criteria+levels, rank/score+chart) per the reference design — see
// docs/decisions/album-rating-page.md's dated entry for the redesign from the original
// 3-simultaneous-columns layout this replaces.
import { Badge, Box, Flex, Heading, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { AlbumArtwork } from './AlbumArtwork';
import { CriterionLevelPicker } from './CriterionLevelPicker';
import { RatingSlab } from './RatingSlab';
import { RatingRadarChart, type CriterionLevelWeight } from './RatingRadarChart';
import { formatReleaseDate } from '../../App';
import { genreBadge } from '../../theme';
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
    //
    // No padding here (third pass, spacing sweep) — all 3 sections sit flush against this
    // border; each section supplies its own internal spacing where needed (the artwork/meta
    // column's text block being the one explicit exception, see below).
    <Box bg="surface.ratingCardFill" border="2px solid" borderColor="border.ruleStrong">
      {/* align="stretch" (not the previous flex-start) so all 3 sections share the same
          height — needed for each section's own ink.900 fill (surface.card, added this pass)
          to cover its full content area rather than just its shortest child's height. */}
      <Flex gap={0} align="stretch">
        {/* Section 1: artwork (flush) + band/album/date/genre text block. Band/album typography
            matches the review card's exactly (App.tsx ~line 741) rather than inventing new
            styles — 19px/700/uppercase band, 18px/500 album, tightly stacked with no gap
            between them (same as the review card), functioning as row 1 of this section's 3
            stacked rows. Inlined rather than reusing AlbumMeta.tsx: AlbumMeta's own internal
            margins (mb=1/mb=2) would stack with this section's 12px row gap and produce
            inconsistent spacing — not required to extract this pass, so duplicated instead of
            risking a shared-component change that could also affect the review card's spacing. */}
        <VStack flex="0 0 300px" align="stretch" gap={0} bg="surface.card">
          <AlbumArtwork artworkUrl={artworkUrl} band={band} album={album} size="300px" />
          <VStack align="stretch" gap="12px" px="16px" py="12px">
            <Box>
              <Heading
                as="h3"
                fontFamily="body"
                fontSize="19px"
                fontWeight={700}
                lineHeight="1.1"
                letterSpacing="-0.01em"
                textTransform="uppercase"
              >
                {band}
              </Heading>
              <Text fontFamily="body" fontSize="18px" fontWeight={500} color="text.primary">
                {album}
              </Text>
            </Box>
            <Text
              fontFamily="mono"
              fontSize="11px"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="text.muted"
            >
              Release date: {formatReleaseDate(releaseDate)}
            </Text>
            {genre.length > 0 && (
              <Wrap gap={1}>
                {genre.map((g) => (
                  <WrapItem key={g}>
                    <Badge {...genreBadge}>{g}</Badge>
                  </WrapItem>
                ))}
              </Wrap>
            )}
          </VStack>
        </VStack>

        {/* Section 2: one wrapper, horizontal split — criteria list left, active criterion's
            levels right. Left/right border only (fourth pass) — the outer 2px card border
            already frames top/bottom now that everything's flush. bg="surface.criterionRow"
            (sand.950) is the resting fill for non-active rows and the list container; the
            active row + its level picker (below) get the lighter surface.criterionActive
            (ink.800) instead, forming one highlighted block against the darker resting rows. */}
        <Flex
          flex="1 1 0"
          minW={0}
          borderLeft="1px solid"
          borderRight="1px solid"
          borderColor="surface.ratingCard"
          bg="surface.criterionRow"
        >
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
                  py={4}
                  bg={isSelected ? 'surface.criterionActive' : undefined}
                  _hover={{ bg: isSelected ? 'surface.criterionActive' : 'surface.criterionHover' }}
                >
                  <Text
                    fontWeight="semibold"
                    color={isSelected ? 'ember.500' : 'text.primary'}
                    fontSize="sm"
                    textTransform="uppercase"
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

          {/* Same lighter fill as the active row (ink.800) — this panel only ever shows the
              active criterion's levels, so it stays visually joined to that row. */}
          <Box flex="1.4 1 0" minW={0} bg="surface.criterionActive" p={4}>
            {selectedEntry && (
              <CriterionLevelPicker
                entry={selectedEntry}
                selectedLevel={ratings.get(selectedEntry.index)}
                onPick={(level) => onPick(selectedEntry.index, level)}
                disabled={savingCriterionId !== null}
                showTitle={false}
              />
            )}
          </Box>
        </Flex>

        {/* Section 3: rank/score slabs + radar chart. bg="surface.card" — same third-pass fill
            as the other two sections. */}
        <VStack flex="0 0 220px" align="stretch" gap={4} bg="surface.card">
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
