// @vitest-environment jsdom
//
// Coverage for the degree-tied checkpoint flow (2026-08-18) — see
// docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md. It
// replaced the 2026-08-17 threshold-crossing flow, whose tests these were: a tier can now only
// change at a degree-exhaustion boundary, so the crossing cases those tests covered (mid-degree
// interruption, tier-beats-degree-2 precedence, pre-acknowledging a resumed tier) no longer
// describe anything the code can do.
//
// Two things are mocked, and only two: `nextAction` (so a test can put the driver at an exact
// degree boundary, with or without escalation available, without constructing an answer log
// that happens to exhaust a pool) and `computeScoreSpreadAccuracy` (so the displayed percentage
// is a known number). Everything the tests assert on runs for real: the page's tier and
// checkpoint derivation, the escalation and acknowledgment handler, degreeTiers' mapping, and
// CalibrationCheckpoint itself. Mocking the derivation would have left nothing worth testing.
//
// NOTE what the accuracy mock is NOT for any more. Under thresholds it placed the flow at a
// tier; now it only sets a number the screens print as a separate fact. Several tests below
// deliberately set it to a value the old thresholds would have called Very High, precisely to
// assert the label ignores it.
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
  upsertCalibrationStatus: vi.fn().mockResolvedValue(undefined),
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

// Two accuracy values, named for what the RETIRED thresholds would have made of them — which
// is the point: the tier no longer reads this number at all, and tests below assert that by
// putting the flow at a low degree with a would-be-Very-High accuracy.
const BELOW_MEDIUM = 0.4; // would have been below the old 0.55 Medium threshold
const VERY_HIGH = 0.9; // would have been above the old 0.85 Very High threshold

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

describe('CriteriaCalibrationPage — degree-tied checkpoints', () => {
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

  function boundaryAt(degree: number, canEscalate = true) {
    actionForDegree = (d) =>
      d === degree ? EXHAUSTED_AT_DEGREE(degree, canEscalate) : ASK_AT_DEGREE(d);
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree,
      loading: false,
      error: null,
    });
  }

  it('labels the degree-2 boundary Blurry', async () => {
    boundaryAt(2);
    renderPage();

    expect(await screen.findByText(/2-criteria comparisons complete — Blurry/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Keep comparing/ })).toBeTruthy();
    // Full name: the page header carries its own bare "Stop here" pause button.
    expect(screen.getByRole('button', { name: /Stop here — evaluate albums/ })).toBeTruthy();
  });

  it('labels the degree-3 boundary Clear and the degree-4 boundary Sharp', async () => {
    boundaryAt(3);
    const { unmount } = renderPage();
    expect(await screen.findByText(/3-criteria comparisons complete — Clear/)).toBeTruthy();
    unmount();

    boundaryAt(4);
    renderPage();
    expect(await screen.findByText(/4-criteria comparisons complete — Sharp/)).toBeTruthy();
  });

  // The whole point of the 2026-08-18 change: the label is a function of degree alone. This
  // accuracy value would have been Very High under the retired thresholds (>= 0.85).
  it('assigns the label from the degree, ignoring accuracy entirely', async () => {
    accuracyValue = VERY_HIGH;
    boundaryAt(2);
    renderPage();

    expect(await screen.findByText(/2-criteria comparisons complete — Blurry/)).toBeTruthy();
    // The number is still reported — as its own separate fact, never as what earned the label.
    expect(screen.getByText(/pin the model down to 90%/)).toBeTruthy();
  });

  it('the header shows the degree-tied label and the accuracy percentage as separate values', async () => {
    accuracyValue = VERY_HIGH;
    actionForDegree = () => ASK_AT_DEGREE(2);
    renderPage();

    // Degree 2 still in progress — the base rung, regardless of a 90% accuracy reading.
    expect(await screen.findByText(/Detail: Unfocused/)).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
  });

  it('"Keep comparing" moves to the next degree and does not re-show the checkpoint', async () => {
    boundaryAt(2);
    renderPage();

    expect(await screen.findByText(/2-criteria comparisons complete — Blurry/)).toBeTruthy();
    await clickButton(/Keep comparing/);

    expect(screen.queryByText(/comparisons complete/)).toBeNull();
    expect(screen.getByText(/Now comparing 3 criteria at once\./)).toBeTruthy();
  });

  // Degrees 5 and 6 do not change the tier, so they must not interrupt. This is the one place
  // silent auto-progression still applies after the rewrite.
  it('escalates silently through the degree-5 boundary — no screen, no label change', async () => {
    actionForDegree = (d) => (d === 5 ? EXHAUSTED_AT_DEGREE(5) : ASK_AT_DEGREE(d));
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 5,
      loading: false,
      error: null,
    });
    renderPage();

    // Straight to a degree-6 question, with the label unchanged at Sharp.
    expect(await screen.findByText(/All 6 criteria at once/)).toBeTruthy();
    expect(screen.queryByText(/comparisons complete/)).toBeNull();
    expect(screen.getByText(/Detail: Sharp/)).toBeTruthy();
  });

  it('shows the neutral exhaustion screen when no degree is left to escalate to', async () => {
    boundaryAt(6, false);
    renderPage();

    expect(await screen.findByText(/No comparisons left to ask/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Evaluate albums/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Keep comparing/ })).toBeNull();
  });

  // Unchanged constraint from the 2026-08-17 pass, and still load-bearing: whether these shapes
  // reflect genuine under-information or a blind spot in the metric is an open question
  // (deferred-work.md), so the copy must not answer it in either direction.
  it('exhaustion copy blames neither the user nor the metric (the open question stays open)', async () => {
    boundaryAt(6, false);
    renderPage();

    await screen.findByText(/No comparisons left to ask/);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/inconsist|contradict|conflict|unreliable|couldn.t determine/i);
    expect(text).not.toMatch(/limitation|failed|unable to measure/i);
  });

  // Reverses the old Very High rule deliberately — see CalibrationCheckpoint's copy rule 3.
  // Sharp is the top of the LABEL ladder, not of the work, and degrees 5-6 are only reachable
  // through this button.
  it('Sharp offers continuation, and says plainly that the label will not move', async () => {
    boundaryAt(4);
    renderPage();

    await screen.findByText(/4-criteria comparisons complete — Sharp/);
    expect(screen.getByRole('button', { name: /Keep comparing/ })).toBeTruthy();
    expect(screen.getByText(/They stay at Sharp/)).toBeTruthy();
  });

  // The 2026-08-17 flow needed a resume-time seed to stop a standing tier firing its screen on
  // load, and a second one to stop a session resumed at a degree-3+ boundary being stranded with
  // neither screen nor question. Both are deleted; this asserts the behaviour they were
  // protecting still holds, from the derivation alone.
  it("a session resumed onto a boundary shows that boundary's checkpoint, and is never stranded", async () => {
    boundaryAt(3);
    renderPage();

    expect(await screen.findByText(/3-criteria comparisons complete — Clear/)).toBeTruthy();
    await clickButton(/Keep comparing/);
    expect(screen.getByText(/4 criteria this time\./)).toBeTruthy();
  });

  // The copy constraint from accuracyTierLabels.ts, asserted on rendered output rather than
  // trusted to review: degree-tying did NOT fix the recalibration report's #4/#8 inversion, so
  // no screen may present its label as a statement about ranking quality.
  it('no checkpoint screen claims the label says anything about ranking quality', async () => {
    for (const degree of [2, 3, 4]) {
      boundaryAt(degree);
      const { unmount } = renderPage();
      await screen.findByText(/comparisons complete/);
      const text = document.body.textContent ?? '';
      expect(text).not.toMatch(/rank/i);
      expect(text).not.toMatch(/reliable|trustworthy|confiden/i);
      expect(text).not.toMatch(/accurate/i);
      unmount();
    }
  });

  it('navigates to the ?from= destination when the user chooses to evaluate albums', async () => {
    boundaryAt(2);
    render(
      <ChakraProvider value={system}>
        <MemoryRouter initialEntries={['/calibrate?from=favorites']}>
          <CriteriaCalibrationPage />
        </MemoryRouter>
      </ChakraProvider>
    );

    await screen.findByText(/2-criteria comparisons complete — Blurry/);
    await clickButton(/Stop here — evaluate albums/);
    expect(mockNavigate).toHaveBeenCalledWith('/favorites');
  });
});
