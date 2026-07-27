import { Button } from '@chakra-ui/react';

interface EqualButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

// A real bordered/labeled button, not a plain text link — but visibly lower
// weight than the two SelectAction buttons (gray outline vs. full-width ember
// solid), so it reads as a subdued fallback rather than a third equal-weight
// option alongside the two cards.
export function EqualButton({ onClick, disabled }: EqualButtonProps) {
  return (
    <Button
      variant="outline"
      colorPalette="gray"
      size="sm"
      fontWeight="normal"
      onClick={onClick}
      disabled={disabled}
    >
      About equal
    </Button>
  );
}
