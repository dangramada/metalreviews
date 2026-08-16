import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useRankingTestSetRatings } from './hooks/useRankingTestSetRatings';
import { usePendingWritesGuard } from './hooks/usePendingWritesGuard';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { useAuth } from './AuthContext';
import { LoadingIndicator } from './LoadingIndicator';
import { CalibrationSession } from './lib/criteria-calibration/calibrationSession';
import { nextAction } from './lib/criteria-calibration/elicitationDriver';
import {
  computeCommitState,
  type CommitComputation,
} from './lib/criteria-calibration/commitComputation';
import { profileToCriterionData } from './lib/criteria-calibration/criteriaCatalog';
import {
  insertAnswer,
  deleteAnswer,
  upsertWeightsAndStatus,
} from './lib/criteria-calibration/persistence';
import {
  seedWindowHistoryOnResume,
  popWindowHistory,
  INITIAL_STABILITY_WINDOW_STATE,
  INITIAL_PERSISTED_STABILITY_WINDOW,
  type StabilityWindowState,
  type PersistedStabilityWindow,
} from './lib/criteria-calibration/rankingStabilitySignal';
import {
  profileDegree,
  inferDegreeFromAnswers,
  type ComparisonResult,
  type Profile,
} from './lib/criteria-calibration/preferenceGraph';

// ---------------------------------------------------------------------------
// Part 5a wired the UI to the real engine, in-memory only. Part 5b (this pass) adds
// Supabase persistence: every real answer is saved as it happens, and reopening the page
// resumes exactly where the user left off, via the same replay-by-rebuilding-the-session
// approach 5a already uses for undo — not a second implementation. No High/Very High
// accuracy is ever shown in the UI — still blocked on the documented solver-metric issue
// (docs/decisions/criteria-calibration/criteria-calibration-engine.md, "Part 4 finding") — even though this pass
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

// Brief 3: shown once, under QuestionPrompt's heading, on the FIRST comparison at a degree
// above 2 — degree 2 is the starting point, not an escalation, so it gets no text. Illustrative
// copy (Dan owns final wording); hardcoded per-degree rather than generated, matching the
// current fixed 6-criterion production shape — a catalog with a different criteria count would
// simply show no text for degrees beyond 6, not break.
const DEGREE_CLARIFICATION_TEXT: Record<number, string> = {
  3: 'Now comparing 3 criteria at once.',
  4: '4 criteria this time.',
  5: '5 criteria in play now.',
  6: 'All 6 criteria at once — the most detailed comparisons.',
};

// Brief 3: post-signal copy for the degree-exhausted screen. Framed around calibration
// confidence, never around ranking/stability directly — ProgressHeader.tsx documents the
// same standing rule for exit copy, and it applies here too. Illustrative (Dan owns final
// wording).
const POST_FIRED_DEGREE_EXHAUSTED_TEXT =
  "You've reached your highest calibration confidence — you can stop here, or keep refining for extra precision.";

// Same outer chrome (Box/Container/VStack + Header/Footer) as App.tsx and FavoritesPage.tsx, so
// every return path below (loading, error, resume-loading, main) gets the home page's margins
// and nav — not just the happy path. The inner maxW="4xl" Container is the calibration flow's
// own content width, nested inside the wider container.xl page container, unchanged from before
// this pass.
function PageChrome({ children }: { children: React.ReactNode }) {
  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />
          {children}
          <Footer />
        </VStack>
      </Container>
    </Box>
  );
}

export function CriteriaCalibrationPage() {
  const reducedMotion = useReducedMotion();
  const { catalog, loading, error } = useCriteriaCatalog();
  const { user } = useAuth();
  const resume = useCalibrationResume(user?.id);
  // Brief 3: one-time fetch of RANKING_TEST_SET's 13 albums' ratings, independent of the
  // resume fetch above — doesn't gate seeding, only gates whether a given commit can advance
  // the stability window (see advanceWindowForCommit below; null while still loading is a
  // safe no-op, not a block).
  const { ratingsByAlbum } = useRankingTestSetRatings();
  const { showError } = useFeedbackToast();

  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [redoBuffer, setRedoBuffer] = useState<AnswerEntry[]>([]);
  const [degree, setDegree] = useState(STARTING_DEGREE);
  const [stopped, setStopped] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);

  // Brief 3: the tier-gated duration-based stability window (minimum real-answer span with an
  // unchanged top-10 set — see rankingStabilitySignal.ts). `windowHistory` is one StabilityWindowState
  // per known answer (seeded 1-2 entries on resume, pushed on every real commit/redo, popped
  // on Undo — see rankingStabilitySignal.ts's popWindowHistory for the Undo semantics and its
  // accepted, proven-safe gap at 2+ consecutive Undos with no intervening commit).
  // `persistedWindow` is the fuller current/previous/lastCommitChangedWindow triple that
  // upsertWeightsAndStatus writes and a FUTURE resume reads back — kept separately because
  // windowHistory alone doesn't carry `previous`/`lastCommitChangedWindow`.
  const [windowHistory, setWindowHistory] = useState<StabilityWindowState[]>([
    INITIAL_STABILITY_WINDOW_STATE,
  ]);
  // Initialized to the empty window, not resume.persistedStabilityWindow — the resume fetch
  // hasn't resolved on first render regardless, so that value would just be its own default
  // here too. The real seed happens in seedFromResume below, once resume.loading is false.
  const [persistedWindow, setPersistedWindow] = useState<PersistedStabilityWindow>(
    INITIAL_PERSISTED_STABILITY_WINDOW
  );
  const currentWindowState =
    windowHistory[windowHistory.length - 1] ?? INITIAL_STABILITY_WINDOW_STATE;

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
      setPersistedWindow(resume.persistedStabilityWindow);
      setWindowHistory(seedWindowHistoryOnResume(resume.persistedStabilityWindow));
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

  // Memoized because nextAction runs a full solveValues internally once past the cold-start
  // phase (elicitationDriver.ts's ambiguity-refinement branch) — measured at 203ms on a
  // 59-answer 6x5 session before the LP warm start landed, ~50ms after. Called bare in the
  // render body it re-solved on EVERY render, and one answered question produces four:
  // the selection/hold/fade state machine below sets `phase` in four separate timeout ticks
  // (holding -> fading-out -> fading-in -> idle). Three of those four renders change neither
  // the answer log nor the degree, so they were re-deriving a result that could not have
  // changed. See docs/decisions/criteria-calibration/criteria-calibration-lp-warm-start.md.
  //
  // The deps are exactly nextAction's three arguments, and it holds no state of its own —
  // every decision is derived from the session passed in, with the only randomness being a
  // per-subset seeded LCG, so it is deterministic given these three. `session` is itself
  // memoized on `answers` above, and `answers` is always replaced with a fresh array
  // (never mutated in place), so its identity changes exactly when the answer log does.
  const action = useMemo(
    () => (catalog ? nextAction(session, catalog.levelsPerCriterion, degree) : null),
    [catalog, session, degree]
  );

  // Single live accuracy value drives both the Progress ring and the Accuracy label/number
  // — previously these were two different metrics (canonical degree-2 pair coverage for the
  // ring vs. solver accuracy for the label), which could show the ring at 100% while
  // Accuracy still read "Low" once cold-start coverage was done but the model wasn't
  // actually determinate yet. See docs/decisions/criteria-calibration/criteria-calibration-medium-gate-redesign.md's
  // progress-ring-accuracy entry for the full history.
  //
  // computeScoreSpreadAccuracy (2026-08-09, superseding computeSolverAccuracy — see
  // scoreSpreadAccuracy.ts's header) costs ~100 LP solves against the default sample — too
  // expensive to run more than once per state transition. It used to run on its own 400ms
  // debounce here AND again inside upsertWeightsAndStatus AND a third time (every 3rd
  // commit) inside the now-removed ranking-stability logging hook — three independent
  // recomputes of the same LP per commit, which is what made the UI block outright once
  // answer count (and constraint count) grew past ~50 rounds. Fixed by computeCommitState
  // (commitComputation.ts): every action handler below computes it exactly once and shares
  // the result with upsertWeightsAndStatus, no debounce needed since there's no redundant
  // work left to throttle. The one exception is initial load (seeding from a resumed session
  // isn't a "commit"), handled by the one-time effect just below.
  const [progressPercent, setProgressPercent] = useState(0);
  const [mediumReached, setMediumReached] = useState(false);

  // Computes progress/accuracy exactly once, the first time both the catalog and the
  // resumed answer log are ready — covers page load, independent of which of the two
  // finishes loading first. Every subsequent update comes from applyCommitComputation below,
  // triggered explicitly by a real commit/undo/redo, not from this effect re-running.
  const initialAccuracyComputedRef = useRef(false);
  useEffect(() => {
    if (!catalog || !seeded || initialAccuracyComputedRef.current) return;
    initialAccuracyComputedRef.current = true;
    const { accuracy, mediumReached } = computeCommitState(catalog, answers);
    setProgressPercent(Math.round(accuracy * 100));
    setMediumReached(mediumReached);
  }, [catalog, seeded, answers]);

  const interactionDisabled = phase !== 'idle' || stopped;
  const round = answers.length + 1;

  // Brief 3: shown once, on the FIRST comparison at a degree above 2 — derived straight from
  // `answers` (not a separate "has this been shown" flag), so an Undo back to a degree's
  // first comparison naturally re-shows it, which is intended behavior, not an edge case.
  const isFirstAnswerAtDegree =
    answers.filter((a) => profileDegree(a.profileA) === degree).length === 0;
  const degreeClarificationText = degree > 2 ? DEGREE_CLARIFICATION_TEXT[degree] : undefined;

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

  // See usePendingWritesGuard.ts for why this is a visibility guard (beforeunload prompt),
  // not an await-before-next-interaction serialization.
  const { beginWrite, endWrite, hasPendingWrites } = usePendingWritesGuard();

  async function persistNewAnswer(entry: AnswerEntry) {
    if (!user) return;
    beginWrite();
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
    } finally {
      endWrite();
    }
  }

  // Cheap staleness guard: if a newer recompute has started by the time this one resolves,
  // skip its success/failure notification — the newer call's own write already reflects a
  // more current answers snapshot. This doesn't stop an in-flight older call's write from
  // landing after a newer one (both requests are already sent) — confirmed as a real,
  // unfixed write-race (not self-correcting in practice): see
  // docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md.
  const weightsGenRef = useRef(0);

  // Applies an already-computed CommitComputation: updates the displayed accuracy/progress
  // and persists weights/status (including `windowUpdate`, the stability-window value to
  // write). Split from the computeCommitState call itself (see commitAdvance/handleUndo/
  // handleRedo) so each of the three callers can get exactly the CommitComputation shape it
  // needs — with or without a stability advance — without a second LP solve either way.
  function applyCommitComputation(
    computation: CommitComputation,
    windowUpdate: PersistedStabilityWindow
  ) {
    if (!catalog) return;
    setProgressPercent(Math.round(computation.accuracy * 100));
    setMediumReached(computation.mediumReached);

    if (user) {
      const myGen = ++weightsGenRef.current;
      beginWrite();
      upsertWeightsAndStatus(user.id, catalog, computation, windowUpdate)
        .then(() => {
          if (myGen !== weightsGenRef.current) return;
          notifyPersistRecovered();
        })
        .catch((e) => {
          if (myGen !== weightsGenRef.current) return;
          console.warn('Failed to update calibration weights/status', e);
          notifyPersistFailure();
        })
        .finally(endWrite);
    }
  }

  // Forward step only (a real commit or redo — see commitComputation.ts's header for why
  // Undo can't go through this). Advances the window using computation.stabilityWindow
  // (already derived from the SAME solve computeCommitState just ran — no second LP solve),
  // updates windowHistory/persistedWindow, and returns the value to persist. When ratings
  // haven't loaded yet, computation.stabilityWindow is undefined and the window simply
  // doesn't move for this one commit — it catches up on the next one once ratings resolve.
  function advanceWindowForCommit(computation: CommitComputation): PersistedStabilityWindow {
    if (!computation.stabilityWindow) return persistedWindow;
    const next = computation.stabilityWindow;
    setPersistedWindow(next);
    setWindowHistory((prev) => [...prev, next.current]);
    return next;
  }

  function commitAdvance(result: ComparisonResult) {
    if (!action || action.type !== 'ask' || !catalog) return;
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

    const computation = computeCommitState(catalog, nextAnswers, {
      previous: persistedWindow,
      ratingsByAlbum,
    });
    const windowUpdate = advanceWindowForCommit(computation);
    applyCommitComputation(computation, windowUpdate);
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
    if (interactionDisabled || answers.length === 0 || !catalog) return;
    const last = answers[answers.length - 1];
    const nextAnswers = answers.slice(0, -1);
    setAnswers(nextAnswers);
    setRedoBuffer((prev) => [...prev, last]);
    setSelectedSide(null);
    // Undo is the one place `degree` can need to move BACKWARD — nextAction only ever
    // escalates it forward (resume effect / handleEscalate). Re-derive it from the
    // post-pop answer log using the same formula useCalibrationResume.ts uses on mount, so
    // undoing every answer at the current degree correctly reverts to the prior degree
    // instead of leaving `nextAction` stuck asking (or rather, wrongly regenerating) a
    // question at a degree that no longer has any answers.
    setDegree(inferDegreeFromAnswers(nextAnswers, STARTING_DEGREE));

    // Undo reverts the window to a specific, already-known prior value rather than advancing
    // it — see commitComputation.ts's header and rankingStabilitySignal.ts's popWindowHistory
    // for why this can't go through advanceStabilityWindow the way a real commit does.
    // `previous`/`lastCommitChangedWindow` are deliberately left as-is (not recomputed) — the
    // same accepted, proven-safe staleness as a resumed session's post-resume Undo, just
    // arising from a live-session Undo instead.
    const { next: nextWindowHistory, current: revertedCurrent } = popWindowHistory(windowHistory);
    setWindowHistory(nextWindowHistory);
    const revertedWindow: PersistedStabilityWindow = {
      ...persistedWindow,
      current: revertedCurrent,
    };
    setPersistedWindow(revertedWindow);

    if (last.dbId) {
      beginWrite();
      deleteAnswer(last.dbId)
        .then(notifyPersistRecovered)
        .catch((e) => {
          console.warn('Failed to delete undone calibration answer', e);
          notifyPersistFailure();
        })
        .finally(endWrite);
    }
    // If last.dbId isn't set yet, its insert is still in flight (or already failed) —
    // persistNewAnswer's own race check will notice the localId is gone and delete the
    // row itself once that insert resolves.
    const computation = computeCommitState(catalog, nextAnswers); // no stabilityContext — accuracy/weights only
    applyCommitComputation(computation, revertedWindow);
  }

  function handleRedo() {
    if (interactionDisabled || redoBuffer.length === 0 || !catalog) return;
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
    // Mirrors handleUndo's re-derivation: restoring a redone answer can cross a degree
    // boundary back upward, and without this, `degree` would stay wherever Undo last left it
    // instead of tracking the now-restored higher-degree answer.
    setDegree(inferDegreeFromAnswers(nextAnswers, STARTING_DEGREE));
    persistNewAnswer(entry);

    // Redo is a second real (forward) commit point alongside commitAdvance — both create a
    // new answer and both advance the stability window the same way.
    const computation = computeCommitState(catalog, nextAnswers, {
      previous: persistedWindow,
      ratingsByAlbum,
    });
    const windowUpdate = advanceWindowForCommit(computation);
    applyCommitComputation(computation, windowUpdate);
  }

  // Used both by the auto-escalation effect below (while !currentWindowState.fired) and by
  // the manual "Add more detail" button (shown only once currentWindowState.fired is true).
  function handleEscalate() {
    if (
      !action ||
      action.type !== 'degree-exhausted' ||
      !action.canEscalate ||
      action.nextDegree === null
    ) {
      return;
    }
    setDegree(action.nextDegree);
  }

  // Brief 3 — auto-escalation: while the stability signal hasn't fired yet, degree escalation
  // happens automatically. The user never sees the "degree exhausted" screen mid-flow while
  // !fired, only real questions — useLayoutEffect (not useEffect) specifically so this
  // resolves before paint; an ordinary useEffect would let the browser paint the exhausted
  // screen for one frame before flipping to the next question, a visible flash this avoids.
  // Once currentWindowState.fired is true, this effect's condition is permanently false
  // (fired never un-fires — see rankingStabilitySignal.ts), so escalation reverts to fully
  // manual from that point on, via the "Add more detail" button.
  useLayoutEffect(() => {
    if (action?.type === 'degree-exhausted' && action.canEscalate && !currentWindowState.fired) {
      // `degree` genuinely is React state (persisted, read by nextAction, also settable via
      // resume-seeding and the manual "Add more detail" click below) — it can't just be
      // computed during render the way the rule's guidance usually suggests instead. This is
      // the same accepted pattern as App.tsx/FavoritesPage.tsx's own set-state-in-effect
      // disables: synchronizing local state with a signal (here, the driver's own
      // degree-exhausted report) that only becomes known once render has already happened.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleEscalate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, currentWindowState.fired]);

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
            both drive off the same live solver-accuracy number — Accuracy's level is never
            anything beyond 'Low'/'Medium' (no High/Very High claim). */}
          <ProgressHeader
            round={round}
            progressPercent={progressPercent}
            accuracyPercent={progressPercent}
            accuracyLevel={mediumReached ? 'Medium' : 'Low'}
            onExit={handleExit}
          />
          {hasPendingWrites && (
            // Visible pending-save signal, paired with the beforeunload guard above — a
            // refresh while this is showing will trigger the browser's native "leave site?"
            // confirmation rather than silently dropping the in-flight write.
            <Text textAlign="center" color="text.dim" fontSize="sm" fontFamily="body">
              Saving…
            </Text>
          )}

          {stopped ? (
            <Text textAlign="center" color="text.dim">
              Calibration paused. Your progress is saved — come back any time to continue.
            </Text>
          ) : action?.type === 'ask' ? (
            <>
              <Box aria-live="polite">
                <VStack gap={6} align="stretch">
                  <QuestionPrompt />
                  {isFirstAnswerAtDegree && degreeClarificationText && (
                    <Text textAlign="center" color="text.dim" fontSize="sm" fontFamily="body">
                      {degreeClarificationText}
                    </Text>
                  )}
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
            // degree-exhausted. Brief 3: while !currentWindowState.fired and canEscalate,
            // the useLayoutEffect above escalates automatically before paint — this branch's
            // "not fired" copy below should be effectively invisible in practice, kept only
            // as a sane fallback for the first render/edge timing. Once fired, escalation is
            // manual again: "Add more detail" reappears, and the copy switches to framing
            // continuing as optional rather than required (never referencing ranking/
            // stability directly — same standing rule as ProgressHeader's exit copy).
            <VStack gap={4} aria-live="polite">
              <Text textAlign="center" color="text.primary" fontFamily="body">
                {!action?.canEscalate
                  ? "No more comparisons left to make — you've resolved everything this model can distinguish."
                  : currentWindowState.fired
                    ? POST_FIRED_DEGREE_EXHAUSTED_TEXT
                    : "You've resolved everything at this level of detail."}
              </Text>
              {action?.canEscalate && currentWindowState.fired && (
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
