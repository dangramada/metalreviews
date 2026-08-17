import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Container, Flex, Text, VStack } from '@chakra-ui/react';
import { ProgressHeader } from './components/criteria-calibration/ProgressHeader';
import { QuestionPrompt } from './components/criteria-calibration/QuestionPrompt';
import { ComparisonRow } from './components/criteria-calibration/ComparisonRow';
import { EqualButton } from './components/criteria-calibration/EqualButton';
import { HistoryActions } from './components/criteria-calibration/HistoryActions';
import {
  CalibrationCheckpoint,
  type CheckpointVariant,
} from './components/criteria-calibration/CalibrationCheckpoint';
import type { AccuracyLevel } from './components/criteria-calibration/AccuracyStatus';
import { Header } from './Header';
import { Footer } from './Footer';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useCriteriaCatalog } from './hooks/useCriteriaCatalog';
import { useCalibrationResume } from './hooks/useCalibrationResume';
import { usePendingWritesGuard } from './hooks/usePendingWritesGuard';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { useAuth } from './AuthContext';
import { LoadingIndicator } from './LoadingIndicator';
import { CalibrationSession } from './lib/criteria-calibration/calibrationSession';
import { nextAction, type DriverAction } from './lib/criteria-calibration/elicitationDriver';
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
  solverAccuracyTier,
  type SolverAccuracyTier,
} from './lib/criteria-calibration/accuracyTiers';
import {
  profileDegree,
  inferDegreeFromAnswers,
  type ComparisonResult,
  type Profile,
} from './lib/criteria-calibration/preferenceGraph';

// ---------------------------------------------------------------------------
// Part 5a wired the UI to the real engine, in-memory only. Part 5b added Supabase
// persistence: every real answer is saved as it happens, and reopening the page resumes
// exactly where the user left off, via the same replay-by-rebuilding-the-session approach 5a
// already uses for undo — not a second implementation.
//
// TIERED CHECKPOINTS (2026-08-17) replaced Brief 3's automatic escalation. See
// docs/decisions/criteria-calibration/criteria-calibration-tiered-checkpoints.md. Two changes
// matter for reading the code below:
//
//   1. The auto-escalation useLayoutEffect is GONE, along with the whole
//      rankingStabilitySignal.ts machinery it read (`fired`, the top-10 window, windowHistory,
//      and seven DB columns). Degree escalation now happens only when the user chooses it at
//      an explicit checkpoint, or — between the degree-2 checkpoint and the next tier
//      crossing — automatically via handleEscalate with no screen shown.
//   2. High/Very High accuracy IS now displayed. The old rule capping the label at Medium
//      was about computeSolverAccuracy, the metric deprecated on 2026-08-09 for being blind
//      to degree-3+ improvement ("Part 4 finding"). The live metric is
//      computeScoreSpreadAccuracy, and the checkpoint flow is built on its tiers, so showing
//      them is the point rather than a leak.
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

// Where "evaluate albums" sends the user when they finish or stop. Deliberately an ALLOWLIST
// keyed by a `from` query param, not a raw path taken from the URL — same mechanism and same
// param name AlbumRatingPage.tsx already uses for its own back-navigation (see
// resolveBackDestination there, and docs/decisions/album-rating-page--concept-draft.md).
// Mirroring it rather than inventing a `next`/`redirectTo` keeps one convention across the
// app, and an allowlist means a crafted `?from=` can never redirect anywhere we didn't
// choose. Favorites' soft-gate dialog is the only inbound path today and passes
// `?from=favorites`; an absent or unrecognised param falls back to /favorites, which is what
// the hardcoded behaviour was before this existed.
const EXIT_DESTINATIONS: Record<string, string> = {
  favorites: '/favorites',
};
const DEFAULT_EXIT_DESTINATION = '/favorites';

function resolveExitDestination(from: string | null): string {
  if (from && EXIT_DESTINATIONS[from]) return EXIT_DESTINATIONS[from];
  return DEFAULT_EXIT_DESTINATION;
}

// ---------------------------------------------------------------------------
// Solver-crash safety net (2026-08-16). The LP solver THROWS on a numerical breakdown
// rather than degrading to a wrong answer (solver.ts's Chebyshev-center guard). That is
// correct and deliberately unchanged here — a silent catch at the solver layer is exactly
// how the pre-2026-08-12 Big-M bug reported feasible:true on ~1e14 outputs. What was wrong
// was what the throw did to the page: it escaped a setTimeout, React still flushed the
// already-scheduled setAnswers, the `action` memo re-threw during render, and with no
// ErrorBoundary anywhere the whole root unmounted — a blank page, with the triggering answer
// already persisted, so a reload reproduced it forever. Full trace + reproduction:
// docs/decisions/criteria-calibration/criteria-calibration-near-singular-pivot-impact.md.
//
// Two mechanisms, both at this page boundary and nowhere deeper:
//   1. Compute-first (trySolve, below): every solve is attempted BEFORE any state mutation
//      or persistence, so a failure has nothing to roll back — no React state to revert, no
//      Supabase row to delete. This is what makes a live commit unable to create a bad
//      persisted log in the first place.
//   2. Auto-recovery (the recovery effect, below): for a log that was ALREADY persisted
//      (a session bricked before this shipped), the failing trailing answers are trimmed and
//      their rows deleted until the log solves again.
// ---------------------------------------------------------------------------

const SOLVER_COMMIT_FAILURE_MESSAGE =
  "That comparison caused a calculation issue, so your answer wasn't saved. Try a different answer, or undo a previous one.";

const SOLVER_UNDO_FAILURE_MESSAGE =
  "Couldn't undo that — the calculation failed on the earlier state, so your progress is unchanged.";

const SOLVER_RECOVERY_MESSAGE =
  'We hit a calculation issue with your saved session and had to remove your most recent answer to recover it.';

// Trim attempts before giving up on auto-recovery. A handful of trailing answers is a
// plausible bad tail; a log that still fails after this many is not something to keep
// silently eating answers over — better to stop and say so.
const RECOVERY_TRIM_LIMIT = 5;

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
  const { showError } = useFeedbackToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const exitDestination = resolveExitDestination(searchParams.get('from'));

  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [redoBuffer, setRedoBuffer] = useState<AnswerEntry[]>([]);
  const [degree, setDegree] = useState(STARTING_DEGREE);
  const [stopped, setStopped] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);

  // Which tier checkpoints the user has already clicked through, this page visit only.
  //
  // DELIBERATELY NOT PERSISTED (decision recorded in the tiered-checkpoints doc). The tier
  // itself is a pure function of the answer log — solverAccuracyTier(accuracy) — which is
  // exactly the path-independence that makes this flow reliable where the retired signal
  // wasn't. But it also means "accuracy is High" stays true forever once crossed, so without
  // an acknowledgment record the High checkpoint would re-render on every commit after it.
  // Session-local state is what closes that, and keeping it session-local (rather than adding
  // DB columns) is the whole point: this brief's migration empties user_calibration_status of
  // exactly this kind of client-trajectory bookkeeping, and re-adding some would re-open the
  // un-awaited-write-race surface it just closed. The cost is that a reload re-shows a
  // checkpoint once — one extra click, no lost progress, and consistent with `stopped`, which
  // has never been persisted either.
  const [acknowledgedTiers, setAcknowledgedTiers] = useState<Set<SolverAccuracyTier>>(new Set());
  // Set when the user picks "Increase accuracy" at the degree-2 checkpoint. Until then a
  // degree-2 boundary must SHOW that checkpoint rather than auto-escalate past it; after it,
  // degree escalation runs silently until a tier checkpoint or exhaustion interrupts (brief
  // step 2). Also session-local, and self-healing if lost: on reload the checkpoint simply
  // shows again at the same boundary.
  const [degree2Acknowledged, setDegree2Acknowledged] = useState(false);

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
  //
  // nextAction runs its own solveValues, so it throws on exactly the same answer logs
  // computeCommitState does — and it does so during RENDER, which is what actually unmounted
  // the root (see the safety-net note at the top of this file). Catching here converts that
  // into a rendered recovery state. It cannot fire on a live commit any more (compute-first
  // means a log that fails never reaches `answers`), so in practice this only catches a
  // resumed session whose persisted log was already bad.
  const driverResult = useMemo((): { action: DriverAction | null; failed: boolean } => {
    if (!catalog) return { action: null, failed: false };
    try {
      return { action: nextAction(session, catalog.levelsPerCriterion, degree), failed: false };
    } catch (e) {
      console.error('Calibration solver failed while choosing the next question', e);
      return { action: null, failed: true };
    }
  }, [catalog, session, degree]);
  const action = driverResult.action;
  const solverFailed = driverResult.failed;

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
  // The RAW accuracy, kept alongside the rounded percent above because the tier must be
  // derived from the unrounded value — Math.round(0.7449) would read as 74% but must not be
  // allowed to tier as High at a 0.75 threshold.
  const [accuracy, setAccuracy] = useState(0);

  // Computes progress/accuracy exactly once, the first time both the catalog and the
  // resumed answer log are ready — covers page load, independent of which of the two
  // finishes loading first. Every subsequent update comes from applyCommitComputation below,
  // triggered explicitly by a real commit/undo/redo, not from this effect re-running.
  const initialAccuracyComputedRef = useRef(false);
  useEffect(() => {
    if (!catalog || !seeded || initialAccuracyComputedRef.current) return;
    let computation: CommitComputation;
    try {
      computation = computeCommitState(catalog, answers);
    } catch (e) {
      // A resumed log the solver can't handle. Deliberately does NOT set
      // initialAccuracyComputedRef — the recovery effect below trims the log, and this
      // effect then re-runs against the trimmed one to produce a real accuracy number.
      // Left unset, an unmount-on-throw is all this would have achieved.
      console.error('Calibration solver failed on the resumed answer log', e);
      return;
    }
    initialAccuracyComputedRef.current = true;
    setProgressPercent(Math.round(computation.accuracy * 100));
    setMediumReached(computation.mediumReached);
    setAccuracy(computation.accuracy);

    // Pre-acknowledge whatever tier the RESUMED log already sits at, so checkpoints fire on a
    // genuine in-session CROSSING rather than on a standing state.
    //
    // Without this, a session resumed above a threshold renders its checkpoint immediately, on
    // load, before the user has answered anything — and for Very High that is a dead end by
    // design: it offers no continuation (correctly, per the brief), so a returning user whose
    // saved log is already Very High could never reach another question. The checkpoint is
    // meant to mark "your accuracy just improved to X", which is not a thing that happened on
    // a page load.
    //
    // Still fully derived, still nothing persisted: the seed is computed from the same answer
    // log as everything else, at the one moment the log is first known. It also removes the
    // reload-re-shows-a-checkpoint wrinkle that session-local acknowledgment would otherwise
    // have. Deliberately does NOT touch degree2Acknowledged — that checkpoint is triggered by
    // the degree-2 boundary, not by a tier, and re-showing it to a user sitting exactly on
    // that boundary is correct.
    const resumedTier = solverAccuracyTier(computation.accuracy);
    if (resumedTier !== 'insufficient') {
      // Seeds 'high' alongside 'veryHigh': a log resuming at Very High has necessarily passed
      // High too, and leaving it unseeded would fire the High checkpoint on the way back down
      // after an Undo.
      setAcknowledgedTiers(
        resumedTier === 'veryHigh' ? new Set(['high', 'veryHigh']) : new Set([resumedTier])
      );
    }
  }, [catalog, seeded, answers]);

  const interactionDisabled = phase !== 'idle' || stopped;
  const round = answers.length + 1;

  // Brief 3: shown once, on the FIRST comparison at a degree above 2 — derived straight from
  // `answers` (not a separate "has this been shown" flag), so an Undo back to a degree's
  // first comparison naturally re-shows it, which is intended behavior, not an edge case.
  const isFirstAnswerAtDegree =
    answers.filter((a) => profileDegree(a.profileA) === degree).length === 0;
  const degreeClarificationText = degree > 2 ? DEGREE_CLARIFICATION_TEXT[degree] : undefined;

  // ---------------------------------------------------------------------------
  // Checkpoint derivation (2026-08-17). Everything here is computed during render from
  // `accuracy` and `action`, both of which are pure functions of the answer log — there is no
  // stored trajectory, nothing to replay, and nothing that can drift out of sync with the
  // answers. That is the structural difference from the retired signal, which had to persist
  // a running window precisely because it could not be re-derived.
  //
  // WHY TIER-CROSSING IS LEGITIMATE HERE, despite Pass 2 rejecting it. Pass 2 (see
  // criteria-calibration-ranking-stability-analysis.md) rejected accuracy tiers as a proxy for
  // RANKING STABILITY — the tier gate arrives unpredictably relative to the round where the
  // ranking actually settles (on oracle #6 it becomes eligible at n=71 for a session that
  // settled at n=40). That is a finding about tiers being a poor ESTIMATOR OF A DIFFERENT,
  // HIDDEN QUANTITY. Here the tier is not estimating anything: the checkpoint's subject IS the
  // accuracy tier, and its copy claims nothing about ranking or stability. "Your accuracy
  // reached High" is true by definition when solverAccuracyTier returns 'high'. Pass 2's
  // finding therefore does not apply, and this is NOT a reintroduction of the retired
  // mechanism. Do not "fix" this by reviving a stability window.
  const tier = solverAccuracyTier(accuracy);
  const atDegreeBoundary = action?.type === 'degree-exhausted';

  // The one place the tier is turned into user-facing words, shared by the header and the
  // checkpoint screens so the two can never disagree. Note solverAccuracyTier's
  // 'insufficient' covers everything below High, which is where isMediumTierReached splits
  // Low from Medium — the two functions read the same accuracy against different thresholds
  // (see accuracyTiers.ts), so this ordering is what keeps the four labels contiguous.
  const accuracyLabel: AccuracyLevel =
    tier === 'veryHigh' ? 'Very High' : tier === 'high' ? 'High' : mediumReached ? 'Medium' : 'Low';

  // A boundary with nowhere left to escalate to is the real end of the road, and it's the
  // only way brief step 2b's "pool exhausts without reaching the next tier" can actually
  // happen: at any lower degree, escalation is available and happens silently, so exhaustion
  // there is not a terminal state. Expressed as `!canEscalate` rather than `degree === 6` so
  // it stays correct for a catalog with a different number of criteria.
  const isTerminalExhaustion = action?.type === 'degree-exhausted' && !action.canEscalate;

  // Precedence, highest first. Degree 2 wins over a tier checkpoint deliberately: it is the
  // first considered stopping point the user is offered, and demoting it would mean a session
  // that crosses High early never gets asked the "do you want more accuracy at all?" question.
  // Very High wins over High so a single commit that vaults both thresholds shows the terminal
  // screen rather than an "encouraging progress toward Very High" screen it has already passed.
  let checkpoint: CheckpointVariant | null = null;
  if (atDegreeBoundary && degree === STARTING_DEGREE && !degree2Acknowledged) {
    checkpoint = 'degree2';
  } else if (tier === 'veryHigh' && !acknowledgedTiers.has('veryHigh')) {
    checkpoint = 'veryHigh';
  } else if (tier === 'high' && !acknowledgedTiers.has('high')) {
    checkpoint = 'high';
  } else if (isTerminalExhaustion) {
    checkpoint = 'exhausted';
  }

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
  // and persists weights/status. Split from the computeCommitState call itself (see
  // commitAdvance/handleUndo/handleRedo) so all three callers share one persistence path
  // without a second LP solve.
  function applyCommitComputation(computation: CommitComputation) {
    if (!catalog) return;
    setProgressPercent(Math.round(computation.accuracy * 100));
    setMediumReached(computation.mediumReached);
    setAccuracy(computation.accuracy);

    if (user) {
      const myGen = ++weightsGenRef.current;
      beginWrite();
      upsertWeightsAndStatus(user.id, catalog, computation)
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

  // The single place a solver throw is absorbed on the mutating paths. Callers run this
  // BEFORE touching React state or Supabase (see the safety-net note at the top of this
  // file), so a null return means "this step did not happen" — there is nothing to roll back
  // and, crucially, no persisted answer left without matching weights/status.
  function trySolve(nextAnswers: AnswerEntry[], failureMessage: string): CommitComputation | null {
    if (!catalog) return null;
    try {
      return computeCommitState(catalog, nextAnswers);
    } catch (e) {
      console.error('Calibration solver failed — this step was not applied', e);
      showError(failureMessage);
      return null;
    }
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

    // Compute-first (see trySolve). This ordering is load-bearing, not stylistic: the solve
    // used to run AFTER setAnswers + persistNewAnswer, so a throw left the answer in React
    // state and in Supabase while the render that followed it blanked the page. Solving
    // first means a failed comparison is simply never recorded anywhere.
    const computation = trySolve(nextAnswers, SOLVER_COMMIT_FAILURE_MESSAGE);
    if (!computation) {
      // The fade sequence in handleChoice continues either way, so the same question comes
      // back unselected and the user can answer it differently.
      setSelectedSide(null);
      return;
    }

    setAnswers(nextAnswers);
    setRedoBuffer([]);
    setSelectedSide(null);
    persistNewAnswer(entry);

    applyCommitComputation(computation);
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

    // Compute-first, same as commitAdvance: an undo whose target state the solver can't
    // handle is refused outright rather than half-applied (state popped and the DB row
    // deleted, then the solve throws).
    const computation = trySolve(nextAnswers, SOLVER_UNDO_FAILURE_MESSAGE);
    if (!computation) return;

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
    //
    // No checkpoint bookkeeping to unwind here. The tier is recomputed from the shorter
    // answer log like everything else, so an Undo that drops accuracy back below High
    // genuinely un-crosses that tier — which the retired `fired` signal could not do by
    // construction (it was one-way and terminal). `acknowledgedTiers` deliberately does NOT
    // get cleared: having already seen and dismissed the High checkpoint, the user should not
    // be shown it a second time for re-crossing the same threshold they just stepped back over.
    applyCommitComputation(computation);
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

    // Redo is a forward commit and gets the same compute-first treatment as commitAdvance.
    // Note the redo buffer is left intact on failure, so the answer isn't silently lost —
    // the user can retry it after undoing something else.
    const computation = trySolve(nextAnswers, SOLVER_COMMIT_FAILURE_MESSAGE);
    if (!computation) return;

    setRedoBuffer((prev) => prev.slice(0, -1));
    setAnswers(nextAnswers);
    setSelectedSide(null);
    // Mirrors handleUndo's re-derivation: restoring a redone answer can cross a degree
    // boundary back upward, and without this, `degree` would stay wherever Undo last left it
    // instead of tracking the now-restored higher-degree answer.
    setDegree(inferDegreeFromAnswers(nextAnswers, STARTING_DEGREE));
    persistNewAnswer(entry);

    applyCommitComputation(computation);
  }

  // Auto-recovery for a PERSISTED answer log the solver can't handle. Compute-first means a
  // live commit can no longer create one, so in practice this is for sessions bricked before
  // that shipped — but it's also the general backstop for "the log in the DB doesn't solve."
  // Trims the trailing answer, deletes its row, and lets the `action` memo re-evaluate; if it
  // still fails, this effect fires again, up to RECOVERY_TRIM_LIMIT times.
  const recoveryTrimsRef = useRef(0);
  const recoveryNotifiedRef = useRef(false);
  const [unrecoverable, setUnrecoverable] = useState(false);
  useEffect(() => {
    if (!solverFailed || !catalog || unrecoverable) return;
    if (answers.length === 0 || recoveryTrimsRef.current >= RECOVERY_TRIM_LIMIT) {
      setUnrecoverable(true);
      return;
    }
    recoveryTrimsRef.current += 1;

    const last = answers[answers.length - 1];
    const trimmed = answers.slice(0, -1);
    setAnswers(trimmed);
    setDegree(inferDegreeFromAnswers(trimmed, STARTING_DEGREE));

    if (last.dbId) {
      beginWrite();
      deleteAnswer(last.dbId)
        .then(notifyPersistRecovered)
        .catch((e) => {
          console.warn('Failed to delete the answer trimmed during solver recovery', e);
          notifyPersistFailure();
        })
        .finally(endWrite);
    }

    // Told once per session, not once per trim — a multi-trim recovery is still one event
    // from the user's point of view.
    //
    // Deferred via `after(0)` rather than called inline: the toaster commits with flushSync,
    // and calling it synchronously from inside an effect makes React warn "flushSync was
    // called from inside a lifecycle method... React cannot flush when React is already
    // rendering". Confirmed live in a browser on 2026-08-16 — the jsdom tests do not surface
    // it. `after` (not a bare setTimeout) so an unmount mid-recovery cancels it like every
    // other deferred callback here.
    if (!recoveryNotifiedRef.current) {
      recoveryNotifiedRef.current = true;
      after(0, () => showError(SOLVER_RECOVERY_MESSAGE));
    }

    // Bring the displayed accuracy and the persisted weights back in sync with the trimmed
    // log. If the trimmed log still doesn't solve, this effect simply runs again on the next
    // render — no toast, no state change here.
    try {
      applyCommitComputation(computeCommitState(catalog, trimmed));
    } catch {
      /* still failing — handled by the next trim cycle */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solverFailed, answers, catalog, unrecoverable]);

  // Moves to the next degree. Called from the degree-2 and High checkpoints' "Increase
  // accuracy" action, and from the silent auto-progression effect below.
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

  // Silent auto-progression (brief steps 2 and 4). Once the user has chosen "Increase
  // accuracy" at the degree-2 checkpoint, degree escalates 3->4->5->6 as each pool exhausts
  // with NO screen shown, until a tier checkpoint or terminal exhaustion interrupts. Gated on
  // `!checkpoint` so a pending checkpoint always wins — without that, this effect would
  // escalate straight past the screen the user is supposed to see.
  //
  // useLayoutEffect (not useEffect) so it resolves before paint: an ordinary effect would let
  // the browser paint the bare degree-exhausted state for one frame before flipping to the
  // next question, a visible flash. This is the one piece of the retired auto-escalation
  // machinery that survives, and only its mechanics — it is now gated on an explicit user
  // choice rather than on a signal deciding for the user.
  useLayoutEffect(() => {
    if (checkpoint) return;
    if (!degree2Acknowledged) return;
    if (action?.type === 'degree-exhausted' && action.canEscalate) {
      // `degree` genuinely is React state (read by nextAction, also settable via
      // resume-seeding and the checkpoints' own "Increase accuracy") — it can't just be
      // computed during render the way the rule's guidance usually suggests instead. Same
      // accepted pattern as App.tsx/FavoritesPage.tsx's own set-state-in-effect disables:
      // synchronizing local state with a signal (the driver's degree-exhausted report) that
      // only becomes known once render has already happened.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleEscalate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, checkpoint, degree2Acknowledged]);

  // "Increase accuracy" at the degree-2 checkpoint: record the choice, then escalate. Both
  // matter — without the flag the checkpoint would re-render at the same boundary and the
  // auto-progression effect above would stay switched off forever.
  function handleDegree2Continue() {
    setDegree2Acknowledged(true);
    handleEscalate();
  }

  // "Increase accuracy" at a tier checkpoint. Only the acknowledgment is needed: the user is
  // mid-degree with questions still available, so there is nothing to escalate — dismissing
  // the screen returns them to the next question. If they happen to be AT a boundary, the
  // auto-progression effect picks it up on the very next render.
  function acknowledgeTier(reached: SolverAccuracyTier) {
    setAcknowledgedTiers((prev) => new Set(prev).add(reached));
  }

  function handleExit() {
    // No "stopped" state is persisted — resuming just picks up wherever the real answer log
    // left off. Stopping only halts interaction locally.
    setStopped(true);
  }

  // "Evaluate albums" / "Stop here — evaluate albums" from any checkpoint. Leaves the page
  // entirely, unlike handleExit's in-place pause: the user has finished deciding, and every
  // answer is already persisted, so there is nothing to save on the way out.
  function handleFinish() {
    navigate(exitDestination);
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
            both drive off the same live score-spread-accuracy number. The label now goes all
            the way to Very High: the old 'never beyond Medium' cap belonged to the deprecated
            computeSolverAccuracy metric, and the checkpoint flow this header sits above is
            built on exactly these tiers. */}
          <ProgressHeader
            round={round}
            progressPercent={progressPercent}
            accuracyPercent={progressPercent}
            accuracyLevel={accuracyLabel}
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
          ) : unrecoverable ? (
            // Auto-recovery gave up (RECOVERY_TRIM_LIMIT trims, or nothing left to trim).
            // Deliberately a dead end rather than trimming further: past this point we'd be
            // deleting real answers on a guess about what's wrong.
            <VStack gap={4} aria-live="polite">
              <Text textAlign="center" color="red.400" fontFamily="body">
                We couldn't recover this calibration session automatically. Your saved answers are
                still there — please get in touch rather than starting over.
              </Text>
            </VStack>
          ) : solverFailed ? (
            <Flex direction="column" gap={4} justify="center" align="center" minH="200px">
              <LoadingIndicator />
              <Text color="text.dim" fontFamily="body">
                Recovering your session…
              </Text>
            </Flex>
          ) : checkpoint ? (
            // Deliberately ahead of the 'ask' branch: a tier crossing interrupts the question
            // stream on the commit that crosses it, rather than waiting for a degree boundary
            // that some sessions never reach again (per the brief's step 2a).
            <CalibrationCheckpoint
              variant={checkpoint}
              accuracyPercent={progressPercent}
              accuracyLabel={accuracyLabel}
              onContinue={
                checkpoint === 'degree2'
                  ? handleDegree2Continue
                  : checkpoint === 'high'
                    ? () => acknowledgeTier('high')
                    : undefined
              }
              onFinish={handleFinish}
            />
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
            // degree-exhausted with escalation still available and no checkpoint pending —
            // the auto-progression useLayoutEffect above moves the degree on before paint, so
            // this should be invisible in practice. Kept as a sane fallback for the first
            // render / edge timing, and as the honest state if `degree` somehow can't advance.
            <VStack gap={4} aria-live="polite">
              <Text textAlign="center" color="text.dim" fontFamily="body">
                Moving on to more detailed comparisons…
              </Text>
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
