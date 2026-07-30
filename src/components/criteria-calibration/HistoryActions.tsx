import { HStack } from '@chakra-ui/react';
import { UndoAction } from './UndoAction';
import { RedoAction } from './RedoAction';

interface HistoryActionsProps {
  onUndo: () => void;
  onRedo: () => void;
  undoDisabled: boolean;
  redoDisabled: boolean;
}

// Undo + Redo, grouped together below EqualButton per the brief's explicit
// top-to-bottom layout order (item 5, after the cards and EqualButton).
export function HistoryActions({
  onUndo,
  onRedo,
  undoDisabled,
  redoDisabled,
}: HistoryActionsProps) {
  return (
    <HStack gap={2} justify="center">
      <UndoAction onUndo={onUndo} disabled={undoDisabled} />
      <RedoAction onRedo={onRedo} disabled={redoDisabled} />
    </HStack>
  );
}
