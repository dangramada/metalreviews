import { Button } from '@chakra-ui/react';

interface UndoActionProps {
  onUndo: () => void;
  disabled?: boolean;
}

export function UndoAction({ onUndo, disabled }: UndoActionProps) {
  return (
    <Button variant="ghost" colorPalette="gray" size="sm" onClick={onUndo} disabled={disabled}>
      Undo
    </Button>
  );
}
