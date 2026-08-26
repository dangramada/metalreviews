// @vitest-environment jsdom
//
// Coverage for the calibration checkpoint flow after the 2026-08-26 copy rewrite
// (criteria-calibration-checkpoint-copy-rewrite) — see
// docs/decisions/criteria-calibration/criteria-calibration-checkpoint-copy-rewrite.md. It
// replaced the 2026-08-18 degree-tied copy, whose tests these were: the underlying degree ->
// tier mapping is UNCHANGED (still degreeTiers.ts's tierForCompletedDegrees), only the copy, the
// badge's permanent visibility, and which degree boundaries get a screen at all changed (degree
// 5 now shows one; it was silent before).
//
// Two things are mocked, and only two: `nextAction` (so a test can put the driver at an exact
// degree boundary, with or without escalation available, without constructing an answer log
// that happens to exhaust a pool) and `computeScoreSpreadAccuracy` (so the displayed percentage
// is a known number). Everything the tests assert on runs for real: the page's tier and
// checkpoint derivation, the escalation and acknowledgment handler, degreeTiers' mapping, and
// CalibrationCheckpoint itself. Mocking the derivation would have left nothing worth testing.
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

describe('CriteriaCalibrationPage — checkpoint copy + permanent badge', () => {
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

  it('shows the promotion headline and the Blurry badge at the degree-2 boundary', async () => {
    boundaryAt(2);
    renderPage();

    expect(await screen.findByText("You've compared everything at this level")).toBeTruthy();
    expect(screen.getByText('Blurry')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause here' })).toBeTruthy();
  });

  it('shows the Clear badge at the degree-3 boundary and the Sharp badge at the degree-4 boundary', async () => {
    boundaryAt(3);
    const { unmount } = renderPage();
    await screen.findByText("You've compared everything at this level");
    expect(screen.getByText('Clear')).toBeTruthy();
    unmount();

    boundaryAt(4);
    renderPage();
    await screen.findByText("You've compared everything at this level");
    expect(screen.getByText('Sharp')).toBeTruthy();
  });

  // The 2026-08-26 rewrite made degree 5 show its own checkpoint, reversing the previous
  // "silent, tier doesn't change" rule — a badge that's honestly still Sharp is not noise once
  // the badge is permanently visible everywhere else. Both 4 and 5 use identical "ceiling" copy.
  it('shows a checkpoint at the degree-5 boundary too, with the same Sharp badge and ceiling copy as degree 4', async () => {
    boundaryAt(4);
    const { unmount } = renderPage();
    await screen.findByText("You've compared everything at this level");
    const degree4Body = screen.getByText(/Continuing still sharpens that number/).textContent;
    unmount();

    boundaryAt(5);
    renderPage();
    await screen.findByText("You've compared everything at this level");
    expect(screen.getByText('Sharp')).toBeTruthy();
    const degree5Body = screen.getByText(/Continuing still sharpens that number/).textContent;
    expect(degree5Body).toEqual(degree4Body);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('the header shows the tier and the accuracy percentage as separate values', async () => {
    accuracyValue = VERY_HIGH;
    actionForDegree = () => ASK_AT_DEGREE(2);
    renderPage();

    // Degree 2 still in progress — the base rung, regardless of a 90% accuracy reading.
    expect(await screen.findByText(/Detail: Unfocused/)).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
  });

  it('assigns the badge from the degree, ignoring accuracy entirely', async () => {
    accuracyValue = VERY_HIGH;
    boundaryAt(2);
    renderPage();

    await screen.findByText("You've compared everything at this level");
    expect(screen.getByText('Blurry')).toBeTruthy();
    // The number is still reported, attached to an explicit subject, never bare.
    expect(screen.getByText(/you're 90% clear on what matters most to you/)).toBeTruthy();
  });

  it('"Continue" moves to the next degree and does not re-show the checkpoint', async () => {
    boundaryAt(2);
    renderPage();

    await screen.findByText("You've compared everything at this level");
    await clickButton('Continue');

    expect(screen.queryByText("You've compared everything at this level")).toBeNull();
    expect(screen.getByText(/Now comparing 3 criteria at once\./)).toBeTruthy();
  });

  it('shows the terminal screen when no degree is left to escalate to, with a single button', async () => {
    boundaryAt(6, false);
    renderPage();

    expect(await screen.findByText("You've compared everything, at every level")).toBeTruthy();
    expect(screen.getByText('Sharp')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done, evaluate albums' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause here' })).toBeNull();
  });

  // Unchanged constraint, still load-bearing: whether these preference shapes reflect genuine
  // under-information or a blind spot in the metric is an open question (deferred-work.md), so
  // the copy must not answer it in either direction.
  it('terminal copy blames neither the user nor the metric (the open question stays open)', async () => {
    boundaryAt(6, false);
    renderPage();

    await screen.findByText("You've compared everything, at every level");
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/inconsist|contradict|conflict|unreliable|couldn.t determine/i);
    expect(text).not.toMatch(/limitation|failed|unable to measure/i);
  });

  it("a session resumed onto a boundary shows that boundary's checkpoint, and is never stranded", async () => {
    boundaryAt(3);
    renderPage();

    await screen.findByText("You've compared everything at this level");
    expect(screen.getByText('Clear')).toBeTruthy();
    await clickButton('Continue');
    expect(screen.getByText(/4 criteria this time\./)).toBeTruthy();
  });

  // The copy constraint carried over from the pre-rewrite tests: degree-tying did NOT fix the
  // recalibration report's #4/#8 inversion, so no screen may present the badge as a statement
  // about ranking quality. Loops over every degree that now shows a screen, including the
  // newly-added degree 5.
  it('no checkpoint screen claims the badge says anything about ranking quality', async () => {
    for (const degree of [2, 3, 4, 5]) {
      boundaryAt(degree);
      const { unmount } = renderPage();
      await screen.findByText("You've compared everything at this level");
      const text = document.body.textContent ?? '';
      expect(text).not.toMatch(/rank/i);
      expect(text).not.toMatch(/reliable|trustworthy|confiden/i);
      expect(text).not.toMatch(/accurate/i);
      unmount();
    }
  });

  // Rule 2 from the copy rewrite: "label" never appears as a noun in body text — only as the
  // badge itself, which is a single word (Unfocused/Blurry/Clear/Sharp), not a sentence.
  it('never uses the word "label" as a noun anywhere on a checkpoint screen', async () => {
    for (const degree of [2, 3, 4, 5]) {
      boundaryAt(degree);
      const { unmount } = renderPage();
      await screen.findByText("You've compared everything at this level");
      const text = document.body.textContent ?? '';
      expect(text).not.toMatch(/\blabels?\b/i);
      unmount();
    }
  });

  it('shows the permanent tier badge with its info tooltip', async () => {
    boundaryAt(2);
    renderPage();

    await screen.findByText("You've compared everything at this level");
    const info = screen.getByLabelText(
      /Unfocused, Blurry, Clear, Sharp\. Each one means a deeper level of comparison finished\./
    );
    expect(info).toBeTruthy();
  });

  // The freeze checkpoint's own trigger logic lives on a separate branch
  // (criteria-calibration-freeze-checkpoint) and isn't wired up here — but its documented
  // consequence (choosing to continue from degree 2 without ever completing it) is fully
  // reproducible today by resuming a session AT degree 3 with no acknowledged degree-2
  // boundary, which is exactly what that branch's "Continue" button will produce. Verifies the
  // badge jumps Unfocused -> Clear, never rendering Blurry, and that the promotion headline
  // doesn't say anything false about the skipped level.
  it('skips the Blurry badge entirely when degree 2 was never completed (the freeze-then-continue path)', async () => {
    boundaryAt(3);
    renderPage();

    await screen.findByText("You've compared everything at this level");
    expect(screen.getByText('Clear')).toBeTruthy();
    expect(screen.queryByText('Blurry')).toBeNull();
    // The headline never names a specific previous level, so it can't misrepresent one that was
    // never actually finished.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/2-criteria|two.criteria|level 2/i);
  });

  it('navigates to the ?from= destination when the user chooses to pause', async () => {
    boundaryAt(2);
    render(
      <ChakraProvider value={system}>
        <MemoryRouter initialEntries={['/calibrate?from=favorites']}>
          <CriteriaCalibrationPage />
        </MemoryRouter>
      </ChakraProvider>
    );

    await screen.findByText("You've compared everything at this level");
    await clickButton('Pause here');
    expect(mockNavigate).toHaveBeenCalledWith('/favorites');
  });
});
