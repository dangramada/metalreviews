// Desktop (>= md) layout for the Album Rating Page: one bordered card containing 3 sections
// (artwork+meta, criteria+levels, rank/score+chart) per the reference design — see
// docs/decisions/album-rating-page.md's dated entry for the redesign from the original
// 3-simultaneous-columns layout this replaces.
import { Badge, Box, Flex, Heading, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { motion } from 'framer-motion';
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

  // Pending on ratings.size alone, not on ratingSummary's presence — ratingSummary refetches
  // asynchronously after the 6th save (see AlbumRatingPage.tsx's handlePick), so gating on it
  // instead would leave a stale "—" flash between the 6th pick and the refetch resolving.
  const isPending = ratings.size < order.length;
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
    <Box
      bg="surface.ratingCardFill"
      border="2px solid"
      borderColor="border.ruleStrong"
      // Two internal tiers within this >=768px component (the 768px Tier 3/mobile split itself
      // lives one level up, in AlbumRatingPage.tsx — MobileRatingLayout is untouched). Raw
      // `@media` at 64em/1024px, not Chakra's `lg` token (992px in this theme, no custom
      // breakpoints defined) — the brief calls out 1024px specifically, so the token would
      // silently shift the boundary.
      //   - Tier 2 (768-1023px): 2-row grid, Section 1 + Section 3 sharing row 1, Section 2
      //     full width on row 2 below.
      //   - Tier 1 (>=1024px): single row, all 3 sections side by side, rebalanced so Section 2
      //     (criteria+levels — the most content-sensitive section) keeps priority over Section 3
      //     as the viewport narrows.
      // Column tracks chosen by live testing at 768/900/1023 and 1024/1150/1300/1600+:
      //   - Section 1 stays a fixed 300px at the wide tier (least to gain from flexing, and the
      //     300x300 artwork requirement is explicit) but must go fluid at Tier 2, where it
      //     shares a row with Section 3 instead of spanning full width.
      //   - Section 2 gets minmax(420px, 1.6fr) — 420px is the narrowest width at which the
      //     level-picker's longest level descriptions still wrap to no more than 2 lines at
      //     1024px; the 1.6fr share means it gives up space to Section 3 more slowly as the
      //     viewport narrows.
      //   - Section 3 gets minmax(220px, 0.9fr) — 220px matches RatingSlab's already-fixed
      //     width from the pre-responsive layout (below that, "Score" + a 3-digit percentage
      //     starts crowding); the radar chart's own ResponsiveContainer absorbs the rest.
      css={{
        display: 'grid',
        gridTemplateAreas: '"art score" "crit crit"',
        gridTemplateColumns: '1fr 1fr',
        '@media (min-width: 64em)': {
          gridTemplateAreas: '"art crit score"',
          gridTemplateColumns: '300px minmax(420px, 1.6fr) minmax(220px, 0.9fr)',
        },
      }}
    >
        {/* Section 1: artwork (flush) + band/album/date/genre text block. Band/album typography
            matches the review card's exactly (App.tsx ~line 741) rather than inventing new
            styles — 19px/700/uppercase band, 18px/500 album, tightly stacked with no gap
            between them (same as the review card), functioning as row 1 of this section's 3
            stacked rows. Inlined rather than reusing AlbumMeta.tsx: AlbumMeta's own internal
            margins (mb=1/mb=2) would stack with this section's 12px row gap and produce
            inconsistent spacing — not required to extract this pass, so duplicated instead of
            risking a shared-component change that could also affect the review card's spacing. */}
        <VStack
          gridArea="art"
          align="stretch"
          gap={0}
          bg="surface.card"
          // Tier 2 only (768-1023px): Section 1 and Section 3 share Row 1, so a right border
          // here separates them the same way Section 2's left/right borders separate it from
          // its neighbors at Tier 1 — Section 3 needs no matching left border of its own, this
          // single edge already reads as the divider between both cells. Unset (not present at
          // all, not just transparent) at Tier 1, where Section 1 instead sits directly against
          // Section 2's own left border.
          css={{
            '@media (max-width: 63.9375em)': { borderRight: '1px solid', borderColor: 'sand.600' },
          }}
        >
          {/* size="auto" fills this section's own grid-track width at a 1:1 ratio — at Tier 1
              (>=1024px) that track is a fixed 300px, so this renders identically to the
              previous hardcoded 300px square; at Tier 2 (768-1023px) the track is fluid
              (shared 1fr column with Section 3), so the artwork shrinks with it. Verified live
              at 768/900/1023px that a hardcoded 300px would either overflow the shared column
              or starve Section 3. */}
          <AlbumArtwork artworkUrl={artworkUrl} band={band} album={album} size="auto" />
          <VStack align="stretch" gap="12px" px="16px" py="20px">
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
          gridArea="crit"
          minW={0}
          bg="surface.criterionRow"
          // Tier-dependent borders: at Tier 1 (>=1024px) this section sits flanked between
          // Section 1 and Section 3 in one row, so left/right borders (unchanged from the
          // original single-tier layout) divide it from both neighbors. At Tier 2 (768-1023px)
          // it's a standalone full-width row below Row 1 instead — left/right borders would be
          // meaningless there (nothing beside it), so they're dropped in favor of a top border
          // separating it from Row 1. Both edges toggle together per tier via the same 64em
          // breakpoint already used for the grid itself, not two independent conditions.
          css={{
            borderTop: '1px solid',
            borderColor: 'sand.600',
            '@media (min-width: 64em)': {
              borderTop: 'none',
              borderLeft: '1px solid',
              borderRight: '1px solid',
              borderColor: 'surface.ratingCard',
            },
          }}
        >
          <VStack flex="1 1 0" minW={0} align="stretch" gap={0}>
            {order.map((id, index) => {
              const entry = catalog?.entries[id];
              const level = ratings.get(id);
              const isSelected = selectedCriterionId === id;
              const isRated = level !== undefined;
              const isFirst = index === 0;
              const isLast = index === order.length - 1;
              const statusLabel = isRated && entry ? `${level}–${entry.levels[level]?.label}` : 'NOT EVALUATED';
              return (
                <Flex
                  key={id}
                  as="button"
                  onClick={() => onSelectCriterion(id)}
                  direction="column"
                  align="flex-start"
                  gap={2}
                  px={4}
                  py={4}
                  cursor={isSelected ? undefined : 'pointer'}
                  // Last row grows to fill any leftover column height (e.g. on shorter/narrower
                  // viewports where the 6 rows' natural height is less than the level picker's
                  // content height) — otherwise its own border-right stops at its natural
                  // bottom instead of continuing down to the section's true bottom edge.
                  flex={isLast ? '1' : undefined}
                  bg={isSelected ? 'surface.criterionActive' : undefined}
                  _hover={{ bg: isSelected ? 'surface.criterionActive' : 'surface.criterionHover' }}
                  // Active row: top/bottom rule framing it, no right border — the level picker
                  // panel sits directly beside it with the same surface.criterionActive fill,
                  // so leaving this edge open reads as one continuous highlighted block. Every
                  // other row: a right border instead, doubling as the divider against the
                  // picker panel (which carries no border of its own — see below) — this
                  // achieves the same vertical rule as a border on the panel itself, but lets it
                  // fall away exactly at the active row's height for free, since each row's own
                  // right edge lines up with the panel's left edge. Top border suppressed when
                  // the active row is the very first one — it always sits flush against the
                  // section's real top edge (no top border of its own), so drawing one here
                  // would double up against the outer card border right above it. Same
                  // suppression for the bottom border when the active row is last.
                  //
                  // All 3 borders are always rendered at 1px — only their color toggles between
                  // sand.600 and transparent, never their presence. Toggling `undefined` vs
                  // '1px solid' changed each row's box height by the border's own width (rows
                  // have no fixed height), causing neighboring rows to visibly reflow/flicker on
                  // every selection change — this keeps every row's box size constant.
                  borderTop="1px solid"
                  borderBottom="1px solid"
                  borderRight="1px solid"
                  borderTopColor={isSelected && !isFirst ? 'sand.600' : 'transparent'}
                  borderBottomColor={isSelected && !isLast ? 'sand.600' : 'transparent'}
                  borderRightColor={isSelected ? 'transparent' : 'sand.600'}
                >
                  <Text
                    fontWeight="semibold"
                    color={isSelected ? 'ember.500' : 'text.primary'}
                    fontSize="sm"
                    textTransform="uppercase"
                    textAlign="left"
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
                    textAlign="left"
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
              // `key` on the criterion id remounts this on every row click, so `initial` fires
              // fresh each time instead of only on first mount — that's what makes each switch
              // "settle in" instead of only animating the very first criterion shown.
              <motion.div
                key={selectedEntry.index}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <CriterionLevelPicker
                  entry={selectedEntry}
                  selectedLevel={ratings.get(selectedEntry.index)}
                  onPick={(level) => onPick(selectedEntry.index, level)}
                  disabled={savingCriterionId !== null}
                  showTitle={false}
                />
              </motion.div>
            )}
          </Box>
        </Flex>

        {/* Section 3: rank/score slabs + radar chart. bg="surface.card" — same third-pass fill
            as the other two sections. */}
        <VStack gridArea="score" align="stretch" gap={4} bg="surface.card" minW={0}>
          <Flex gap={0}>
            {isPending ? (
              <>
                <RatingSlab label="Rated" value={String(ratings.size)} variant="pending" />
                <RatingSlab label="Total" value={String(order.length)} variant="pending" />
              </>
            ) : (
              <>
                <RatingSlab label="Rank" value={rankValue} variant="high" />
                <RatingSlab label="Score" value={scoreValue} variant="base" />
              </>
            )}
          </Flex>
          <RatingRadarChart catalog={catalog} ratings={ratings} order={order} weights={weights} size="full" />
        </VStack>
    </Box>
  );
}
