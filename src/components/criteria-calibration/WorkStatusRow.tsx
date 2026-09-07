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
// Only ever rendered while a real question is showing (CriteriaCalibrationPage scopes this to
// the `action?.type === 'ask'` branch) — never during a checkpoint, since commitAdvance()
// already updates progressPercent to the new degree's baseline before a checkpoint renders,
// and showing that jumped number here would have no visible cause.
export function WorkStatusRow({ round, progressPercent, onPause }: WorkStatusRowProps) {
  return (
    <Flex align="center" gap={4} borderBottom="2px solid" borderBottomColor="border.rule" pb={6}>
      <RoundCounter round={round} />
      <ProgressRoot value={progressPercent} flex="1" size="sm">
        <Flex align="center" gap={2}>
          <ProgressBar flex="1" />
          <ProgressValueText
            color="text.primary"
            fontFamily="mono"
            fontSize="sm"
            minW="3ch"
            textAlign="right"
          >
            {progressPercent}%
          </ProgressValueText>
        </Flex>
      </ProgressRoot>
      <Button variant="outline" colorPalette="gray" size="sm" onClick={onPause}>
        Pause
      </Button>
    </Flex>
  );
}
