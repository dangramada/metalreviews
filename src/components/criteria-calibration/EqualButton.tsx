import { Button } from '@chakra-ui/react';
import { primaryButton } from '../../theme';

interface EqualButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

// Same solid primary (ember) weight as the two SelectAction "This one" buttons. Changed
// 2026-09-11 after design review: it used to be a gray outline, deliberately quieter so it read
// as a subdued fallback. Review settled that "equal" is a third valid answer to the comparison,
// not an escape hatch, so it must not look less choosable than the other two. Not full-width
// like SelectAction — it sits alone and centred under both cards rather than filling one.
export function EqualButton({ onClick, disabled }: EqualButtonProps) {
  return (
    <Button {...primaryButton} onClick={onClick} disabled={disabled}>
      They are equal
    </Button>
  );
}
