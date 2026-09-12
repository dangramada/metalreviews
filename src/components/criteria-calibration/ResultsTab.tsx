import { Button, Text, VStack } from '@chakra-ui/react';
import { primaryButton } from '../../theme';

interface ResultsTabProps {
  /** Whether the session has committed at least one answer — the same fact
   *  `hasCalibrationWeights`/useCalibrationGate's soft gate checks elsewhere (a weight row is
   *  written on the very first commit), read locally here rather than re-fetched, since this
   *  page already knows it. */
  hasWeights: boolean;
  onBackToCalibration: () => void;
}

// Deliberately minimal (brief §6): full Results IA is out of scope for this brief and needs
// its own dedicated design session. The only piece built now is the below-grade-2 soft-gate
// placeholder — reachable via the always-clickable Results tab (no forward-blocking, per
// brief §2/§6), a Pause dialog exit, or a checkpoint's non-terminal "Pause here".
export function ResultsTab({ hasWeights, onBackToCalibration }: ResultsTabProps) {
  if (!hasWeights) {
    return (
      <VStack gap={4} textAlign="center" py={10}>
        <Text color="text.dim" fontFamily="body">
          Not enough data yet for a ranking — keep comparing to build up your model.
        </Text>
        <Button {...primaryButton} onClick={onBackToCalibration}>
          Back to Calibration
        </Button>
      </VStack>
    );
  }

  return (
    <VStack gap={4} textAlign="center" py={10}>
      <Text color="text.dim" fontFamily="body">
        A full results view is coming soon. Your calibration is saved as you go — come back anytime
        to keep sharpening it.
      </Text>
      <Button {...primaryButton} variant="outline" onClick={onBackToCalibration}>
        Back to Calibration
      </Button>
    </VStack>
  );
}
