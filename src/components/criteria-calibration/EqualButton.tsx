import { Button } from '@chakra-ui/react';

interface EqualButtonProps {
  onClick: () => void;
}

// Deliberately plain/ghost with no border box or fill, unlike the two RadioCards —
// it must read as a low-weight fallback ("can't decide"), never as a third
// equal-weight option sitting alongside Card A / Card B (spec DoD).
export function EqualButton({ onClick }: EqualButtonProps) {
  return (
    <Button variant="plain" size="sm" color="text.muted" fontWeight="normal" onClick={onClick}>
      About equal
    </Button>
  );
}
