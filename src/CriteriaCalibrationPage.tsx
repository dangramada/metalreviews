import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Flex, Text, VStack, Button } from '@chakra-ui/react';
import { ProgressHeader } from './components/criteria-calibration/ProgressHeader';
import { QuestionPrompt } from './components/criteria-calibration/QuestionPrompt';
import { ComparisonRow } from './components/criteria-calibration/ComparisonRow';
import { EqualButton } from './components/criteria-calibration/EqualButton';
import { HistoryActions } from './components/criteria-calibration/HistoryActions';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useCriteriaCatalog } from './hooks/useCriteriaCatalog';
import { LoadingIndicator } from './LoadingIndicator';
import { CalibrationSession } from './lib/criteria-calibration/calibrationSession';
import {
  nextAction,
  buildCanonicalDegree2Pairs,
} from './lib/criteria-calibration/elicitationDriver';
import { isMediumTierReached } from './lib/criteria-calibration/accuracyTiers';
import { degree2CoveragePercent } from './lib/criteria-calibration/sessionProgress';
import { profileToCriterionData } from './lib/criteria-calibration/criteriaCatalog';
import type { ComparisonResult, Profile } from './lib/criteria-calibration/preferenceGraph';

// ---------------------------------------------------------------------------
// Part 5a — wired to the real engine (in-memory only, no Supabase writes; that's
// part 5b). Everything below drives an actual CalibrationSession via
// elicitationDriver's nextAction. Explicit, acceptable limitation: a page refresh
// loses all progress (not a defect in this pass). No High/Very High accuracy is
// ever shown — that's blocked on a separate, documented solver-metric issue (see
// docs/decisions/criteria-calibration-engine.md, "Part 4 finding").
// ---------------------------------------------------------------------------

// Hold duration after a selection, before the fade starts — a deliberate
// pause so the selected-state highlight registers before the pair changes.
const SELECTION_HOLD_MS = 500;

// Card-pair fade duration, opacity-only, linear — deliberately abrupt/
// geometric, not theatrical.
const FADE_MS = 180;

type Phase = 'idle' | 'holding' | 'fading-out' | 'fading-in';

interface AnswerEntry {
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

// Degree always starts at 2 (Medium tier's prerequisite — see elicitationDriver.ts).
const STARTING_DEGREE = 2;

export function CriteriaCalibrationPage() {
  const reducedMotion = useReducedMotion();
  const { catalog, loading, error } = useCriteriaCatalog();

  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [redoBuffer, setRedoBuffer] = useState<AnswerEntry[]>([]);
  const [degree, setDegree] = useState(STARTING_DEGREE);
  const [stopped, setStopped] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);

  // Tracks in-flight setTimeouts so an unmount mid-transition doesn't try to
  // set state on an unmounted component.
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

  // Single source of truth is the `answers` list; the session is always rebuilt fresh from
  // it by replaying every recorded answer in order. This is the brief's recommended undo
  // approach (the engine isn't designed for in-place removal), applied uniformly to every
  // answers-array change, not just undo, so there's one code path instead of two. Cheap at
  // the session sizes this feature operates at.
  const session = useMemo(() => {
    const s = new CalibrationSession();
    for (const a of answers) s.recordAnswer(a.profileA, a.profileB, a.result);
    return s;
  }, [answers]);

  const action = catalog ? nextAction(session, catalog.levelsPerCriterion, degree) : null;

  const canonicalPairs = useMemo(
    () => (catalog ? buildCanonicalDegree2Pairs(catalog.levelsPerCriterion) : []),
    [catalog]
  );
  const mediumReached = catalog ? isMediumTierReached(session.graph, canonicalPairs) : false;
  const progressPercent = catalog ? degree2CoveragePercent(session.graph, canonicalPairs) : 0;

  const interactionDisabled = phase !== 'idle' || stopped;
  const round = answers.length + 1;

  function commitAdvance(result: ComparisonResult) {
    if (!action || action.type !== 'ask') return;
    setAnswers((prev) => [
      ...prev,
      { profileA: action.profileA, profileB: action.profileB, result },
    ]);
    setRedoBuffer([]);
    setSelectedSide(null);
  }

  // Selection -> Hold -> Transition sequence, unchanged from the mock pass. "Equal" runs the
  // same sequence with no card highlighted, since there's no specific card to highlight.
  function handleChoice(side: 'left' | 'right' | 'equal') {
    if (interactionDisabled || !action || action.type !== 'ask') return;
    const result: ComparisonResult = side === 'left' ? 'A' : side === 'right' ? 'B' : 'equal';
    if (side !== 'equal') setSelectedSide(side);
    setPhase('holding');

    if (reducedMotion) {
      after(SELECTION_HOLD_MS, () => {
        commitAdvance(result);
        setPhase('idle');
      });
      return;
    }

    after(SELECTION_HOLD_MS, () => {
      setPhase('fading-out');
      after(FADE_MS, () => {
        commitAdvance(result);
        setPhase('fading-in');
        after(FADE_MS, () => setPhase('idle'));
      });
    });
  }

  function handleUndo() {
    if (interactionDisabled || answers.length === 0) return;
    const last = answers[answers.length - 1];
    setAnswers((prev) => prev.slice(0, -1));
    setRedoBuffer((prev) => [...prev, last]);
    setSelectedSide(null);
  }

  function handleRedo() {
    if (interactionDisabled || redoBuffer.length === 0) return;
    const next = redoBuffer[redoBuffer.length - 1];
    setRedoBuffer((prev) => prev.slice(0, -1));
    setAnswers((prev) => [...prev, next]);
    setSelectedSide(null);
  }

  function handleEscalate() {
    if (
      !action ||
      action.type !== 'degree-exhausted' ||
      !action.canEscalate ||
      !action.nextDegree
    ) {
      return;
    }
    setDegree(action.nextDegree);
  }

  function handleExit() {
    // Wired to real state, but still no persistence this session (5b's scope). Stopping
    // just halts interaction locally — refreshing loses this progress, which is an
    // explicitly acceptable limitation for this pass, not a defect.
    setStopped(true);
  }

  if (loading) {
    return (
      <Container maxW="4xl" py={10}>
        <Flex justify="center" align="center" minH="300px">
          <LoadingIndicator />
        </Flex>
      </Container>
    );
  }

  if (error || !catalog) {
    return (
      <Container maxW="4xl" py={10}>
        <Text textAlign="center" color="red.400">
          Failed to load calibration criteria. Please try again later.
        </Text>
      </Container>
    );
  }

  return (
    <Container maxW="4xl" py={10}>
      <VStack gap={10} align="stretch">
        {/* Static sibling of the fading region below — never fades itself; only its own
            numeric/text values update, instantly, via prop changes. Progress and Accuracy
            both drive off the same real degree-2 coverage number for this pass — Accuracy's
            level is never anything beyond 'Low'/'Medium' (no High/Very High claim). */}
        <ProgressHeader
          round={round}
          progressPercent={progressPercent}
          accuracyPercent={progressPercent}
          accuracyLevel={mediumReached ? 'Medium' : 'Low'}
          onExit={handleExit}
        />

        {stopped ? (
          <Text textAlign="center" color="text.dim">
            Calibration paused. Refresh the page to start a new session — progress isn't saved yet.
          </Text>
        ) : action?.type === 'ask' ? (
          <>
            <Box aria-live="polite">
              <VStack gap={6} align="stretch">
                <QuestionPrompt />
                <ComparisonRow
                  leftCriteria={profileToCriterionData(action.profileA, catalog)}
                  rightCriteria={profileToCriterionData(action.profileB, catalog)}
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
          </>
        ) : (
          // degree-exhausted: never auto-escalates — continuing to the next degree is
          // always an explicit user action, per the driver's own contract.
          <VStack gap={4} aria-live="polite">
            <Text textAlign="center" color="text.primary" fontFamily="body">
              {action?.canEscalate
                ? "You've resolved everything at this level of detail."
                : "No more comparisons left to make — you've resolved everything this model can distinguish."}
            </Text>
            {action?.canEscalate && (
              <Button colorPalette="orange" onClick={handleEscalate}>
                Add more detail
              </Button>
            )}
          </VStack>
        )}

        <HistoryActions
          onUndo={handleUndo}
          onRedo={handleRedo}
          undoDisabled={interactionDisabled || answers.length === 0}
          redoDisabled={interactionDisabled || redoBuffer.length === 0}
        />
      </VStack>
    </Container>
  );
}
