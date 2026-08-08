// Mobile (< md) layout for the Album Rating Page: two sequential screens (Overview/Detail),
// not the desktop columns compressed. Stage 1 of the mobile-album-evaluation-redesign brief
// brought this in line with DesktopRatingLayout's bordered-card visual language: one 2px-bordered
// card (surface.ratingCardFill / border.ruleStrong, same tokens as desktop) wrapping an
// album-info zone, the progress/rank+score box (RatingProgressBox, shared with desktop), and a
// criteria list with desktop's exact text-badge format — replacing the old fixed header
// (56px artwork + ambient radar chart + "← Favorites" link) and checkmark/circle row icons.
// See docs/decisions/album-rating-page.md for the dated stage-1 entry.
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Icon, Text, VStack, useToken } from '@chakra-ui/react';
import { LuArrowLeft, LuChevronRight } from 'react-icons/lu';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '../ui/dialog';
import { CloseButton } from '../ui/close-button';
import { AlbumArtwork } from './AlbumArtwork';
import { AlbumMetaBlock } from './AlbumMetaBlock';
import { CriterionLevelPicker } from './CriterionLevelPicker';
import { MobileScreenTransition } from './MobileScreenTransition';
import { RatingProgressBox } from './RatingProgressBox';
import { RatingRadarChart } from './RatingRadarChart';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';
import type { CriterionLevelWeight } from './RatingRadarChart';
import { secondaryButton } from '../../theme';

// Stage 4a re-sequencing: a pick used to fire a single flat AUTO_RETURN_MS delay before
// snapping back with no intermediate feedback ("very poor" per the brief). Now: save -> the
// selected RadioCard's scale feedback plays (FEEDBACK_MS) -> a slide transition back to Screen 1
// plays (SLIDE_MS, see MobileScreenTransition) -> only once that settles does the row highlight
// (and, on the 6th/final pick, the RatingProgressBox crossfade) begin. Revision 2 (see the dated
// stage-4a entries in docs/decisions/album-rating-page.md): these two values are still under
// live evaluation post-restructure — the original revision's "snappier, not sluggish" read was
// against the disjointed two-treatment slide, not the unified one, so it needs re-confirming.
const FEEDBACK_MS = 450;
const SLIDE_MS = 280;
// How long the just-arrived-at row stays highlighted before settling to its normal completed
// appearance — unchanged from stage 1's "use your judgment" value, only its trigger moved (now
// gated on the slide transition settling, not a flat post-pick delay).
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
  weights,
  ratingSummary,
  onPick,
  savingCriterionId,
}: MobileRatingLayoutProps) {
  // Resolved once via Chakra's `useToken` rather than embedded inline as a `{colors.accent.
  // border}`-style string inside the `boxShadow` value below — that brace-interpolation syntax
  // is a Panda CSS *build-time* token-extraction feature, not something the runtime style-prop
  // resolver reliably expands for an arbitrary compound string value; live-tested and confirmed
  // via computed style that it produced an inconsistent/absent box-shadow rather than the
  // intended accent color. `useToken` is Chakra's own documented runtime API for resolving a
  // token to its real CSS value, so it works regardless of that build-time-vs-runtime split.
  const [accentBorderColor] = useToken('colors', 'accent.border');
  const [screen, setScreen] = useState<'overview' | 'detail'>('overview');
  // Defaults to the first criterion (not null) so the detail panel always has real content to
  // render — MobileScreenTransition keeps both panels mounted side by side at all times (see
  // that component), including during the slide-back transition where the detail panel is still
  // partway into view; a null/blank panel would flash empty mid-slide instead of showing the
  // just-rated criterion underneath. Purely which criterion's levels the (currently offscreen or
  // mid-transition) detail panel shows — not a saved rating.
  const [detailCriterionId, setDetailCriterionId] = useState<number>(order[0]);
  const [highlightedCriterionId, setHighlightedCriterionId] = useState<number | null>(null);
  const [radarOpen, setRadarOpen] = useState(false);
  // Selection-feedback state: the level just picked, mid-animation (scale-up on the selected
  // card, dim on the rest — see CriterionLevelPicker) before the slide-back to Screen 1 starts.
  // `null` once idle/settled.
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);
  // Delayed snapshot RatingProgressBox actually renders from — see the dated stage-4a entry in
  // docs/decisions/album-rating-page.md for why this exists: `ratings`/`ratingSummary` (props,
  // below) update the instant the save resolves, but the box itself must not visibly react
  // until the slide-back transition has fully settled, so its own crossfade (untouched,
  // RatingProgressBox.tsx) plays at arrival rather than mid-slide or while still on Screen 2.
  // Desktop's RatingProgressBox usage (DesktopRatingLayout.tsx) is unaffected — it reads the
  // live props directly, no snapshot involved.
  const [progressSnapshot, setProgressSnapshot] = useState(() => ({
    ratedCount: ratings.size,
    ratingSummary,
  }));
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kept in sync every render so the settle callback (fired from inside a setTimeout closure
  // created back when the pick started) can read the *current* ratings/summary rather than the
  // stale values captured at that render — `ratings`/`ratingSummary` themselves update via the
  // parent (AlbumRatingPage.tsx) well before the settle callback fires.
  const latestRatedCountRef = useRef(ratings.size);
  const latestRatingSummaryRef = useRef(ratingSummary);

  useEffect(() => {
    latestRatedCountRef.current = ratings.size;
  }, [ratings]);
  useEffect(() => {
    latestRatingSummaryRef.current = ratingSummary;
  }, [ratingSummary]);

  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      if (slideTimeout.current) clearTimeout(slideTimeout.current);
      if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
    };
  }, []);

  function openDetail(criterionId: number) {
    setDetailCriterionId(criterionId);
    setScreen('detail');
  }

  function returnToOverview() {
    setScreen('overview');
  }

  async function handlePick(criterionId: number, level: number) {
    await onPick(criterionId, level);
    setPendingLevel(level);
    feedbackTimeout.current = setTimeout(() => {
      setPendingLevel(null);
      returnToOverview();
      slideTimeout.current = setTimeout(() => {
        // Slide fully settled — arrival reveals: sync the progress box's snapshot (triggers its
        // crossfade only now, on the 6th/final pick) and start the row highlight, together.
        setProgressSnapshot({
          ratedCount: latestRatedCountRef.current,
          ratingSummary: latestRatingSummaryRef.current,
        });
        setHighlightedCriterionId(criterionId);
        fadeTimeout.current = setTimeout(() => setHighlightedCriterionId(null), HIGHLIGHT_FADE_MS);
      }, SLIDE_MS);
    }, FEEDBACK_MS);
  }

  const detailEntry = catalog?.entries[detailCriterionId];

  // Zone 1 — artwork-left/meta-right, reimplemented locally from FavoriteListItemRow's desktop
  // tree (FavoritesPage.tsx, the >=768px `Flex` there) rather than shared/extracted this pass —
  // 110px here vs. that row's 128px, hideGenres since this page shows genre nowhere else either.
  const albumInfo = (
    <Flex align="center" gap={4} p={0}>
      <Box flexShrink={0}>
        <AlbumArtwork artworkUrl={artworkUrl} band={band} album={album} size="110px" />
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
          bandFontSize="16px"
          albumFontSize="16px"
          truncateBand
          clampAlbumLines={2}
          titleToDateGap={1}
          hideReleaseDateLabel
        />
      </Box>
    </Flex>
  );

  // A dedicated, explicitly full-width divider — stage 4a revision 2's border-bug fix. The
  // previous structure hung dividers off `borderTop`/`borderBottom` on `Flex`/`VStack` elements
  // (some `as="button"`) without an explicit `w="100%"`; those aren't guaranteed block-level-full
  // width in every engine (a `Flex` rendered `as="button"` in particular can inherit a native
  // `<button>`'s intrinsic sizing behavior on some mobile browsers even with `display:flex`
  // applied). Per Dan's live testing, exactly one of the two dividers that used to exist here
  // (the overview one, on a plain `Box` with explicit `w="100%"`) rendered correctly, while the
  // other (the detail back-row `Flex`, no explicit width) visibly stopped short of the card's
  // right edge — a plain `Box` with an explicit width sidesteps the whole bug class rather than
  // special-casing the one spot that broke.
  //
  // Revision 3: `albumInfo` is identical on both screens and was never part of the disjointed-
  // slide bug (that was specifically RatingProgressBox popping independently) — so per Dan's
  // review it no longer belongs inside MobileScreenTransition's per-panel content at all. It (and
  // this one divider) now render once, above the sliding track, both statically visible on both
  // screens without needing to move — this also collapses the divider back down to a single
  // instance instead of two copies that had to be kept in sync.
  const divider = <Box w="100%" borderTop="1px solid" borderColor="border.ruleStrong" />;

  // Screen 1: progress/rank+score box + criteria list — everything MobileScreenTransition needs
  // to slide as a single unit for this screen. No more hoisting RatingProgressBox out to a
  // separately CSS-toggled position (that was the previous revision's "disjointed slide" bug:
  // the box popped independently of the list instead of moving with it).
  const overviewPanel = (
    <VStack align="stretch" gap={0}>
      {/* px/py 0 (Stage 1 retouch) — this wrapper's own padding, not anything owned by
          RatingProgressBox or shared with DesktopRatingLayout (that layout wraps the same
          component in a bare VStack with no px/py of its own either) — see the dated
          stage-1-retouch entry in docs/decisions/album-rating-page.md.

          Stage 2: an interactive wrapper *around* RatingProgressBox opens the radar-chart
          modal — RatingProgressBox itself gets no onClick/prop change so desktop's usage
          (DesktopRatingLayout.tsx) stays byte-for-byte unaffected. */}
      <Box
        as="button"
        type="button"
        onClick={() => setRadarOpen(true)}
        aria-label="View radar chart"
        w="100%"
        textAlign="left"
        cursor="pointer"
        px={0}
        py={0}
      >
        {/* Reads from the delayed snapshot, not the live `ratings`/`ratingSummary` props — kept
            from the previous revision (still needed even though this panel is now permanently
            mounted): the save resolves, and `ratedCount` updates, well before the feedback +
            slide sequence finishes, while this panel may still be off-screen mid-transition.
            Without the delay, the 6th/final pick's crossfade would play (and finish) while
            invisible, so arrival would show the already-settled final state — the same "pop
            instead of crossfade" bug this mechanism exists to prevent, just via live props
            leaking through a permanently-mounted panel instead of via remounting. */}
        <RatingProgressBox
          ratedCount={progressSnapshot.ratedCount}
          totalCount={order.length}
          ratingSummary={progressSnapshot.ratingSummary}
        />
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
          const statusLabel =
            isRated && entry ? `${level}–${entry.levels[level]?.label}` : 'NOT EVALUATED';
          return (
            <Flex
              key={id}
              as="button"
              onClick={() => openDetail(id)}
              align="center"
              gap={3}
              px={4}
              py={4}
              borderBottom={isLast ? 'none' : '1px solid'}
              borderColor="sand.600"
              // Revision 2 made this border-only, not a background fill — `accent.border`
              // (ember.500) is the same token/color the selection-feedback ring in
              // CriterionLevelPicker uses, so arrival and mid-pick feedback read as the same
              // "just touched this" treatment. No more `accent.ink` text-color swap either — that
              // existed only for contrast against the (now-removed) fill.
              //
              // Revision 3: that first attempt toggled `border` presence (`undefined` -> "2px
              // solid"), which shifts layout regardless of box-sizing — this element has no fixed
              // height, so adding a border still grows its total rendered height (border-box only
              // keeps padding+border+content within an *explicit* size; with an auto height there
              // is nothing to keep them within). It also likely explains the wrong-color report:
              // the `border` shorthand and the separate `borderColor` prop both write border-color
              // declarations, and their precedence in the generated CSS isn't guaranteed, so the
              // shorthand's implicit color could've been winning over the intended one.
              //
              // Fixed with an inset `boxShadow` instead of a real border: its shape (2px solid
              // ring) is now identical in both states — only the color itself
              // ('accent.border' <-> 'transparent') ever changes, and box-shadow never
              // participates in layout at all, so there is no "should be fine because box-sizing
              // is border-box" caveat to rely on. One property, one value being swapped — no
              // second declaration to race against.
              boxShadow={`inset 0 0 0 2px ${highlighted ? accentBorderColor : 'transparent'}`}
              _hover={{ bg: highlighted ? undefined : 'surface.criterionHover' }}
            >
              <Text
                flex={1}
                textAlign="left"
                fontWeight="semibold"
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
                bg={isRated ? 'accent.border' : 'sand.700'}
                color={isRated ? 'accent.ink' : 'text.primary'}
              >
                {statusLabel}
              </Text>
              <Icon as={LuChevronRight} color="text.dim" />
            </Flex>
          );
        })}
      </VStack>
    </VStack>
  );

  // Screen 2: back-arrow+criterion-name row + picker. `detailEntry` always resolves once
  // `catalog` has loaded (see `detailCriterionId`'s initializer above) — this panel is
  // permanently mounted by MobileScreenTransition, including while off-screen, so it never needs
  // a null/undefined guard.
  const detailPanel = detailEntry && (
    <VStack align="stretch" gap={0}>
      <Flex
        as="button"
        onClick={returnToOverview}
        align="center"
        gap={2}
        px={4}
        py={4}
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
          disabled={savingCriterionId !== null || pendingLevel !== null}
          showTitle={false}
          pendingLevel={pendingLevel}
          feedbackDurationMs={FEEDBACK_MS}
        />
      </Box>
    </VStack>
  );

  return (
    <>
      <Box
        bg="surface.ratingCardFill"
        border="2px solid"
        borderColor="border.ruleStrong"
        borderRadius="none"
      >
        {/* Static — outside MobileScreenTransition entirely, so it never moves during a screen
            transition (revision 3; see the divider comment above for why it was pulled out). */}
        {albumInfo}
        {divider}
        <MobileScreenTransition
          screen={screen}
          overview={overviewPanel}
          detail={detailPanel}
          durationMs={SLIDE_MS}
        />
      </Box>

      {/* Radar-chart modal, added stage 2. Same DialogRoot structure/tokens as the page-level
          dialog pattern (AlbumRatingPage.tsx) for a consistent close pattern (X button,
          tap-outside, Esc). Full-mode chart (size defaults to 'full') fed the same
          weights/ratings/catalog/order MobileRatingLayout already receives — no new fetching.
          Recharts' Tooltip is mouse-hover only (confirmed via RatingRadarChart.tsx: no touch
          handlers wired) — tap-to-show-tooltip is a known limitation on mobile, not built here
          per the stage-2 brief; see docs/decisions/album-rating-page.md's stage-2 entry. */}
      <DialogRoot open={radarOpen} onOpenChange={({ open }) => setRadarOpen(open)}>
        <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
          <CloseButton
            position="absolute"
            right={2}
            top={2}
            color="text.primary"
            onClick={() => setRadarOpen(false)}
          />
          <DialogHeader>
            <DialogTitle fontWeight="semibold">
              {band} – {album}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <RatingRadarChart
              catalog={catalog}
              ratings={ratings}
              order={order}
              weights={weights}
              size="full"
            />
          </DialogBody>
          <DialogFooter>
            <Button {...secondaryButton} variant="outline" onClick={() => setRadarOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
