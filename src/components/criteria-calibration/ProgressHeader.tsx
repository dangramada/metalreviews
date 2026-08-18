import { Flex, Button } from '@chakra-ui/react';
import { RoundGaugeGroup } from './RoundGaugeGroup';
import type { AccuracyTier } from './AccuracyStatus';

interface ProgressHeaderProps {
  round: number;
  progressPercent: number;
  accuracyPercent: number;
  accuracyTier: AccuracyTier;
  onExit: () => void;
}

// Top zone of the screen. Deliberately a plain sibling of the fading
// ComparisonRow, not wrapped by it — it must stay visually static during the
// card-transition fade; only its own numeric/text values update, instantly,
// via prop changes (see CriteriaCalibrationPage's commitAdvance). Undo/Redo
// live in HistoryActions further down the page, not here — exit copy must
// never reference ranking (DoD).
export function ProgressHeader({
  round,
  progressPercent,
  accuracyPercent,
  accuracyTier,
  onExit,
}: ProgressHeaderProps) {
  return (
    <Flex
      align="center"
      justify="space-between"
      borderBottom="2px solid"
      borderBottomColor="border.rule"
      pb={6}
    >
      <Flex flex="1" />
      <RoundGaugeGroup
        round={round}
        progressPercent={progressPercent}
        accuracyPercent={accuracyPercent}
        accuracyTier={accuracyTier}
      />
      <Flex flex="1" justify="flex-end">
        <Button variant="outline" colorPalette="gray" size="sm" onClick={onExit}>
          Stop here
        </Button>
      </Flex>
    </Flex>
  );
}
