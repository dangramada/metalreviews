import { useState } from 'react';
import { Box, Button, Text, VStack } from '@chakra-ui/react';
import { primaryButton } from '../../theme';
import { TierAccuracyBadge } from './TierAccuracyBadge';
import { YourTasteFingerprint } from './YourTasteFingerprint';
import { YourTasteCriterionDetail } from './YourTasteCriterionDetail';
import type { AccuracyTier } from '../../lib/criteria-calibration/accuracyTierLabels';
import type { LevelValue } from '../../lib/criteria-calibration/solver';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import {
  buildCriterionBreakdowns,
  buildNarrativeLeaders,
} from '../../lib/criteria-calibration/resultsBreakdown';
import { buildNarrativeSentence } from '../../lib/criteria-calibration/resultsNarrative';

interface ResultsTabProps {
  /** The real content gate (brief §Gating): full content shows once degree 2 is exhausted —
   *  the same fact the tab-row TierAccuracyBadge is already built from, not a separate check.
   *  'none' is the only locked state; medium/high/veryHigh all unlock. */
  tier: AccuracyTier;
  accuracyPercent: number;
  solvedValues: LevelValue[][] | null;
  catalog: CriteriaCatalog | null;
  onBackToCalibration: () => void;
}

// Single unified empty state below the gate (brief §Empty state) — replaces the old
// hasWeights-true/false two-variant copy this tab used before real content existed to gate.
function EmptyState({ onBackToCalibration }: { onBackToCalibration: () => void }) {
  return (
    <VStack gap={4} textAlign="center" py={10}>
      <Text fontSize="lg" fontWeight="medium" fontFamily="body" color="text.primary">
        Nothing's taken shape yet.
      </Text>
      <Text color="text.dim" fontFamily="body">
        Keep comparing and it'll start to show up here.
      </Text>
      <Button {...primaryButton} onClick={onBackToCalibration}>
        Back to Calibration
      </Button>
    </VStack>
  );
}

export function ResultsTab({
  tier,
  accuracyPercent,
  solvedValues,
  catalog,
  onBackToCalibration,
}: ResultsTabProps) {
  const [openValues, setOpenValues] = useState<string[]>([]);

  if (tier === 'none') {
    return <EmptyState onBackToCalibration={onBackToCalibration} />;
  }

  const breakdowns = buildCriterionBreakdowns(solvedValues, catalog);
  if (!breakdowns) {
    return <EmptyState onBackToCalibration={onBackToCalibration} />;
  }

  const leaders = buildNarrativeLeaders(breakdowns);
  const sentence = buildNarrativeSentence(leaders);

  return (
    // gap={8} = var(--chakra-spacing-8) = 32px — the tab's vertical rhythm between its three
    // top-level sections (narrative+badge, fingerprint, per-criterion detail), per design
    // review.
    <VStack gap={8} align="stretch">
      <Box>
        <Text fontSize="md" fontFamily="body" color="text.primary">
          {sentence}
        </Text>
        {/* Physically separated from the sentence above — its own block, own divider — never
            merged into the same sentence or container. Direct application of "accuracy is not
            correctness": the conclusion and the confidence in it must never share one visual
            element, or high confidence reads as "this is the right answer." pt/mt={5} = 20px
            (var(--chakra-spacing-5)) on both sides of the rule, 2px border, per design review. */}
        <Box borderTopWidth="2px" borderColor="border.ruleStrong" pt={5} mt={5}>
          <TierAccuracyBadge tier={tier} percent={accuracyPercent} />
          <Text fontSize="sm" color="text.dim" fontFamily="body" mt={2}>
            Based on your comparisons so far and what matters most to you.
          </Text>
        </Box>
      </Box>

      <Box>
        <Text fontSize="md" fontWeight="medium" fontFamily="body" color="text.primary" mb={3}>
          Fingerprint
        </Text>
        <YourTasteFingerprint criteria={breakdowns} />
      </Box>

      <Box>
        <Text fontSize="md" fontWeight="medium" fontFamily="body" color="text.primary" mb={1}>
          Per-criterion detail
        </Text>
        <YourTasteCriterionDetail
          criteria={breakdowns}
          openValues={openValues}
          onOpenValuesChange={setOpenValues}
        />
      </Box>
    </VStack>
  );
}
