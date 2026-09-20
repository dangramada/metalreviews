import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Container, Flex, Text, VStack } from '@chakra-ui/react';
import { Alert } from './components/ui/alert';
import { CloseButton } from './components/ui/close-button';
import {
  CalibrationBreadcrumb,
  CalibrationPageHeader,
} from './components/criteria-calibration/CalibrationPageHeader';
import { WorkStatusRow } from './components/criteria-calibration/WorkStatusRow';
import { ActionRail } from './components/criteria-calibration/ActionRail';
import { PauseDialog } from './components/criteria-calibration/PauseDialog';
import { GuideTab } from './components/criteria-calibration/GuideTab';
import { ResultsTab } from './components/criteria-calibration/ResultsTab';
import { QuestionPrompt } from './components/criteria-calibration/QuestionPrompt';
import { ComparisonRow } from './components/criteria-calibration/ComparisonRow';
import { EqualButton } from './components/criteria-calibration/EqualButton';
import {
  CalibrationCheckpoint,
  type CheckpointVariant,
} from './components/criteria-calibration/CalibrationCheckpoint';

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
  deleteAllAnswers,
  resetCalibrationStatus,
  syncCalibrationStatus,
  upsertCalibrationStatus,
  upsertWeightsAndStatus,
} from './lib/criteria-calibration/persistence';
import type { AccuracyTier } from './lib/criteria-calibration/accuracyTierLabels';
import type { LevelValue } from './lib/criteria-calibration/solver';
import type { FillClampState } from './lib/criteria-calibration/degreeTiers';
import {
  STARTING_DEGREE,
  clampFillMonotone,
  completedDegrees,
  computeDegreeCoverageFill,
  computeProgressPercent,
  isDegree2Frozen,
  isLabelChangingDegree,
  tierForCompletedDegrees,
} from './lib/criteria-calibration/degreeTiers';
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
// TIERED CHECKPOINTS (2026-08-17) replaced Brief 3's automatic escalation, deleting the whole
// rankingStabilitySignal.ts machinery (`fired`, the top-10 window, windowHistory, seven DB
// columns) along with it. See criteria-calibration-tiered-checkpoints.md.
//
// DEGREE-TIED TIERS (2026-08-18) then replaced the accuracy THRESHOLDS those checkpoints fired
// on. See criteria-calibration-degree-tiers-and-progress.md. Three things matter for reading
// the code below:
//
//   1. A tier can now only change at a degree-exhaustion boundary, because it names how many
//      degrees of comparison are finished (degreeTiers.ts). That collapsed the whole
//      threshold-crossing apparatus this file used to carry: a Set of acknowledged tiers, two
//      resume-time seeding effects, a separate degree-2 flag, and a four-way precedence chain
//      between them are all gone, replaced by one number — `acknowledgedBoundaryDegree`.
//   2. The Progress ring is no longer the accuracy percentage. It is the segmented per-degree
//      measure (one equal segment per degree, filled continuously by the same coverage gate
//      that ends a degree). Accuracy is still computed and still displayed, next to the label,
//      as its own independent number.
//   3. The label and the accuracy percentage are INDEPENDENT and must be presented that way.
//      Neither is derived from the other any more, and the label makes no claim about ranking
//      quality — see accuracyTierLabels.ts's copy rule, which is backed by evidence, not taste.
// ---------------------------------------------------------------------------

// Hold duration after a selection, before the fade starts — a deliberate
// pause so the selected-state highlight registers before the pair changes.
const SELECTION_HOLD_MS = 500;

// Card-pair fade duration, opacity-only, linear — deliberately abrupt/
// geometric, not theatrical.
const FADE_MS = 180;

type Phase = 'idle' | 'holding' | 'fading-out' | 'fading-in';

// The three tabs of the criteria-calibration-page-redesign IA. Lives in the URL (?step=), not
// local state alone, so a refresh or shared link preserves which tab is showing — see
// CalibrationPageHeader's Tabs.Root, which is the only writer of this param besides the
// in-page CTAs (Guide's "Start Calibration", a checkpoint's non-terminal "Pause here", the
// Pause dialog's "Pause and view results").
export type CalibrationStep = 'guide' | 'calibration' | 'results';

function isCalibrationStep(value: string | null): value is CalibrationStep {
  return value === 'guide' || value === 'calibration' || value === 'results';
}

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

const SOLVER_RESTART_FAILURE_MESSAGE = "Couldn't restart — try again in a moment.";

// Trim attempts before giving up on auto-recovery. A handful of trailing answers is a
// plausible bad tail; a log that still fails after this many is not something to keep
// silently eating answers over — better to stop and say so.
const RECOVERY_TRIM_LIMIT = 5;

// Same outer chrome (Box/Container/VStack + Header/Footer) as App.tsx and FavoritesPage.tsx, so
// every return path below (loading, error, resume-loading, main) gets the home page's margins
// and nav — not just the happy path.
//
// There is deliberately NO inner width constraint any more (2026-09-08). Every return path used
// to nest a `Container maxW="4xl"` (896px) inside this container.xl one, which made calibration
// visibly narrower than every other page in the app — the header spanned the full width while
// the content sat in a squeezed centre column. AlbumRatingPage.tsx, the layout this page is
// meant to match, uses container.xl alone and lets its content be as wide as the app. Individual
// blocks that genuinely need a reading measure (the Guide intro paragraph, checkpoint copy) cap
// their own width locally instead.
function PageChrome({
  breadcrumb,
  children,
}: {
  /** Handed to the global Header, which owns the header-rule-to-breadcrumb spacing. */
  breadcrumb?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header breadcrumb={breadcrumb} />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const exitDestination = resolveExitDestination(searchParams.get('from'));

  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [redoBuffer, setRedoBuffer] = useState<AnswerEntry[]>([]);
  const [degree, setDegree] = useState(STARTING_DEGREE);
  // Replaces the old `stopped` boolean + inline "Calibration paused" text swap — pausing is
  // now the real PauseDialog (criteria-calibration-page-redesign §7), and confirming it
  // navigates to the Results tab rather than halting interaction in place. Like `stopped`
  // before it, deliberately not persisted: nothing about "paused" survives a reload, the
  // answer log is the only durable state.
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  // Resume banner (terminology-and-gate-unification): dismissible per visit only — deliberately
  // NOT persisted, so it reappears next visit if `tier === 'none'` still holds, same convention
  // as `stopped`/`acknowledgedBoundaryDegree` above (nothing about "seen this" survives a
  // reload/remount here).
  const [resumeBannerDismissed, setResumeBannerDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);

  // The degree whose boundary checkpoint the user has already acted on, this page visit only.
  //
  // This ONE number replaces everything the threshold era needed here: a Set of acknowledged
  // tiers, a separate degree-2 flag, and two resume-time seeding effects that existed only to
  // stop a standing threshold from re-firing its screen on every render (and, for the old Very
  // High screen, from stranding a resumed session on a dead end that offered no continuation).
  //
  // None of that is expressible any more. A tier now changes only at a degree boundary, and a
  // boundary is inherently a one-time position: acting on the screen escalates the degree, which
  // moves off it. So "have they dealt with THIS boundary" is the whole question, and a resumed
  // session that starts on a boundary should simply see the screen — that is the correct
  // behaviour, not a bug to seed around.
  //
  // DELIBERATELY NOT PERSISTED (decision recorded in the tiered-checkpoints doc §6 and §8, still
  // in force). The tier itself is a pure function of the answer log; persisting the
  // acknowledgment would re-add user_calibration_status columns and re-open the un-awaited-write
  // race that emptying that table closed. The cost is that a reload re-shows one checkpoint —
  // one extra click, no lost progress, consistent with `stopped`, which has never been persisted
  // either.
  const [acknowledgedBoundaryDegree, setAcknowledgedBoundaryDegree] = useState<number | null>(null);

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
      // No checkpoint state to seed. The 2026-08-17 flow needed two seeds here — one so a
      // resumed above-degree-2 session wasn't stranded with auto-progression switched off, one
      // so a standing tier didn't fire its screen on load. Both were symptoms of state that
      // could disagree with the answer log; boundary acknowledgment can't, because a boundary
      // the user hasn't acted on is exactly where they should be shown a screen, resumed or not.
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

  // Progress and Accuracy are two INDEPENDENT numbers again as of 2026-08-18, after nine days
  // of being the same one.
  //
  // History, because this has now flipped twice and the reasons differ. Originally the ring
  // showed canonical degree-2 pair coverage while the label showed solver accuracy — which
  // could put the ring at 100% while Accuracy still read "Low", so 2026-08-09 collapsed both
  // onto the accuracy number (see criteria-calibration-medium-gate-redesign.md's
  // progress-ring-accuracy entry). The ring is now a coverage measure again, but NOT the one
  // that produced that contradiction: it is per-degree, and a degree only completes when the
  // driver's own coverage gate is satisfied, so "ring full" and "model still undetermined at
  // this degree" cannot both be true. The label, meanwhile, no longer reads accuracy at all.
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
  const [accuracyPercent, setAccuracyPercent] = useState(0);
  // The raw value too, because the DB stores the unrounded number — and because a status write
  // triggered by a tier change (see the effect below) has no computation of its own to read.
  const [accuracy, setAccuracy] = useState(0);
  // The solved feasible ranges from the most recent computation, kept because the progress
  // bar's within-degree fill is a function of them AND of the current degree — and `degree`
  // changes on escalation without a new commit, so the fill has to be recomputable at render
  // time rather than baked in when the answer was solved. Cheap: reading ranges is arithmetic,
  // not an LP solve.
  const [solvedValues, setSolvedValues] = useState<LevelValue[][] | null>(null);

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
    setAccuracyPercent(Math.round(computation.accuracy * 100));
    setAccuracy(computation.accuracy);
    setSolvedValues(computation.solved.values);

    // NOTHING to pre-acknowledge. The 2026-08-17 flow seeded the resumed session's tier here so
    // a standing threshold wouldn't fire its screen on load — and specifically so a log already
    // at Very High wasn't stranded on a screen offering no continuation. Neither can happen
    // now: a checkpoint fires only while the driver reports a degree exhausted, acting on it
    // escalates off that boundary, and the terminal screen is reached only when there is
    // genuinely nothing left to ask. A resumed session sitting on a boundary SHOULD see its
    // screen, which is the one behaviour the old seed had to carve an exception for.
  }, [catalog, seeded, answers]);

  const interactionDisabled = phase !== 'idle';
  const round = answers.length + 1;

  // No explicit ?step= yet (first visit, or a link that didn't set one): resume mid-flow for a
  // session with answers already logged (matches the pre-redesign behavior most closely for
  // existing users), otherwise start on the Guide tab. Once seeded is true this reads the real
  // resumed answer count, not the empty initial array every session starts render with.
  const stepParam = searchParams.get('step');
  const activeStep: CalibrationStep = isCalibrationStep(stepParam)
    ? stepParam
    : answers.length > 0
      ? 'calibration'
      : 'guide';

  // `replace`, not push — switching tabs shouldn't pile up browser-history entries the way
  // navigating between pages does.
  function setStep(step: CalibrationStep) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('step', step);
        return next;
      },
      { replace: true }
    );
  }

  // Brief 3: shown once, on the FIRST comparison at a degree above 2 — derived straight from
  // `answers` (not a separate "has this been shown" flag), so an Undo back to a degree's
  // first comparison naturally re-shows it, which is intended behavior, not an edge case.
  const isFirstAnswerAtDegree =
    answers.filter((a) => profileDegree(a.profileA) === degree).length === 0;
  const degreeClarificationText = degree > 2 ? DEGREE_CLARIFICATION_TEXT[degree] : undefined;

  // Freeze checkpoint (criteria-calibration-freeze-checkpoint, Step 2): counts answers logged
  // AT degree 2 specifically, same filter as isFirstAnswerAtDegree above, so it stays correct
  // even in the unlikely case an Undo/Redo revisits degree 2 after escalating past it.
  const answersAtCurrentDegree = answers.filter((a) => profileDegree(a.profileA) === degree).length;

  // ---------------------------------------------------------------------------
  // Tier, progress and checkpoint derivation (2026-08-18). Everything here is computed during
  // render from `degree`, `action` and `solvedValues` — all pure functions of the answer log.
  // There is no stored trajectory, nothing to replay, and nothing that can drift out of sync
  // with the answers. That was already the structural difference from the retired stability
  // signal; degree-tying keeps it and removes the one piece of genuinely session-shaped state
  // the threshold flow still needed (which tiers had been crossed and acknowledged).
  //
  // WHY THE TIER IS NOT AN ESTIMATE, and why that is the whole argument. Pass 2 (see
  // criteria-calibration-ranking-stability-analysis.md) rejected accuracy tiers as a proxy for
  // RANKING STABILITY, and the 2026-08-17 recalibration then found no accuracy threshold that
  // generalises across preference shapes at all. Degree-tying does not answer either finding by
  // predicting better — measured the same way, degree boundaries produce false positives on the
  // same traces (see the decision doc's §2b). It answers them by not predicting: "you have
  // answered every trade-off this model can distinguish at this level of detail" is true by
  // construction at every boundary, for every user, with no constant to calibrate. Do not
  // "improve" this by re-attaching it to an accuracy number, and do not let the copy imply the
  // label says anything about ranking quality.
  const atDegreeBoundary = action?.type === 'degree-exhausted';
  const tier: AccuracyTier = tierForCompletedDegrees(completedDegrees(degree, atDegreeBoundary));
  // Mirrors `tier` for the async persistence callbacks, which resolve after the render that
  // computed it — same reason `answersRef` exists.
  const tierRef = useRef<AccuracyTier>(tier);
  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);

  // Writes the tier when it changes WITHOUT a new answer — which degree-tying makes a real case
  // rather than a theoretical one. Reaching a boundary promotes the tier on the same answer log
  // the previous write already persisted, so nothing else would ever send it: the combined
  // weights+status write only runs on a commit/undo/redo. Without this, a user who reaches a
  // boundary and leaves straight for the album pages sees the checkpoint announce one label and
  // the rating page's confidence read the previous one.
  //
  // Guarded on `solvedValues` so it cannot fire before the first real computation and write
  // accuracy 0 over a resumed session's stored value. The RPC's own answer-count guard is `>=`,
  // so re-writing at an unchanged count is accepted rather than rejected as stale.
  const lastWrittenTierRef = useRef<AccuracyTier | null>(null);
  useEffect(() => {
    if (!user || !solvedValues) return;
    if (lastWrittenTierRef.current === tier) return;
    lastWrittenTierRef.current = tier;
    beginWrite();
    upsertCalibrationStatus(user.id, tier, accuracy, answers.length)
      .then(notifyPersistRecovered)
      .catch((e) => {
        console.warn('Failed to update calibration tier', e);
        notifyPersistFailure();
      })
      .finally(endWrite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, user, solvedValues]);

  // Within-degree fill for the progress bar's current segment, clamped monotone by
  // clampFillMonotone (degreeTiers.ts) — see that function for why the clamp exists at all and
  // why it deliberately does not survive an Undo.
  const bestFillRef = useRef<FillClampState | null>(null);
  const rawFill =
    solvedValues && catalog
      ? computeDegreeCoverageFill(catalog.levelsPerCriterion, solvedValues, answers, degree)
      : 0;
  // A boundary means the driver's own coverage gate is satisfied, so the segment is full by
  // definition. Stated explicitly rather than relied upon: the `pool-empty` exhaustion reason
  // returns BEFORE the driver solves, so on that path there is no fresh solve behind `rawFill`
  // and it can read low. Rare — `pool-empty` did not occur once in the 945 replayed rounds —
  // but it is the one case where the computed fill and the driver disagree, and the driver is
  // the authority on whether a degree is finished.
  const currentFill = atDegreeBoundary ? 1 : rawFill;
  const displayFill = clampFillMonotone(bestFillRef.current, {
    degree,
    answerCount: answers.length,
    fill: currentFill,
  });
  bestFillRef.current = { degree, answerCount: answers.length, fill: displayFill };
  const progressPercent = Math.round(
    computeProgressPercent(degree, displayFill, catalog?.levelsPerCriterion.length ?? 0)
  );

  // A boundary with nowhere left to escalate to is the real end of the road. Expressed as
  // `!canEscalate` rather than `degree === 6` so it stays correct for a catalog with a
  // different number of criteria.
  const isTerminalExhaustion = action?.type === 'degree-exhausted' && !action.canEscalate;

  // ONE RULE, replacing the four-way precedence chain the threshold flow needed (Very High >
  // High > degree 2 > exhausted, plus a substitution flag for when a tier screen stood in for
  // the degree-2 one). Both of those existed because a threshold could be crossed anywhere,
  // including mid-degree and including simultaneously with a degree-2 boundary. A degree tier
  // changes only AT a boundary, so at most one screen can ever apply, and which one is a
  // function of the degree just exhausted.
  //
  // Degree 6 exhausts without a screen of its own here: it is always terminal for this catalog,
  // routed to isTerminalExhaustion's branch instead. The auto-progression effect below carries
  // any degree whose exhaustion produces no checkpoint at all (there is currently no such
  // degree left among 2-5, now that degree 5 also gets a screen — see degreeTiers.ts's
  // isLabelChangingDegree).
  let checkpoint: CheckpointVariant | null = null;
  if (atDegreeBoundary && action && acknowledgedBoundaryDegree !== action.degree) {
    if (isTerminalExhaustion) {
      checkpoint = 'exhausted';
    } else if (isLabelChangingDegree(action.degree)) {
      // The tier the user has just reached — the same value `tier` holds above, named here from
      // the boundary's own degree so the screen and the header can never disagree.
      checkpoint = tierForCompletedDegrees(action.degree) as CheckpointVariant;
    }
  } else if (
    !atDegreeBoundary &&
    action?.type === 'ask' &&
    acknowledgedBoundaryDegree !== degree &&
    isDegree2Frozen(degree, answersAtCurrentDegree)
  ) {
    // The freeze checkpoint (criteria-calibration-freeze-checkpoint, Step 2): degree 2 is NOT
    // exhausted (the driver is still reporting `ask`, the candidate pool is non-empty per
    // criteria-calibration-freeze-checkpoint-step1-pool-check.md), but DEGREE_2_FREEZE_ANSWER_THRESHOLD
    // answers in without progress is evidence this session is one of the shapes that never
    // completes degree 2. Reuses `acknowledgedBoundaryDegree` (set to 2 on Continue, same as
    // every other checkpoint) rather than a second acknowledgment field — safe because this
    // branch and the real degree-2 boundary branch above are mutually exclusive by construction
    // of the threshold's safety margin (see DEGREE_2_FREEZE_ANSWER_THRESHOLD's own comment): a
    // session cannot both freeze at degree 2 (still `ask`, unexhausted, past answer 78) and
    // simultaneously sit ON degree 2's real boundary (`degree-exhausted`) in the same render.
    checkpoint = 'frozen';
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
  // Returns the write's promise (already-caught internally, so it never rejects) so a caller
  // that needs strict ordering can await it — handleRestart is the one caller that does, to
  // sequence its own direct status reset after this write's stale-tier RPC attempt settles.
  // Every other caller (commitAdvance/handleUndo/handleRedo) still fires and forgets it.
  function applyCommitComputation(computation: CommitComputation) {
    if (!catalog) return;
    setAccuracyPercent(Math.round(computation.accuracy * 100));
    setAccuracy(computation.accuracy);
    setSolvedValues(computation.solved.values);

    if (user) {
      const myGen = ++weightsGenRef.current;
      beginWrite();
      // `tierRef`, not `tier`: this function is called from handlers that captured an earlier
      // render's closure. The tier written here is the one for the position BEFORE this commit
      // — which is right for every commit except the one that lands exactly on a boundary, and
      // the tier-change effect below corrects that on the very next render.
      return upsertWeightsAndStatus(user.id, catalog, computation, tierRef.current)
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

  async function handleUndo() {
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
    // No checkpoint bookkeeping to unwind here. `degree` is re-derived above, so an Undo that
    // crosses back below a boundary genuinely un-reaches that tier — the label follows the log
    // like everything else. `acknowledgedBoundaryDegree` deliberately does NOT get cleared:
    // having already decided at this boundary once, the user should not be asked again for
    // re-reaching the boundary they just stepped back over.
    const weightsWrite = applyCommitComputation(computation);

    if (user) {
      // Undo decreases the live answer count, which upsert_calibration_status's guard (>=
      // only) can never accept — the write above is expected to lose that race, leaving
      // user_calibration_status.answer_count one HIGHER than the real, post-undo count. That
      // used to be silently wrong (tier just stayed one commit stale); since
      // hasInsufficientData reads `live < persisted`, it now actively blanks the score/rank on
      // Album Evaluation/Favorites after any Undo, not just after Restart — see
      // syncCalibrationStatus's own comment for why this needs the guard bypassed, and why
      // this must be sequenced after `weightsWrite` settles rather than racing it.
      beginWrite();
      try {
        await weightsWrite;
        await syncCalibrationStatus(
          user.id,
          tierRef.current,
          computation.accuracy,
          computation.answerCount
        );
        notifyPersistRecovered();
      } catch (e) {
        console.warn('Failed to sync calibration status after undo', e);
        notifyPersistFailure();
      } finally {
        endWrite();
      }
    }
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

  // Moves to the next degree. Called from a checkpoint's "Keep comparing" action, and from the
  // silent auto-progression effect below.
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

  // Silent auto-progression. Degree escalates with NO screen shown whenever the driver reports
  // a degree exhausted and no checkpoint is owed for it — which, after 2026-08-18, means the
  // degrees whose completion does not change the tier (5 and 6), plus any boundary the user has
  // already acted on. Gated on `!checkpoint` so a pending screen always wins; without that this
  // effect would escalate straight past the screen the user is supposed to see.
  //
  // The old `degree2Acknowledged` gate is gone. It existed because the degree-2 checkpoint was
  // the one thing standing between a fresh session and unlimited silent escalation, so the
  // effect had to be switched off until that decision was made — and then had to be seeded on
  // resume, or a session resuming at a degree-3+ boundary was stranded with neither a screen nor
  // a question. Checkpoints now cover every tier-changing boundary on their own, so `!checkpoint`
  // is the complete condition and there is nothing to seed.
  //
  // useLayoutEffect (not useEffect) so it resolves before paint: an ordinary effect would let
  // the browser paint the bare degree-exhausted state for one frame before flipping to the next
  // question, a visible flash.
  useLayoutEffect(() => {
    if (checkpoint) return;
    if (action?.type === 'degree-exhausted' && action.canEscalate) {
      // `degree` genuinely is React state (read by nextAction, also settable via
      // resume-seeding and the checkpoint's own continue action) — it can't just be computed
      // during render the way the rule's guidance usually suggests instead. Same accepted
      // pattern as App.tsx/FavoritesPage.tsx's own set-state-in-effect disables: synchronizing
      // local state with a signal (the driver's degree-exhausted report) that only becomes
      // known once render has already happened.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleEscalate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, checkpoint]);

  // "Keep comparing", from whichever checkpoint is currently showing. Every non-terminal
  // checkpoint is a degree boundary with an escalation available, so this is now one path
  // rather than the two the threshold flow needed (a degree-2 branch, and a High branch that
  // sometimes also had to settle the degree-2 decision it was standing in for).
  function handleCheckpointContinue() {
    if (!action || action.type !== 'degree-exhausted') return;
    // Recording the degree, not a tier: it is what stops this exact boundary re-rendering its
    // screen, and it stays correct for the degrees that show no screen at all.
    setAcknowledgedBoundaryDegree(action.degree);
    handleEscalate();
  }

  // "Continue" from the freeze checkpoint (criteria-calibration-freeze-checkpoint, Step 2).
  // Can't reuse handleEscalate: that function requires `action.type === 'degree-exhausted'`,
  // but the freeze checkpoint fires precisely while the driver is still reporting `ask` at
  // degree 2 (coverage never completes for these shapes — the pool isn't empty either, see
  // criteria-calibration-freeze-checkpoint-step1-pool-check.md). The next degree is simply
  // `degree + 1`, guarded the same way `canEscalate` guards it elsewhere.
  function handleFreezeContinue() {
    if (!catalog) return;
    const nextDegree = degree + 1;
    if (nextDegree > catalog.levelsPerCriterion.length) return;
    setAcknowledgedBoundaryDegree(degree);
    setDegree(nextDegree);
  }

  // Shared by the checkpoint's non-terminal "Pause here" and the PauseDialog's "Pause and view
  // results" — both are a temporary exit from an unfinished process, so both land on the
  // Results tab rather than leaving the page (criteria-calibration-page-redesign §4/§7). No
  // grade-conditional routing: the Results tab's own soft-gate (ResultsTab) handles "not
  // enough data yet" on its own.
  function goToResults() {
    setStep('results');
  }

  // "Pause here" from a non-terminal checkpoint.
  function handleCheckpointPause() {
    goToResults();
  }

  // "Done, evaluate albums" from the terminal (grade-6-exhausted) checkpoint. Leaves the page
  // entirely, unlike the Pause paths above: the user has finished deciding, and every answer
  // is already persisted, so there is nothing to save on the way out.
  function handleTerminalFinish() {
    navigate(exitDestination);
  }

  // Full reset (ActionRail's Restart, criteria-calibration-page-redesign §3): clears the
  // entire answer log, back to round 1 / degree 2 / solver reset from scratch. Distinct from
  // Undo — that's why ActionRail gates this behind its own confirm dialog rather than making
  // it a single click. Compute-first, like every other mutating handler here: an empty answer
  // log can't realistically fail to solve, but this keeps the same "never mutate state before
  // confirming the solve succeeds" discipline as commitAdvance/handleUndo/handleRedo.
  async function handleRestart() {
    const computation = trySolve([], SOLVER_RESTART_FAILURE_MESSAGE);
    if (!computation) return;

    setAnswers([]);
    setRedoBuffer([]);
    setDegree(STARTING_DEGREE);
    setAcknowledgedBoundaryDegree(null);
    setSelectedSide(null);

    // Fires the zero-answer weights write (correct — Restart really does mean a fresh,
    // unconstrained solve) and an accompanying status write carrying tierRef.current, which at
    // this instant is still the OLD session's tier. That write is expected to be rejected by
    // the guarded RPC in the common case (the DB's answer_count is still the old session's), but
    // awaited here regardless — see resetCalibrationStatus's own comment for why this function's
    // reset below must be the temporally LAST write to the status row, not just an eventual one.
    const weightsWrite = applyCommitComputation(computation);

    if (user) {
      beginWrite();
      try {
        await weightsWrite;
        await deleteAllAnswers(user.id);
        await resetCalibrationStatus(user.id);
        notifyPersistRecovered();
      } catch (e) {
        console.warn('Failed to reset persisted calibration state during restart', e);
        notifyPersistFailure();
      } finally {
        endWrite();
      }
    }
  }

  if (loading) {
    return (
      <PageChrome>
        <Box>
          <Flex justify="center" align="center" minH="300px">
            <LoadingIndicator />
          </Flex>
        </Box>
      </PageChrome>
    );
  }

  if (error || !catalog) {
    return (
      <PageChrome>
        <Box>
          <Text textAlign="center" color="red.400">
            Failed to load calibration criteria. Please try again later.
          </Text>
        </Box>
      </PageChrome>
    );
  }

  if (resume.loading || !seeded) {
    return (
      <PageChrome>
        <Box>
          <Flex direction="column" gap={4} justify="center" align="center" minH="300px">
            <LoadingIndicator />
            <Text color="text.dim" fontFamily="body">
              Loading your progress...
            </Text>
          </Flex>
        </Box>
      </PageChrome>
    );
  }

  const hasStarted = answers.length > 0;

  return (
    <PageChrome breadcrumb={<CalibrationBreadcrumb from={searchParams.get('from')} />}>
      {tier === 'none' && !resumeBannerDismissed && (
        // Shown on every entry to this page while tier is 'none', regardless of how the user got
        // here (direct nav, the hard gate, or the soft gate) — same copy every time, not
        // customized by source. A sibling of the panel Box below, not a child of its gap={0}
        // VStack, so it can't disturb the header/panel border join that VStack's own comment
        // documents.
        <Alert
          status="info"
          title="Pick up where you left off"
          variant="surface"
          endElement={<CloseButton size="sm" onClick={() => setResumeBannerDismissed(true)} />}
        >
          You haven&apos;t finished your first level of comparison yet. A few more comparisons
          usually settle the score closer to what matters most to you.
        </Alert>
      )}
      <Box>
        {/* gap={0}: the header's active tab overlaps the panel's top border by exactly its
            width and paints over it to read as the panel's top edge (CalibrationPageHeader.tsx,
            change 2). Any gap, or any element rendered between the two, breaks that join. */}
        <VStack gap={0} align="stretch">
          <CalibrationPageHeader
            activeStep={activeStep}
            onStepChange={setStep}
            tier={tier}
            accuracyPercent={accuracyPercent}
            hasStarted={hasStarted}
          />

          {/* Every tab's content sits inside one framed panel — the same 2px flush border
              AlbumRatingPage's Desktop/MobileRatingLayout cards use (`surface.ratingCardFill` +
              `border.ruleStrong`, square corners), so calibration reads as part of the same app
              rather than as loose text on the page background. Added 2026-09-08.

              Unlike those layouts the frame carries its own padding: their sections are designed
              to sit flush against the border and supply their own internal spacing, whereas the
              tab bodies here are ordinary prose/controls that would otherwise touch the rule.

              The frame wraps the tab CONTENT only; the breadcrumb and tab bar stay outside it.
              Since the 2026-09-11 design review the active tab deliberately JOINS this panel as a
              filled folder tab (see CalibrationPageHeader.tsx), which is why nothing may render
              between the header and this box. */}
          <Box
            bg="surface.tabPanel"
            border="2px solid"
            borderColor="border.ruleStrong"
            borderRadius="none"
            p={{ base: 5, md: 8 }}
            // A FLOOR, not a fixed height (2026-09-12). The three tabs differ enormously —
            // Guide is six 500px-plus carousel cards, Results is one sentence and a button —
            // and the frame used to collapse to a fraction of its height on every switch. A
            // floor stops that collapse while still letting Guide be as tall as it needs to be;
            // matching the TALLEST tab instead would have parked Results inside several hundred
            // pixels of empty panel to fix a problem only Results has. It also covers the
            // states WITHIN the Calibration tab (question view, checkpoint, the recovery
            // spinner), which vary by nearly as much as the tabs do — being on the frame rather
            // than on any one branch, it applies to all of them for free.
            //
            // Desktop only: the value is sized to the Calibration tab's own natural height at
            // full width, which is not what any of this content measures on a narrow screen,
            // and on mobile the tabs are reached one at a time rather than compared.
            minH={{ base: 'auto', md: '640px' }}
          >
            {unrecoverable ? (
              // Auto-recovery gave up (RECOVERY_TRIM_LIMIT trims, or nothing left to trim).
              // Deliberately a dead end rather than trimming further: past this point we'd be
              // deleting real answers on a guess about what's wrong. Shown regardless of
              // activeStep — a broken answer log isn't a per-tab concern.
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
            ) : activeStep === 'guide' ? (
              <GuideTab catalog={catalog} onStart={() => setStep('calibration')} />
            ) : activeStep === 'results' ? (
              <ResultsTab
                tier={tier}
                accuracyPercent={accuracyPercent}
                solvedValues={solvedValues}
                catalog={catalog}
                onBackToCalibration={() => setStep('calibration')}
              />
            ) : checkpoint ? (
              // Ahead of the 'ask' branch below, though the two can no longer both apply while a
              // checkpoint is showing: every checkpoint EXCEPT 'frozen' exists only while the
              // driver reports the current degree exhausted (no question to ask in that state);
              // 'frozen' is the one exception, showing mid-degree while the driver is still
              // reporting `ask` (see the checkpoint derivation above for why that's still
              // mutually exclusive with a real boundary).
              <CalibrationCheckpoint
                variant={checkpoint}
                tier={tier}
                accuracyPercent={accuracyPercent}
                onContinue={
                  checkpoint === 'exhausted'
                    ? undefined
                    : checkpoint === 'frozen'
                      ? handleFreezeContinue
                      : handleCheckpointContinue
                }
                onPause={checkpoint === 'exhausted' ? undefined : handleCheckpointPause}
                onFinish={checkpoint === 'exhausted' ? handleTerminalFinish : undefined}
              />
            ) : action?.type === 'ask' ? (
              <>
                {/* Static sibling of the fading region below — never fades itself; only its own
                numeric/text values update, instantly, via prop changes. Rendered only here, not
                during a checkpoint: commitAdvance() already updates progressPercent to the new
                degree's baseline before a checkpoint renders, so showing that jumped number
                there would have no visible cause. */}
                <WorkStatusRow
                  round={round}
                  progressPercent={progressPercent}
                  onPause={() => setPauseDialogOpen(true)}
                />
                {/* Two-column GRID, not a flex row (2026-09-12 design review). The rail has to
                  line up with the top of the comparison cards, not with the question title
                  above them, while the title stays optically centred over the cards rather
                  than over the whole panel. A flex row can only do one of those: the rail
                  aligns to whatever starts the column, so keeping the title in that column
                  would need the rail pushed down by the title's exact rendered height — a
                  hardcoded offset that silently goes wrong the moment the title's size or
                  wrapping changes (which this very pass changes).

                  The grid gets both for free: the title occupies row 1 of the CARD column
                  only, so it centres on the cards; the rail and the cards share row 2, so
                  they align by construction, at any title height.

                  2026-09-13 (mobile): named `gridTemplateAreas` instead of per-Box
                  `gridColumn`/`gridRow`, responsive per breakpoint — one tree, CSS-only, same
                  technique as CalibrationPageHeader.tsx's badge-stacking fix. Desktop (`md`)
                  reproduces the exact layout above unchanged (". title" / "rail cards" is the
                  same auto/1fr, row-1-title-only, row-2-rail-and-cards shape). Mobile (`base`)
                  stacks title → rail → cards in one column, which turns ActionRail's own
                  responsive `direction={{ base: 'row', md: 'column' }}` (ActionRail.tsx) into a
                  horizontal row sitting above the comparison cards instead of a vertical column
                  beside them. */}
                <Box
                  display="grid"
                  gridTemplateColumns={{ base: '1fr', md: 'auto 1fr' }}
                  gridTemplateAreas={{
                    base: `"title" "rail" "cards"`,
                    md: `". title" "rail cards"`,
                  }}
                  columnGap={6}
                  rowGap={{ base: 4, md: 0 }}
                >
                  {/* my={8} is the design's 32px above and below the title on desktop. Margins on
                    grid items don't collapse, so this is exactly what it says. Tighter on mobile
                    (my=6) since title now shares a column with rail+cards below it rather than
                    sitting beside them — full 32px both sides plus the grid's own rowGap would
                    over-stack. */}
                  <Box gridArea="title" my={{ base: 6, md: 8 }}>
                    <QuestionPrompt />
                    {isFirstAnswerAtDegree && degreeClarificationText && (
                      <Text
                        mt={2}
                        textAlign="center"
                        color="text.dim"
                        fontSize="sm"
                        fontFamily="body"
                      >
                        {degreeClarificationText}
                      </Text>
                    )}
                  </Box>

                  <Box gridArea="rail">
                    <ActionRail
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      onRestart={handleRestart}
                      undoDisabled={interactionDisabled || answers.length === 0}
                      redoDisabled={interactionDisabled || redoBuffer.length === 0}
                    />
                  </Box>

                  <Box gridArea="cards">
                    <VStack gap={6} align="stretch">
                      {/* aria-live scopes to the pair that actually changes per round. The
                        title above is static, and announcing it every round would be noise. */}
                      <Box aria-live="polite">
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
                      </Box>

                      <Box display="flex" justifyContent="center">
                        <EqualButton
                          onClick={() => handleChoice('equal')}
                          disabled={interactionDisabled}
                        />
                      </Box>
                    </VStack>
                  </Box>
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
          </Box>

          {hasPendingWrites && (
            // Visible pending-save signal, paired with the beforeunload guard above — a
            // refresh while this is showing will trigger the browser's native "leave site?"
            // confirmation rather than silently dropping the in-flight write. Shown regardless
            // of which tab is active — an in-flight write isn't specific to the Calibration tab.
            //
            // Below the panel since 2026-09-11. It used to sit between the header and the panel,
            // where it would now break the active tab's join with the panel every time a write
            // was in flight, i.e. on every answer.
            <Text mt={4} textAlign="center" color="text.dim" fontSize="sm" fontFamily="body">
              Saving…
            </Text>
          )}

          <PauseDialog
            open={pauseDialogOpen}
            onOpenChange={setPauseDialogOpen}
            onConfirmPause={goToResults}
          />
        </VStack>
      </Box>
    </PageChrome>
  );
}
