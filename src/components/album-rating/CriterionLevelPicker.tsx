// Level picker for a single criterion — same RadioCardRoot/RadioCardItem (Chakra native,
// src/components/ui/radio-card.tsx) and label/description shape the old AlbumRatingDrawer
// used per criterion, just scoped to one criterion at a time instead of looping over all six
// in a flat scrollable list. Shared by DesktopRatingLayout's Column 3 and MobileRatingLayout's
// Detail screen so both layouts render levels identically.
import { Fragment } from 'react';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { RadioCardItem, RadioCardItemIndicator, RadioCardRoot } from '../ui/radio-card';
import {
  formatLevelDescription,
  type CriterionCatalogEntry,
} from '../../lib/criteria-calibration/criteriaCatalog';

export function CriterionLevelPicker({
  entry,
  selectedLevel,
  onPick,
  disabled,
  // Desktop's row already shows the criterion name to the left of the picker, so this
  // component's own title is redundant there — but MobileRatingLayout's Detail screen has no
  // such row (it's a full-screen view keyed only on the selected criterion), so it still needs
  // this heading. Defaults to shown, so mobile is unaffected.
  showTitle = true,
  // Mobile-only, stage 4a selection-feedback: the level just picked, mid-way through its
  // scale-up/checkmark/dim animation before auto-return fires. Left undefined by
  // DesktopRatingLayout's call site (it has no auto-return sequence to animate into), which
  // keeps every item unwrapped below — byte-identical to pre-stage-4a desktop rendering.
  pendingLevel,
  feedbackDurationMs,
}: {
  entry: CriterionCatalogEntry;
  selectedLevel: number | undefined;
  onPick: (level: number) => void;
  disabled: boolean;
  showTitle?: boolean;
  pendingLevel?: number | null;
  feedbackDurationMs?: number;
}) {
  // Presence (not truthiness) of the prop is the mobile/desktop switch — `null` is a valid
  // "no feedback active right now" mobile state, distinct from desktop's `undefined`.
  const feedbackActive = pendingLevel !== undefined;
  const feedbackSeconds = (feedbackDurationMs ?? 450) / 1000;
  return (
    <VStack align="stretch" gap={4}>
      {showTitle && (
        <Heading as="h3" size="md">
          {entry.name}
        </Heading>
      )}
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
            .map(([level, info]) => {
              const levelNum = Number(level);
              const isFeedbackTarget = feedbackActive && pendingLevel === levelNum;
              const isDimmed = feedbackActive && pendingLevel !== null && pendingLevel !== levelNum;
              const item = (
                <RadioCardItem
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
                    <Text textAlign="left" textTransform="uppercase">
                      {level} – {info.label}
                    </Text>
                  }
                  description={
                    <Text textAlign="left">{formatLevelDescription(info.description)}</Text>
                  }
                  disabled={disabled}
                  // Hover: border eases to sand.500 (smooth via the transition below); pointer
                  // cursor only while unchecked (`_checked` overrides both back to the checked
                  // look/default cursor — clicking an already-selected level is a no-op).
                  transition="border-color 0.15s ease, box-shadow 0.15s ease"
                  cursor="pointer"
                  _hover={{ borderColor: 'sand.500' }}
                  // `sand.200` checked highlight, overridden explicitly rather than via
                  // `colorPalette` — `sand` isn't registered as a full color palette (only
                  // `ember` is, see theme.ts's semantic-token block), so `colorPalette.solid`
                  // wouldn't resolve correctly for a raw ramp with no semantic sub-keys. Item's
                  // own `_checked` covers the outline/box-shadow ring; the indicator's `_checked`
                  // covers its fill dot — both driven by `colorPalette.solid`/`.contrast` in the
                  // recipe otherwise.
                  //
                  // Stage 4a: on mobile (`feedbackActive`, i.e. whenever MobileRatingLayout passes
                  // `pendingLevel` at all — desktop never does), every checked item uses the same
                  // accent color MobileRatingLayout's arrival row-highlight uses (`accent.border`)
                  // — a border, not a fill, matching the "highlight = border, never background"
                  // rule applied consistently across both feedback moments. Revision 3: this is
                  // unconditional on `feedbackActive`, not scoped to `isFeedbackTarget` — opening
                  // the Detail screen for an *already*-rated criterion should show the same accent
                  // border on that saved level immediately, not only during the transient
                  // just-picked window, so "already selected" and "just now selected" read as the
                  // same state. Desktop (`feedbackActive` always false, since it never passes
                  // `pendingLevel`) keeps the original plain sand.200 ring — zero-diff preserved.
                  _checked={
                    feedbackActive
                      ? {
                          borderColor: 'accent.border',
                          boxShadowColor: 'accent.border',
                          cursor: 'default',
                        }
                      : { borderColor: 'sand.200', boxShadowColor: 'sand.200', cursor: 'default' }
                  }
                  // Chakra's radio-card recipe bakes in `_disabled: { opacity: 0.5 }` on the item
                  // slot. MobileRatingLayout disables every item for the whole feedback window (to
                  // block re-taps mid-animation), so without this override the recipe's own
                  // disabled-opacity would dim the *selected* card too, compounding with (and
                  // defeating) the `isDimmed`-only opacity this component's wrapping motion.div
                  // applies below — confirmed live: the selected card visibly dimmed alongside the
                  // rest despite `isDimmed` correctly excluding it. Overriding per-item here keeps
                  // only the non-target cards actually dimmed.
                  _disabled={{ opacity: isFeedbackTarget ? 1 : 0.5 }}
                  indicator={
                    <RadioCardItemIndicator
                      borderRadius="circle"
                      // Default (unchecked) state — this project never set its own value here
                      // before, so it was falling back to Chakra's built-in `border.emphasized` at
                      // 1px. Explicit sand.600/2px now; `_checked` below still overrides both for
                      // the selected state.
                      borderColor="sand.600"
                      borderWidth="2px"
                      _checked={{ bg: 'sand.200', borderColor: 'sand.200', color: 'ink.900' }}
                    />
                  }
                  contentAlignItems="flex-start"
                />
              );

              // Desktop (feedbackActive === false, since it never passes `pendingLevel`) renders
              // `item` completely unwrapped — same DOM as before stage 4a. Mobile wraps each item
              // in a motion.div so the just-picked one can scale up and the rest dim, driven by
              // MobileRatingLayout's `pendingLevel` state.
              if (!feedbackActive) {
                return <Fragment key={level}>{item}</Fragment>;
              }

              return (
                <motion.div
                  key={level}
                  animate={{ scale: isFeedbackTarget ? 1.03 : 1, opacity: isDimmed ? 0.5 : 1 }}
                  transition={{ duration: feedbackSeconds, ease: 'easeOut' }}
                >
                  {item}
                </motion.div>
              );
            })}
        </VStack>
      </RadioCardRoot>
    </VStack>
  );
}
