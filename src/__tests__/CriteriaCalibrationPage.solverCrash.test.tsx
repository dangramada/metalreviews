// @vitest-environment jsdom
//
// Regression coverage for the solver-crash safety net (2026-08-16). Before it, a numerical
// breakdown in the LP solver did this: the throw escaped commitAdvance's setTimeout, React
// still flushed the already-scheduled setAnswers, the `action` memo re-threw during render,
// and with no ErrorBoundary anywhere the root unmounted — verified live, `container.innerHTML`
// went to 0 — while the triggering answer had ALREADY been inserted into Supabase, so every
// reload reproduced it. Full trace:
// docs/decisions/criteria-calibration/criteria-calibration-near-singular-pivot-impact.md.
//
// Uses SOLVER_CRASH_ANSWERS (see fixtures.ts) — a real 44-answer log produced by the
// production elicitation driver itself, which throws at n=44 and solves at n=43.
// solverCrashFixture.test.ts pins both of those properties independently.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import system from '../theme';
import { CriteriaCalibrationPage } from '../CriteriaCalibrationPage';
import {
  SOLVER_CRASH_ANSWERS,
  SOLVER_CRASH_DEGREE,
  SOLVER_CRASH_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import { INITIAL_PERSISTED_STABILITY_WINDOW } from '../lib/criteria-calibration/rankingStabilitySignal';

vi.mock('../hooks/useCriteriaCatalog', () => ({ useCriteriaCatalog: vi.fn() }));
vi.mock('../hooks/useCalibrationResume', () => ({ useCalibrationResume: vi.fn() }));
vi.mock('../hooks/useRankingTestSetRatings', () => ({ useRankingTestSetRatings: vi.fn() }));
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

import { useCriteriaCatalog } from '../hooks/useCriteriaCatalog';
import { useCalibrationResume } from '../hooks/useCalibrationResume';
import { useRankingTestSetRatings } from '../hooks/useRankingTestSetRatings';
import { usePendingWritesGuard } from '../hooks/usePendingWritesGuard';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useAuth } from '../AuthContext';
import { insertAnswer, deleteAnswer, upsertWeightsAndStatus } from '../lib/criteria-calibration/persistence';

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
  levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
};

// The last answer in the fixture is the one that tips the solver over. Seeding everything
// before it gives a healthy n=43 session sitting on exactly the question whose answer breaks.
const HEALTHY_PREFIX = SOLVER_CRASH_ANSWERS.slice(0, -1);

function seed(rounds: typeof SOLVER_CRASH_ANSWERS) {
  return rounds.map((r, i) => ({
    localId: `local-${i}`,
    dbId: `db-${i}`,
    profileA: r.profileA,
    profileB: r.profileB,
    result: r.result,
  }));
}

const showError = vi.fn();

function mockResume(rounds: typeof SOLVER_CRASH_ANSWERS) {
  vi.mocked(useCalibrationResume).mockReturnValue({
    answers: seed(rounds),
    degree: SOLVER_CRASH_DEGREE,
    persistedStabilityWindow: INITIAL_PERSISTED_STABILITY_WINDOW,
    loading: false,
    error: null,
  });
}

function renderPage() {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <CriteriaCalibrationPage />
      </MemoryRouter>
    </ChakraProvider>
  );
}

describe('CriteriaCalibrationPage — solver-crash safety net', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCriteriaCatalog).mockReturnValue({
      catalog: FIXTURE_CATALOG,
      loading: false,
      error: null,
    });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
    } as ReturnType<typeof useAuth>);
    vi.mocked(useRankingTestSetRatings).mockReturnValue({
      ratingsByAlbum: null,
      loading: false,
    } as ReturnType<typeof useRankingTestSetRatings>);
    vi.mocked(usePendingWritesGuard).mockReturnValue({
      beginWrite: vi.fn(),
      endWrite: vi.fn(),
      hasPendingWrites: false,
    });
    vi.mocked(useFeedbackToast).mockReturnValue({
      showSuccess: vi.fn(),
      showError,
      showAction: vi.fn(),
    } as unknown as ReturnType<typeof useFeedbackToast>);
    // The failures under test are expected and deliberately logged by the page.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('a comparison that breaks the solver leaves the page usable and saves nothing', async () => {
    mockResume(HEALTHY_PREFIX);
    const { container } = renderPage();
    await screen.findAllByRole('article');

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /About equal/i }));
    });
    await act(async () => {
      vi.runAllTimers();
    });
    vi.useRealTimers();

    // The whole point: the page is still here. Pre-fix this was an unmounted root (0 bytes).
    expect(container.innerHTML.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('article')).toHaveLength(2);

    // Compute-first — nothing was written, so there's no persisted answer left without
    // matching weights/status, and nothing to roll back.
    expect(insertAnswer).not.toHaveBeenCalled();
    expect(upsertWeightsAndStatus).not.toHaveBeenCalled();
    expect(deleteAnswer).not.toHaveBeenCalled();

    // Round counter unchanged: 43 answers seeded => still asking question 44.
    expect(screen.getByText(`Round ${HEALTHY_PREFIX.length + 1}`)).toBeTruthy();

    // And the user is told why, rather than silently reverted.
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('calculation issue'));
  });

  it('a resumed session whose saved log breaks the solver auto-recovers to the last good state', async () => {
    mockResume(SOLVER_CRASH_ANSWERS);
    const { container } = renderPage();

    // Pre-fix this threw during mount and rendered nothing at all.
    expect(container.innerHTML.length).toBeGreaterThan(0);

    // The recovery effect trims the trailing answer and deletes its row, leaving a session
    // that renders a real question again.
    const articles = await screen.findAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(deleteAnswer).toHaveBeenCalledWith(`db-${SOLVER_CRASH_ANSWERS.length - 1}`);
    expect(deleteAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByText(`Round ${SOLVER_CRASH_ANSWERS.length}`)).toBeTruthy();
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('remove your most recent answer'));

    // Recovery re-syncs the persisted weights/status with the trimmed log, rather than
    // leaving the DB describing an answer count that no longer exists.
    expect(upsertWeightsAndStatus).toHaveBeenCalled();
  });

  it('undo still works normally when the resulting state solves fine', async () => {
    mockResume(HEALTHY_PREFIX);
    renderPage();
    await screen.findAllByRole('article');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });

    expect(deleteAnswer).toHaveBeenCalledWith(`db-${HEALTHY_PREFIX.length - 1}`);
    expect(screen.getByText(`Round ${HEALTHY_PREFIX.length}`)).toBeTruthy();
    expect(showError).not.toHaveBeenCalled();
  });
});
