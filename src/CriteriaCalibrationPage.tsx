import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Flex, Text, VStack, Button } from '@chakra-ui/react';
import { ProgressHeader } from './components/criteria-calibration/ProgressHeader';
import { QuestionPrompt } from './components/criteria-calibration/QuestionPrompt';
import { ComparisonRow } from './components/criteria-calibration/ComparisonRow';
import { EqualButton } from './components/criteria-calibration/EqualButton';
import { HistoryActions } from './components/criteria-calibration/HistoryActions';
import { Header } from './Header';
import { Footer } from './Footer';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useCriteriaCatalog } from './hooks/useCriteriaCatalog';
import { useCalibrationResume } from './hooks/useCalibrationResume';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { useAuth } from './AuthContext';
import { LoadingIndicator } from './LoadingIndicator';
import { CalibrationSession } from './lib/criteria-calibration/calibrationSession';
import {
  nextAction,
  buildCanonicalDegree2Pairs,
} from './lib/criteria-calibration/elicitationDriver';
import { isMediumTierReached } from './lib/criteria-calibration/accuracyTiers';
import { degree2CoveragePercent } from './lib/criteria-calibration/sessionProgress';
import { profileToCriterionData } from './lib/criteria-calibration/criteriaCatalog';
import {
  insertAnswer,
  deleteAnswer,
  upsertWeightsAndStatus,
} from './lib/criteria-calibration/persistence';
import type { ComparisonResult, Profile } from './lib/criteria-calibration/preferenceGraph';

// ---------------------------------------------------------------------------
// Part 5a wired the UI to the real engine, in-memory only. Part 5b (this pass) adds
// Supabase persistence: every real answer is saved as it happens, and reopening the page
// resumes exactly where the user left off, via the same replay-by-rebuilding-the-session
// approach 5a already uses for undo — not a second implementation. No High/Very High
// accuracy is ever shown in the UI — still blocked on the documented solver-metric issue
// (docs/decisions/criteria-calibration-engine.md, "Part 4 finding") — even though this pass
// now computes and stores those values (harmless stored, would not be harmless displayed).
// ---------------------------------------------------------------------------

// Hold duration after a selection, before the fade starts — a deliberate
// pause so the selected-state highlight registers before the pair changes.
const SELECTION_HOLD_MS = 500;

// Card-pair fade duration, opacity-only, linear — deliberately abrupt/
// geometric, not theatrical.
const FADE_MS = 180;

type Phase = 'idle' | 'holding' | 'fading-out' | 'fading-in';

interface AnswerEntry {
  // Stable, client-generated id assigned at creation time (before any DB round-trip) — used
  // to correlate an in-flight insert with the entry currently in local state. `dbId` is only
  // set once the insert resolves; a fresh AnswerEntry (new answer, or a redo) always gets a
  // brand-new localId, never reuses one from a previously-undone entry.
  localId: string;
  dbId?: string;
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

// Degree always starts at 2 (Medium tier's prerequisite — see elicitationDriver.ts) when
// there's no persisted session to resume; useCalibrationResume infers it otherwise.
const STARTING_DEGREE = 2;

// Same outer chrome (Box/VStack + Header/Footer) as App.tsx and FavoritesPage.tsx, so every
// return path below (loading, error, resume-loading, main) gets consistent nav — not just the
// happy path. The inner maxW="4xl" Container is the calibration flow's own content width,
// unchanged from before this pass.
function PageChrome({ children }: { children: React.ReactNode }) {
  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <VStack gap={6} align="stretch">
        <Header />
        {children}
        <Footer />
      </VStack>
    </Box>
  );
}

export function CriteriaCalibrationPage() {
  const reducedMotion = useReducedMotion();
  const { catalog, loading, error } = useCriteriaCatalog();
  const { user } = useAuth();
  const resume = useCalibrationResume(user?.id);
  const { showError } = useFeedbackToast();

  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [redoBuffer, setRedoBuffer] = useState<AnswerEntry[]>([]);
  const [degree, setDegree] = useState(STARTING_DEGREE);
  const [stopped, setStopped] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);

  // Seed local state from the resumed session exactly once, when the resume fetch
  // completes. `seeded` guards this so it can't re-run and clobber in-progress answers if
  // useCalibrationResume's effect ever re-fires for the same user.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    // Wrapped in an async function (matching useFavoritesList.ts's load() convention) even
    // though there's no further await here — this is a one-time hydration from an already-
    // resolved async source (the resume fetch), not a per-render synchronization.
    async function seedFromResume() {
      if (resume.loading || seeded) return;
      setSeeded(true);
      setAnswers(
        resume.answers.map((a) => ({
          localId: a.localId,
          dbId: a.dbId,
          profileA: a.profileA,
          profileB: a.profileB,
          result: a.result,
        }))
      );
      setDegree(resume.degree);
      if (resume.error) {
        showError("Couldn't load your saved progress — starting a new session");
      }
    }
    seedFromResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.loading]);

  // Mirrors `answers` after every commit so async persistence callbacks (which resolve well
  // after the triggering render) can read the truly-current state instead of a stale
  // closure — see persistNewAnswer's race check below.
  const answersRef = useRef<AnswerEntry[]>([]);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

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
  // it by replaying every recorded answer in order (5a's undo approach, reused as-is for
  // resume too — not a second implementation of the same idea).
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

  // Shared failure indicator across every persistence call (answer insert/delete, weights/
  // status upsert) — surfaces only on the transition INTO a failing streak, not per-call, so
  // a run of failures during an outage doesn't spam toasts. Clears silently on the next
  // success. A failure here never blocks or rolls back the in-memory flow.
  const persistFailingRef = useRef(false);
  function notifyPersistFailure() {
    if (persistFailingRef.current) return;
    persistFailingRef.current = true;
    showError(
      'Having trouble saving your progress — your answers still count, but check your connection'
    );
  }
  function notifyPersistRecovered() {
    persistFailingRef.current = false;
  }

  async function persistNewAnswer(entry: AnswerEntry) {
    if (!user) return;
    try {
      const dbId = await insertAnswer(user.id, entry.profileA, entry.profileB, entry.result);
      notifyPersistRecovered();
      const stillPresent = answersRef.current.some((a) => a.localId === entry.localId);
      if (!stillPresent) {
        // Undone while the insert was in flight — never leave the DB holding a row for an
        // answer the user already retracted, regardless of network timing.
        deleteAnswer(dbId).catch((e) => console.warn('Failed to clean up orphaned answer', e));
        return;
      }
      setAnswers((prev) => prev.map((a) => (a.localId === entry.localId ? { ...a, dbId } : a)));
    } catch (e) {
      console.warn('Failed to save calibration answer', e);
      notifyPersistFailure();
    }
  }

  // Cheap staleness guard: if a newer recompute has started by the time this one resolves,
  // skip its success/failure notification — the newer call's own write already reflects a
  // more current answers snapshot. This doesn't stop an in-flight older call's write from
  // landing after a newer one (both requests are already sent); that's self-correcting on
  // the next answer, per the brief, so not solved here.
  const weightsGenRef = useRef(0);
  function recomputeWeightsAndStatus(nextAnswers: AnswerEntry[]) {
    if (!user || !catalog) return;
    const myGen = ++weightsGenRef.current;
    upsertWeightsAndStatus(user.id, catalog, nextAnswers)
      .then(() => {
        if (myGen !== weightsGenRef.current) return;
        notifyPersistRecovered();
      })
      .catch((e) => {
        if (myGen !== weightsGenRef.current) return;
        console.warn('Failed to update calibration weights/status', e);
        notifyPersistFailure();
      });
  }

  function commitAdvance(result: ComparisonResult) {
    if (!action || action.type !== 'ask') return;
    const entry: AnswerEntry = {
      localId: crypto.randomUUID(),
      profileA: action.profileA,
      profileB: action.profileB,
      result,
    };
    const nextAnswers = [...answers, entry];
    setAnswers(nextAnswers);
    setRedoBuffer([]);
    setSelectedSide(null);
    persistNewAnswer(entry);
    recomputeWeightsAndStatus(nextAnswers);
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
    const nextAnswers = answers.slice(0, -1);
    setAnswers(nextAnswers);
    setRedoBuffer((prev) => [...prev, last]);
    setSelectedSide(null);

    if (last.dbId) {
      deleteAnswer(last.dbId)
        .then(notifyPersistRecovered)
        .catch((e) => {
          console.warn('Failed to delete undone calibration answer', e);
          notifyPersistFailure();
        });
    }
    // If last.dbId isn't set yet, its insert is still in flight (or already failed) —
    // persistNewAnswer's own race check will notice the localId is gone and delete the
    // row itself once that insert resolves.
    recomputeWeightsAndStatus(nextAnswers);
  }

  function handleRedo() {
    if (interactionDisabled || redoBuffer.length === 0) return;
    const restored = redoBuffer[redoBuffer.length - 1];
    // A fresh localId (and no dbId) — redo is a brand-new insert, consistent with the
    // answers table's append/insert-only convention, never a resurrection of the old row.
    const entry: AnswerEntry = {
      localId: crypto.randomUUID(),
      profileA: restored.profileA,
      profileB: restored.profileB,
      result: restored.result,
    };
    const nextAnswers = [...answers, entry];
    setRedoBuffer((prev) => prev.slice(0, -1));
    setAnswers(nextAnswers);
    setSelectedSide(null);
    persistNewAnswer(entry);
    recomputeWeightsAndStatus(nextAnswers);
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
    // No "stopped" state is persisted (per the brief) — resuming just picks up wherever the
    // real answer log left off. Stopping only halts interaction locally.
    setStopped(true);
  }

  if (loading) {
    return (
      <PageChrome>
        <Container maxW="4xl" py={10}>
          <Flex justify="center" align="center" minH="300px">
            <LoadingIndicator />
          </Flex>
        </Container>
      </PageChrome>
    );
  }

  if (error || !catalog) {
    return (
      <PageChrome>
        <Container maxW="4xl" py={10}>
          <Text textAlign="center" color="red.400">
            Failed to load calibration criteria. Please try again later.
          </Text>
        </Container>
      </PageChrome>
    );
  }

  if (resume.loading || !seeded) {
    return (
      <PageChrome>
        <Container maxW="4xl" py={10}>
          <Flex direction="column" gap={4} justify="center" align="center" minH="300px">
            <LoadingIndicator />
            <Text color="text.dim" fontFamily="body">
              Loading your progress...
            </Text>
          </Flex>
        </Container>
      </PageChrome>
    );
  }

  return (
    <PageChrome>
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
              Calibration paused. Your progress is saved — come back any time to continue.
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
    </PageChrome>
  );
}
