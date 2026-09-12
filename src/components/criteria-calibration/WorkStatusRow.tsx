import { Button, Flex } from '@chakra-ui/react';
import { ProgressBar, ProgressRoot, ProgressValueText } from '../ui/progress';
import { RoundCounter } from './RoundCounter';

interface WorkStatusRowProps {
  round: number;
  progressPercent: number;
  onPause: () => void;
}

// Replaces the old ProgressHeader/RoundGaugeGroup's circular progress ring with the brief's
// linear bar. Round counter and progress bar are deliberately decoupled numbers shown in the
// same row (round = ordinal count, progress = cumulative per-degree completion, from
// degreeTiers.ts's computeProgressPercent — untouched, only how it renders changed) — no
// shared label implying a relationship between them.
//
// The separator rule under this row was removed 2026-09-12 (design review): the row is already
// set apart by the 32px above the question title, and the panel's own border is the only rule
// this area needs. Round counter and percentage both use the shared `cardTitle` text style.
//
// Only ever rendered while a real question is showing (CriteriaCalibrationPage scopes this to
// the `action?.type === 'ask'` branch) — never during a checkpoint, since commitAdvance()
// already updates progressPercent to the new degree's baseline before a checkpoint renders,
// and showing that jumped number here would have no visible cause.
export function WorkStatusRow({ round, progressPercent, onPause }: WorkStatusRowProps) {
  return (
    // Two nested gaps, matching how the design groups this row (2026-09-12): the counter, bar
    // and percentage are one unit spaced at 16px, and that whole unit sits 24px from Pause.
    // Expressed as an inner group rather than one flat gap with a nudge on the button, so each
    // number says what it is and neither has to be the sum of the other and something else.
    <Flex align="center" gap={6}>
      <Flex align="center" gap={4} flex="1">
        <RoundCounter round={round} />
        <ProgressRoot value={progressPercent} flex="1" size="lg">
          <Flex align="center" gap={4}>
            <ProgressBar flex="1" />
            {/* No reserved min-width. It used to be 4ch/right-aligned so the bar's length
              couldn't jitter as the number gained a digit — but that costs a permanent gap
              between bar and percentage (at "1%", two characters sitting in a four-character
              box), to avoid a reflow that happens exactly twice in a session, at 9->10 and
              99->100. The gap is visible every round; the shift is not. */}
            <ProgressValueText color="text.primary" textStyle="statusReadout">
              {progressPercent}%
            </ProgressValueText>
          </Flex>
        </ProgressRoot>
      </Flex>
      <Button variant="outline" colorPalette="gray" size="sm" onClick={onPause}>
        Pause
      </Button>
    </Flex>
  );
}
