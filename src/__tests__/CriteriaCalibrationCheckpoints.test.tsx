// @vitest-environment jsdom
//
// Coverage for the tiered-checkpoint flow that replaced Brief 3's automatic degree escalation
// (2026-08-17) — see docs/decisions/criteria-calibration/criteria-calibration-tiered-checkpoints.md.
//
// Two things are mocked, and only two: `nextAction` (so a test can put the driver at an exact
// degree boundary, with or without escalation available, without constructing an answer log
// that happens to exhaust a pool) and `computeScoreSpreadAccuracy` (so a test can place
// accuracy at an exact tier without hunting for a log that solves to one). Everything the
// tests actually assert on runs for real: the page's checkpoint derivation, the escalation and
// acknowledgment handlers, solverAccuracyTier's thresholds, and CalibrationCheckpoint itself.
// Mocking the checkpoint derivation would have left nothing worth testing.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import system from '../theme';
import { CriteriaCalibrationPage } from '../CriteriaCalibrationPage';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import type { DriverAction } from '../lib/criteria-calibration/elicitationDriver';

vi.mock('../hooks/useCriteriaCatalog', () => ({ useCriteriaCatalog: vi.fn() }));
vi.mock('../hooks/useCalibrationResume', () => ({ useCalibrationResume: vi.fn() }));
vi.mock('../hooks/usePendingWritesGuard', () => ({ usePendingWritesGuard: vi.fn() }));
vi.mock('../hooks/useFeedbackToast', () => ({ useFeedbackToast: vi.fn() }));
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: vi.fn(),
  },
}));
vi.mock('../lib/criteria-calibration/persistence', () => ({
  insertAnswer: vi.fn().mockResolvedValue('new-db-id'),
  deleteAnswer: vi.fn().mockResolvedValue(undefined),
  upsertWeightsAndStatus: vi.fn().mockResolvedValue(undefined),
}));

// Driven per test. `nextAction` is called with the CURRENT degree, so returning a
// degree-dependent action is what lets a single mock cover "boundary at degree 2, real
// question at degree 3".
let actionForDegree: (degree: number) => DriverAction = () => ASK_AT_DEGREE(2);
vi.mock('../lib/criteria-calibration/elicitationDriver', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/criteria-calibration/elicitationDriver')>();
  return {
    ...actual,
    nextAction: (_session: unknown, _levels: number[], degree: number) => actionForDegree(degree),
  };
});

let accuracyValue = 0.1;
vi.mock('../lib/criteria-calibration/scoreSpreadAccuracy', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/criteria-calibration/scoreSpreadAccuracy')>();
  return { ...actual, computeScoreSpreadAccuracy: () => accuracyValue };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { useCriteriaCatalog } from '../hooks/useCriteriaCatalog';
import { useCalibrationResume } from '../hooks/useCalibrationResume';
import { usePendingWritesGuard } from '../hooks/usePendingWritesGuard';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useAuth } from '../AuthContext';

const CRITERION_NAMES = [
  'Songwriting',
  'Riffs',
  'Vocals',
  'Production',
  'Atmosphere',
  'Technicality',
];
function buildLevels() {
  const levels: Record<number, { label: string; description: string }> = {};
  for (let lvl = 1; lvl <= 5; lvl++) {
    levels[lvl] = { label: `Level ${lvl}`, description: `Level ${lvl} description.` };
  }
  return levels;
}
const FIXTURE_CATALOG: CriteriaCatalog = {
  entries: CRITERION_NAMES.map((name, index) => ({ index, name, levels: buildLevels() })),
  levelsPerCriterion: [5, 5, 5, 5, 5, 5],
};

function ASK_AT_DEGREE(degree: number): DriverAction {
  const profileA: Record<number, number> = {};
  const profileB: Record<number, number> = {};
  for (let c = 0; c < degree; c++) {
    profileA[c] = c === 0 ? 5 : 1;
    profileB[c] = c === 0 ? 1 : 5;
  }
  return { type: 'ask', profileA, profileB, degree, reason: 'ambiguity-refinement' };
}

function EXHAUSTED_AT_DEGREE(degree: number, canEscalate = true): DriverAction {
  return {
    type: 'degree-exhausted',
    degree,
    canEscalate,
    nextDegree: canEscalate ? degree + 1 : null,
    reason: 'coverage-complete',
  };
}

// Thresholds from accuracyTiers.ts — named here so a test reads as "below Medium" rather than
// as a bare number, and so a future retune surfaces as a failure here rather than silently
// changing what these tests mean.
const BELOW_MEDIUM = 0.4; // < SCORE_SPREAD_MEDIUM_THRESHOLD (0.55)
const MEDIUM = 0.6; // >= 0.55, < SCORE_SPREAD_HIGH_THRESHOLD (0.75)
const HIGH = 0.78; // >= 0.75, < SCORE_SPREAD_VERY_HIGH_THRESHOLD (0.85)
const VERY_HIGH = 0.9; // >= 0.85

function renderPage() {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <CriteriaCalibrationPage />
      </MemoryRouter>
    </ChakraProvider>
  );
}

async function clickButton(name: RegExp | string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

// Commits one real answer through the page's own selection/hold/fade state machine. The hold
// is a setTimeout even under reduced motion, so the timers have to be run for the commit —
// and therefore the accuracy recompute the checkpoint derivation reads — to actually happen.
// Same approach as CriteriaCalibrationPage.solverCrash.test.tsx.
async function answerCurrentQuestion() {
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /About equal/i }));
  });
  await act(async () => {
    vi.runAllTimers();
  });
  vi.useRealTimers();
}

describe('CriteriaCalibrationPage — tiered checkpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accuracyValue = BELOW_MEDIUM;
    actionForDegree = () => ASK_AT_DEGREE(2);
    vi.mocked(useCriteriaCatalog).mockReturnValue({
      catalog: FIXTURE_CATALOG,
      loading: false,
      error: null,
    });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
    } as ReturnType<typeof useAuth>);
    vi.mocked(usePendingWritesGuard).mockReturnValue({
      beginWrite: vi.fn(),
      endWrite: vi.fn(),
      hasPendingWrites: false,
    });
    vi.mocked(useFeedbackToast).mockReturnValue({
      showSuccess: vi.fn(),
      showError: vi.fn(),
      showAction: vi.fn(),
    } as ReturnType<typeof useFeedbackToast>);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 2,
      loading: false,
      error: null,
    });
  });

  it('shows the degree-2 checkpoint at the degree-2 boundary even when accuracy is below Medium, and says so honestly', async () => {
    accuracyValue = BELOW_MEDIUM;
    actionForDegree = (degree) => (degree === 2 ? EXHAUSTED_AT_DEGREE(2) : ASK_AT_DEGREE(degree));
    renderPage();

    // The brief is explicit that this fires on the degree-2 boundary REGARDLESS of whether
    // Medium was crossed — and that the copy must not imply a threshold was met when it
    // wasn't.
    expect(await screen.findByText(/Your accuracy so far: 40% — Low/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Increase accuracy/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stop here — evaluate albums/ })).toBeTruthy();
  });

  it('labels the degree-2 checkpoint Medium when the threshold genuinely is met', async () => {
    accuracyValue = MEDIUM;
    actionForDegree = (degree) => (degree === 2 ? EXHAUSTED_AT_DEGREE(2) : ASK_AT_DEGREE(degree));
    renderPage();

    expect(await screen.findByText(/Your accuracy so far: 60% — Medium/)).toBeTruthy();
  });

  it('"Increase accuracy" moves to degree 3 and does not re-show the checkpoint', async () => {
    accuracyValue = MEDIUM;
    actionForDegree = (degree) => (degree === 2 ? EXHAUSTED_AT_DEGREE(2) : ASK_AT_DEGREE(degree));
    renderPage();

    await screen.findByText(/Your accuracy so far/);
    await clickButton(/Increase accuracy/);

    // Back to real questions at the next degree — no checkpoint, no exhausted screen.
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText(/Your accuracy so far/)).toBeNull();
  });

  it('auto-progresses silently through higher degree boundaries once degree 2 is acknowledged', async () => {
    accuracyValue = MEDIUM;
    // Degrees 2 and 3 are both exhausted; 4 has real questions. After acknowledging degree 2,
    // the degree-3 boundary must pass without a screen (brief step 2).
    actionForDegree = (degree) =>
      degree <= 3 ? EXHAUSTED_AT_DEGREE(degree) : ASK_AT_DEGREE(degree);
    renderPage();

    await screen.findByText(/Your accuracy so far/);
    await clickButton(/Increase accuracy/);

    // Landed at degree 4's questions, having crossed the degree-3 boundary with no interstitial.
    const articles = await screen.findAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(screen.queryByText(/no more comparisons available/i)).toBeNull();
  });

  it('interrupts the question stream with the High checkpoint when accuracy crosses High mid-degree', async () => {
    accuracyValue = MEDIUM;
    actionForDegree = () => ASK_AT_DEGREE(3);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 3,
      loading: false,
      error: null,
    });
    renderPage();

    // Mid-degree, real questions showing, no checkpoint yet.
    expect(await screen.findAllByRole('article')).toHaveLength(2);

    // Answering pushes accuracy over High. The checkpoint must appear even though the driver
    // still has questions available — it is not waiting for a degree boundary.
    accuracyValue = HIGH;
    await answerCurrentQuestion();

    expect(await screen.findByText(/Your accuracy is now 78% — High/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Increase accuracy/ })).toBeTruthy();
  });

  it('offers no continuation at Very High — a single action only', async () => {
    accuracyValue = MEDIUM;
    actionForDegree = () => ASK_AT_DEGREE(3);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 3,
      loading: false,
      error: null,
    });
    renderPage();
    await screen.findAllByRole('article');

    accuracyValue = VERY_HIGH;
    await answerCurrentQuestion();

    expect(await screen.findByText(/Your accuracy is 90% — Very High/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Increase accuracy/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Evaluate albums$/ })).toBeTruthy();
  });

  it('shows the neutral exhaustion fallback when no degree is left to escalate to', async () => {
    accuracyValue = MEDIUM;
    actionForDegree = () => EXHAUSTED_AT_DEGREE(6, false);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 6,
      loading: false,
      error: null,
    });
    renderPage();

    expect(await screen.findByText(/There are no more comparisons available/)).toBeTruthy();
    expect(screen.getByText(/this is where your answers land/)).toBeTruthy();
    // Single action, and specifically NO restart CTA — restart lives in the always-visible
    // control from Brief 2 (not yet built), and must not be duplicated here.
    expect(screen.queryByRole('button', { name: /Increase accuracy/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Evaluate albums$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start over|restart/i })).toBeNull();
  });

  it('exhaustion copy blames neither the user nor the metric (the open question stays open)', async () => {
    accuracyValue = MEDIUM;
    actionForDegree = () => EXHAUSTED_AT_DEGREE(6, false);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 6,
      loading: false,
      error: null,
    });
    const { container } = renderPage();
    await screen.findByText(/There are no more comparisons available/);

    // Whether these sessions reflect genuine under-information or a blind spot in
    // computeScoreSpreadAccuracy is unresolved (tracked in deferred-work.md), so the copy must
    // presuppose neither answer.
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/inconsistent|contradict|incorrect|mistake|could have/i);
    expect(text).not.toMatch(/unfortunately|sorry|limitation|failed/i);
  });

  it('does not fire a tier checkpoint on load for a session resumed above the threshold', async () => {
    // Regression guard: firing on a standing tier rather than an in-session crossing made a
    // resumed Very High session a dead end — its checkpoint offers no continuation, so the
    // user could never reach another question.
    accuracyValue = VERY_HIGH;
    actionForDegree = () => ASK_AT_DEGREE(3);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 3,
      loading: false,
      error: null,
    });
    renderPage();

    expect(await screen.findAllByRole('article')).toHaveLength(2);
    // The ProgressHeader legitimately reads "Accuracy: Very High" here — that is the honest
    // live label, not a checkpoint. What must be absent is the checkpoint screen itself.
    expect(screen.queryByText(/This is as precise as this method gets/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Evaluate albums$/ })).toBeNull();
  });

  it('a session resumed at a degree-3 boundary is not stranded', async () => {
    // Regression guard. `degree2Acknowledged` is session-local and starts false, so on a
    // RESUMED session it cannot have been set by a click this visit. If it also gates
    // auto-progression, a user who left off exactly at a degree-3+ boundary comes back to a
    // page that shows neither a checkpoint (degree !== 2, tiers pre-acknowledged) nor a
    // question (the driver is at a boundary) and cannot escalate — a dead end.
    accuracyValue = MEDIUM;
    actionForDegree = (degree) => (degree === 3 ? EXHAUSTED_AT_DEGREE(3) : ASK_AT_DEGREE(degree));
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 3,
      loading: false,
      error: null,
    });
    renderPage();

    // Must land on degree 4's questions, not on the transient "Moving on…" fallback.
    expect(await screen.findAllByRole('article')).toHaveLength(2);
  });

  it('navigates to the ?from= destination when the user chooses to evaluate albums', async () => {
    accuracyValue = MEDIUM;
    actionForDegree = () => EXHAUSTED_AT_DEGREE(6, false);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 6,
      loading: false,
      error: null,
    });
    renderPage();
    await screen.findByText(/There are no more comparisons available/);

    await clickButton(/^Evaluate albums$/);
    expect(mockNavigate).toHaveBeenCalledWith('/favorites');
  });
});
