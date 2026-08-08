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
// selected RadioCard's scale feedback plays (FEEDBACK_MS) -> a short pause (PAUSE_MS, revision 4)
// -> a slide transition back to Screen 1 plays (SLIDE_MS, see MobileScreenTransition) -> only
// once that settles does the row highlight (and, on the 6th/final pick, the RatingProgressBox
// crossfade) begin. Revision 2 (see the dated stage-4a entries in
// docs/decisions/album-rating-page.md): these values are still under live evaluation
// post-restructure — the original revision's "snappier, not sluggish" read was against the
// disjointed two-treatment slide, not the unified one, so it needs re-confirming.
const FEEDBACK_MS = 450;
// Revision 4: a beat between the feedback animation settling and the slide starting — without
// it, the slide began the instant the scale/dim animation finished, which read as the two
// blurring into one motion rather than two distinct, readable steps. 150ms — the middle of the
// brief's suggested 100-250ms range, and its own starting point — chosen without a live feel-test
// of the other values: this tool can verify the mechanism fires correctly (confirmed via
// monitoring the slide transform, which only starts moving ~600ms after a pick, matching
// FEEDBACK_MS+PAUSE_MS), but can't perceive subjective "does this feel right" the way a human
// watching it can. Flagged for Dan the same way SLIDE_MS/FEEDBACK_MS already are — a value worth
// confirming or nudging by feel, not one this session can close out on its own.
const PAUSE_MS = 150;
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
  // `revealed` gates WHEN RatingProgressBox is allowed to react to live `ratings`/`ratingSummary`
  // props, not WHAT it shows once allowed — see `progressSnapshot` below for the fixed value it
  // falls back to while hidden. `false` for the whole feedback+slide window (so the box's own
  // crossfade, untouched in RatingProgressBox.tsx, plays at arrival rather than mid-slide or
  // while still on Screen 2), `true` from the moment the slide settles onward. Desktop's
  // RatingProgressBox usage (DesktopRatingLayout.tsx) is unaffected — it reads live props
  // directly, unconditionally, always.
  //
  // Revision 4: this used to be a one-shot sync (`progressSnapshot` captured once, at settle,
  // from a ref tracking the latest props) instead of a boolean gate. That broke on the 6th/final
  // pick specifically: `AlbumRatingPage.tsx`'s `refetchRatingSummary()` after the save is fired
  // without awaiting it, so `ratingSummary` can still be stale at the exact instant the one-shot
  // sync ran, if the refetch simply hadn't resolved yet — a real race, confirmed by Dan hitting it
  // live (Rank/Score never appearing) even though earlier testing this session happened not to
  // hit it. Once one-shot-synced stale, nothing re-triggered a second sync while staying on
  // Overview, so it stayed permanently stuck. A boolean gate has no such single-shot window: once
  // `revealed` is `true`, the box reads live props on every render, so a late-arriving refetch
  // still lands correctly whenever it actually resolves.
  const [revealed, setRevealed] = useState(true);
  // The fixed value shown while `!revealed` — captured directly in `handlePick`, right as
  // `revealed` flips to `false` (not via a `useEffect` mirroring live props: that ran into
  // React's "don't setState synchronously inside an effect" cascading-render warning, and isn't
  // needed anyway — `handlePick`'s own closure already has the exact "last known before this
  // pick" values, which is precisely what should stay on screen for the hidden window).
  const [progressSnapshot, setProgressSnapshot] = useState(() => ({
    ratedCount: ratings.size,
    ratingSummary,
  }));
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      if (pauseTimeout.current) clearTimeout(pauseTimeout.current);
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
    // Freeze on "last known before this pick" — this closure's `ratings`/`ratingSummary` are
    // exactly the values that were live the last time `revealed` was `true`, which is precisely
    // what should stay on screen for the hidden window about to start.
    setProgressSnapshot({ ratedCount: ratings.size, ratingSummary });
    setPendingLevel(level);
    setRevealed(false);
    feedbackTimeout.current = setTimeout(() => {
      setPendingLevel(null);
      pauseTimeout.current = setTimeout(() => {
        returnToOverview();
        slideTimeout.current = setTimeout(() => {
          // Slide fully settled — arrival reveals: let the progress box track live props again
          // (triggers its crossfade only now, on the 6th/final pick — see `revealed` above for why
          // this is a gate rather than a one-shot value copy) and start the row highlight,
          // together.
          setRevealed(true);
          setHighlightedCriterionId(criterionId);
          fadeTimeout.current = setTimeout(
            () => setHighlightedCriterionId(null),
            HIGHLIGHT_FADE_MS
          );
        }, SLIDE_MS);
      }, PAUSE_MS);
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
        {/* While hidden (`!revealed`), shows the fixed `progressSnapshot` rather than live props
            — the save resolves, and `ratedCount` updates, well before the feedback+pause+slide
            sequence finishes, while this panel may still be off-screen mid-transition; without
            gating, the 6th/final pick's crossfade would play (and finish) while invisible, so
            arrival would show the already-settled final state instead of animating into it. Once
            `revealed`, reads live props directly and keeps doing so — see `revealed`'s
            declaration above for why this must be a persistent gate, not a one-shot copy. */}
        <RatingProgressBox
          ratedCount={revealed ? ratings.size : progressSnapshot.ratedCount}
          totalCount={order.length}
          ratingSummary={revealed ? ratingSummary : progressSnapshot.ratingSummary}
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
