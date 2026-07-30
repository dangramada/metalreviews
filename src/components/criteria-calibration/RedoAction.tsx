import { Button } from '@chakra-ui/react';

interface RedoActionProps {
  onRedo: () => void;
  disabled?: boolean;
}

export function RedoAction({ onRedo, disabled }: RedoActionProps) {
  return (
    <Button variant="ghost" colorPalette="gray" size="sm" onClick={onRedo} disabled={disabled}>
      Redo
    </Button>
  );
}
