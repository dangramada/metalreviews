import { useRef } from 'react';
import { Button } from '@chakra-ui/react';
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../ui/dialog';
import { primaryButton, secondaryButton } from '../../theme';

interface PauseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmPause: () => void;
}

// Universal copy, not tier-variant (brief §7) — unlike a checkpoint, which represents a
// specific degree-boundary event, pausing isn't tied to any event, so the same copy applies
// regardless of where the user is. Replaces the old inline `stopped` state (a plain "Calibration
// paused" text swap with no modal) entirely — this is the real pause UI now.
//
// initialFocusEl on "Keep going", not the exit action, matching the existing Favorites
// remove-confirm dialog's convention (the safe/default action gets focus, not the one that
// leaves).
export function PauseDialog({ open, onOpenChange, onConfirmPause }: PauseDialogProps) {
  const keepGoingRef = useRef<HTMLButtonElement>(null);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      initialFocusEl={() => keepGoingRef.current}
    >
      <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
        <DialogHeader>
          <DialogTitle fontWeight="semibold">Take a break?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          Your answers are saved as you go, so nothing is lost. You can pick up again anytime, from
          exactly where you stopped. There&apos;s no need to finish in one sitting.
        </DialogBody>
        <DialogFooter gap={3}>
          <Button
            {...secondaryButton}
            variant="outline"
            onClick={() => {
              onConfirmPause();
              onOpenChange(false);
            }}
          >
            Pause and view results
          </Button>
          <Button {...primaryButton} ref={keepGoingRef} onClick={() => onOpenChange(false)}>
            Keep going
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
