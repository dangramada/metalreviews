import { useState } from 'react';
import { Container, VStack, Flex, RadioCard } from '@chakra-ui/react';
import { ProgressHeader } from './components/criteria-calibration/ProgressHeader';
import { TradeoffCard } from './components/criteria-calibration/TradeoffCard';
import { VsDivider } from './components/criteria-calibration/VsDivider';
import { EqualButton } from './components/criteria-calibration/EqualButton';
import type { AccuracyLevel } from './components/criteria-calibration/AccuracyStatus';
import type { CriterionData } from './components/criteria-calibration/CriterionRow';

// ---------------------------------------------------------------------------
// Placeholder-only content. Phase 7 UI pass — no preference graph / LP solver
// wiring here (separate brief). Everything below marked "mock"/"placeholder"
// stands in for data that will eventually come from the scoring engine.
// ---------------------------------------------------------------------------

const MOCK_CARD_POOL: { title: string; criteria: CriterionData[] }[] = [
  {
    title: 'Card A',
    criteria: [
      {
        label: 'Songwriting',
        levelName: 'Strong',
        description: 'Memorable hooks throughout, cohesive structure.',
      },
      {
        label: 'Production',
        levelName: 'Polished',
        description: 'Clean mix, no glaring balance issues.',
      },
      {
        label: 'Originality',
        levelName: 'Moderate',
        description: 'Familiar palette, a few distinct choices.',
      },
    ],
  },
  {
    title: 'Card B',
    criteria: [
      {
        label: 'Songwriting',
        levelName: 'Inconsistent',
        description: 'A couple of standout tracks, uneven filler.',
      },
      {
        label: 'Production',
        levelName: 'Raw',
        description: 'Deliberately unpolished, some clipping.',
      },
      {
        label: 'Originality',
        levelName: 'High',
        description: 'Unusual instrumentation and song structures.',
      },
    ],
  },
];

// Cumulative accuracy thresholds — purely illustrative placeholder mapping,
// not derived from any real confidence computation.
function accuracyForRound(round: number): { level: AccuracyLevel; percent: number } {
  if (round <= 2) return { level: 'Low', percent: 20 };
  if (round <= 5) return { level: 'Medium', percent: 55 };
  return { level: 'High', percent: 85 };
}

interface RoundState {
  round: number;
}

export function CriteriaCalibrationPage() {
  const [round, setRound] = useState(1);
  const [history, setHistory] = useState<RoundState[]>([]);
  const [choice, setChoice] = useState<string | null>(null);

  const { level, percent } = accuracyForRound(round);

  function advanceRound() {
    setHistory((prev) => [...prev, { round }]);
    setRound((prev) => prev + 1);
    setChoice(null);
  }

  function handleUndo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRound(last.round);
      setChoice(null);
      return prev.slice(0, -1);
    });
  }

  function handleExit() {
    // Mocked: no scoring engine to save to yet. Copy intentionally avoids any
    // reference to a ranking, ordering, or results view (spec DoD).
    console.log('[mock] saving calibration progress at round', round);
  }

  return (
    <Container maxW="4xl" py={10}>
      <VStack gap={10} align="stretch">
        <ProgressHeader
          round={round}
          accuracyLevel={level}
          accuracyPercentPlaceholder={percent}
          onUndo={handleUndo}
          undoDisabled={history.length === 0}
          onExit={handleExit}
        />

        <RadioCard.Root
          value={choice}
          onValueChange={(details) => {
            setChoice(details.value);
            advanceRound();
          }}
        >
          <Flex align="stretch" gap={4} direction={{ base: 'column', md: 'row' }}>
            <TradeoffCard
              value="A"
              title={MOCK_CARD_POOL[0].title}
              criteria={MOCK_CARD_POOL[0].criteria}
            />
            <VsDivider />
            <TradeoffCard
              value="B"
              title={MOCK_CARD_POOL[1].title}
              criteria={MOCK_CARD_POOL[1].criteria}
            />
          </Flex>
        </RadioCard.Root>

        <Flex justify="center">
          <EqualButton onClick={advanceRound} />
        </Flex>
      </VStack>
    </Container>
  );
}
