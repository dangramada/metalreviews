import { Button } from '@chakra-ui/react';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '../ui/dialog';
import { primaryButton, secondaryButton } from '../../theme';

export type CalibrationGateMode = 'hard' | 'soft';

interface CalibrationGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CalibrationGateMode;
  onEvaluateAnyway: () => void;
  onGoToCalibration: () => void;
}

// Two gates sharing one component (terminology-and-gate-unification), same pattern as
// RatingSlab's variant prop: only title/body/button-set differ between them. Trigger point is
// currently only Favorites' "Evaluate Album" action, but this is meant to be reused for the
// future AOTY page entry point too — see the brief's "New gate logic" section.
//
// Hard gate (`hasWeights === false`): no calibrated model exists at all, so there is nothing to
// evaluate with — blocking, no bypass.
// Soft gate (`hasWeights === true && tier === 'none'`): a model exists but the first level of
// comparison isn't finished — non-blocking, "Go to calibration" is the emphasized action but
// evaluating anyway is still one click away.
export function CalibrationGateDialog({
  open,
  onOpenChange,
  mode,
  onEvaluateAnyway,
  onGoToCalibration,
}: CalibrationGateDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={({ open }) => onOpenChange(open)}>
      <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
        <DialogHeader>
          <DialogTitle fontWeight="semibold">
            {mode === 'hard' ? 'Answer a few comparisons first' : 'Keep going for a steadier score'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {mode === 'hard' ? (
            <>
              Rating albums uses your personal criteria weights, which aren&apos;t set up yet.
              Finish your first level of comparison so your ratings have real weights to score with.
            </>
          ) : (
            <>
              You&apos;ve started, but your first level of comparison isn&apos;t finished yet. A few
              more comparisons usually settle the score closer to what matters most to you.
            </>
          )}
        </DialogBody>
        <DialogFooter gap={3}>
          <Button {...secondaryButton} variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === 'soft' && (
            <Button {...secondaryButton} variant="solid" onClick={onEvaluateAnyway}>
              Evaluate Album
            </Button>
          )}
          <Button {...primaryButton} onClick={onGoToCalibration}>
            Go to calibration
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
