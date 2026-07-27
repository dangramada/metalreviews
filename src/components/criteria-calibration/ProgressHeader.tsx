import { Flex, Button } from '@chakra-ui/react';
import { RoundGaugeGroup } from './RoundGaugeGroup';
import { UndoAction } from './UndoAction';
import type { AccuracyLevel } from './AccuracyStatus';

interface ProgressHeaderProps {
  round: number;
  accuracyLevel: AccuracyLevel;
  accuracyPercentPlaceholder: number;
  onUndo: () => void;
  undoDisabled: boolean;
  onExit: () => void;
}

// Top zone of the screen: undo on the left, the round/accuracy gauge centered,
// exit action on the right. Exit copy must never reference ranking (DoD).
export function ProgressHeader({
  round,
  accuracyLevel,
  accuracyPercentPlaceholder,
  onUndo,
  undoDisabled,
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
      <UndoAction onUndo={onUndo} disabled={undoDisabled} />
      <RoundGaugeGroup
        round={round}
        accuracyLevel={accuracyLevel}
        accuracyPercentPlaceholder={accuracyPercentPlaceholder}
      />
      <Button variant="outline" colorPalette="gray" size="sm" onClick={onExit}>
        Stop here
      </Button>
    </Flex>
  );
}
