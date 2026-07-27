import { useEffect, useRef, useState } from 'react';
import { Box, Container, VStack } from '@chakra-ui/react';
import { ProgressHeader } from './components/criteria-calibration/ProgressHeader';
import { QuestionPrompt } from './components/criteria-calibration/QuestionPrompt';
import { ComparisonRow } from './components/criteria-calibration/ComparisonRow';
import { EqualButton } from './components/criteria-calibration/EqualButton';
import { HistoryActions } from './components/criteria-calibration/HistoryActions';
import type { AccuracyLevel } from './components/criteria-calibration/AccuracyStatus';
import type { CriterionData } from './components/criteria-calibration/CriterionRow';
import { useReducedMotion } from './hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Placeholder-only content. Phase 7 UI pass — no preference graph / LP solver
// wiring here (separate brief). Everything below marked "mock"/"placeholder"
// stands in for data that will eventually come from the scoring engine.
// Terminology: this screen was called "tie-break" in earlier discovery docs;
// that term is retired in favor of "Criteria Calibration" throughout.
// ---------------------------------------------------------------------------

// Hold duration after a selection, before the fade starts — a deliberate
// pause so the selected-state highlight registers before the pair changes.
// Starting point within the 400ms-1s range Dan asked for; tune live.
const SELECTION_HOLD_MS = 500;

// Card-pair fade duration, opacity-only, linear — deliberately abrupt/
// geometric, not theatrical. Starting point within the 150-200ms range.
const FADE_MS = 180;

// Cycled by pairIndex, covering the 1-6 criteria-per-card range (spec DoD).
const MOCK_PAIR_POOL: { left: CriterionData[]; right: CriterionData[] }[] = [
  {
    left: [
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
    right: [
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
  {
    left: [
      {
        label: 'Atmosphere',
        levelName: 'Immersive',
        description: 'Sustains a single mood across the runtime.',
      },
    ],
    right: [
      {
        label: 'Atmosphere',
        levelName: 'Uneven',
        description: 'Mood shifts break continuity between tracks.',
      },
    ],
  },
  {
    left: [
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
      {
        label: 'Performance',
        levelName: 'Tight',
        description: 'Consistently well-executed playing throughout.',
      },
      {
        label: 'Atmosphere',
        levelName: 'Immersive',
        description: 'Sustains a single mood across the runtime.',
      },
      {
        label: 'Pacing',
        levelName: 'Deliberate',
        description: 'Tracklist builds with clear intent.',
      },
    ],
    right: [
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
      {
        label: 'Performance',
        levelName: 'Loose',
        description: 'Some timing issues, more spontaneous feel.',
      },
      {
        label: 'Atmosphere',
        levelName: 'Uneven',
        description: 'Mood shifts break continuity between tracks.',
      },
      { label: 'Pacing', levelName: 'Erratic', description: 'Tracklist order feels arbitrary.' },
    ],
  },
];

// Cumulative accuracy thresholds — purely illustrative placeholder mapping,
// not derived from any real confidence computation. Distinct from progress:
// this never resets and grows independently of how many rounds are left.
function accuracyForRound(round: number): { level: AccuracyLevel; percent: number } {
  if (round <= 2) return { level: 'Low', percent: 20 };
  if (round <= 5) return { level: 'Medium', percent: 55 };
  return { level: 'High', percent: 85 };
}

// Progress: how far through the session — a separate placeholder curve from
// accuracy, so the two metrics visibly diverge across rounds in this mock.
function progressForRound(round: number): number {
  return Math.min(round * 12, 100);
}

interface Snapshot {
  round: number;
  pairIndex: number;
  progressPercent: number;
  accuracyPercent: number;
  accuracyLevel: AccuracyLevel;
}

function snapshotForRound(round: number, pairIndex: number): Snapshot {
  const { level, percent } = accuracyForRound(round);
  return {
    round,
    pairIndex,
    progressPercent: progressForRound(round),
    accuracyPercent: percent,
    accuracyLevel: level,
  };
}

type Phase = 'idle' | 'holding' | 'fading-out' | 'fading-in';

export function CriteriaCalibrationPage() {
  const reducedMotion = useReducedMotion();

  const [historyStack, setHistoryStack] = useState<Snapshot[]>([snapshotForRound(1, 0)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);

  // Tracks in-flight setTimeouts so an unmount mid-transition doesn't try to
  // set state on an unmounted component (mock-only concern, but cheap to guard).
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);
  function after(ms: number, fn: () => void) {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
  }

  const current = historyStack[historyIndex];
  const pair = MOCK_PAIR_POOL[current.pairIndex % MOCK_PAIR_POOL.length];
  const interactionDisabled = phase !== 'idle';

  function commitAdvance() {
    setHistoryStack((prev) => {
      const truncated = prev.slice(0, historyIndex + 1);
      const last = truncated[truncated.length - 1];
      const next = snapshotForRound(last.round + 1, last.pairIndex + 1);
      return [...truncated, next];
    });
    setHistoryIndex((i) => i + 1);
    setSelectedSide(null);
  }

  // Selection -> Hold -> Transition sequence (spec: Selection & Transition
  // Behavior). "Equal" runs the same sequence with no card highlighted, since
  // there's no specific card to highlight for that choice.
  function handleChoice(side: 'left' | 'right' | 'equal') {
    if (interactionDisabled) return;
    if (side !== 'equal') setSelectedSide(side);
    setPhase('holding');

    if (reducedMotion) {
      // prefers-reduced-motion: keep the hold (a UX pause, not motion), skip
      // the fade entirely and swap the pair instantly, per spec.
      after(SELECTION_HOLD_MS, () => {
        commitAdvance();
        setPhase('idle');
      });
      return;
    }

    after(SELECTION_HOLD_MS, () => {
      setPhase('fading-out');
      after(FADE_MS, () => {
        commitAdvance();
        setPhase('fading-in');
        after(FADE_MS, () => setPhase('idle'));
      });
    });
  }

  function handleUndo() {
    if (interactionDisabled || historyIndex === 0) return;
    setHistoryIndex((i) => i - 1);
    setSelectedSide(null);
  }

  function handleRedo() {
    if (interactionDisabled || historyIndex === historyStack.length - 1) return;
    setHistoryIndex((i) => i + 1);
    setSelectedSide(null);
  }

  function handleExit() {
    // Mocked: no scoring engine to save to yet. Copy intentionally avoids any
    // reference to a ranking, ordering, or results view (spec DoD).
    console.warn('[mock] saving calibration progress at round', current.round);
  }

  return (
    <Container maxW="4xl" py={10}>
      <VStack gap={10} align="stretch">
        {/* Static sibling of the fading region below — never fades itself;
            only its own numeric/text values update, instantly, via props. */}
        <ProgressHeader
          round={current.round}
          progressPercent={current.progressPercent}
          accuracyPercent={current.accuracyPercent}
          accuracyLevel={current.accuracyLevel}
          onExit={handleExit}
        />

        {/* aria-live region wraps QuestionPrompt + ComparisonRow together so
            screen readers announce the new question, not just a silent visual
            swap (spec point 4). QuestionPrompt's own text is fixed and does
            not fade — only ComparisonRow's opacity animates. */}
        <Box aria-live="polite">
          <VStack gap={6} align="stretch">
            <QuestionPrompt />
            <ComparisonRow
              leftCriteria={pair.left}
              rightCriteria={pair.right}
              selectedSide={selectedSide}
              interactionDisabled={interactionDisabled}
              onSelectLeft={() => handleChoice('left')}
              onSelectRight={() => handleChoice('right')}
              visible={phase !== 'fading-out'}
              reducedMotion={reducedMotion}
              fadeMs={FADE_MS}
            />
          </VStack>
        </Box>

        <Box display="flex" justifyContent="center">
          <EqualButton onClick={() => handleChoice('equal')} disabled={interactionDisabled} />
        </Box>

        <HistoryActions
          onUndo={handleUndo}
          onRedo={handleRedo}
          undoDisabled={interactionDisabled || historyIndex === 0}
          redoDisabled={interactionDisabled || historyIndex === historyStack.length - 1}
        />
      </VStack>
    </Container>
  );
}
