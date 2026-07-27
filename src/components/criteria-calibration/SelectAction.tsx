import { Button } from '@chakra-ui/react';
import { primaryButton } from '../../theme';

interface SelectActionProps {
  onClick: () => void;
  disabled?: boolean;
}

// The real click target for an OptionCard — full-width, not a corner
// checkbox/radio indicator. Needs to read as clearly and unambiguously
// actionable, so it uses the app's primary (ember) button style at full width.
// Disabled while a transition is already in flight, to guard against
// double-submits during the hold/fade sequence.
export function SelectAction({ onClick, disabled }: SelectActionProps) {
  return (
    <Button {...primaryButton} w="full" onClick={onClick} disabled={disabled}>
      This one
    </Button>
  );
}
