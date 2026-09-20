// @vitest-environment jsdom
//
// Regression coverage for the Undo-triggered false hasInsufficientData bug (same day as the
// Restart status-reset fix, see
// docs/decisions/criteria-calibration/criteria-calibration-insufficient-data-state.md): Undo's
// own status write (via applyCommitComputation's upsertWeightsAndStatus, carrying the PRE-undo
// tierRef.current at the POST-undo, lower answer_count) is rejected by the guarded
// upsert_calibration_status RPC — its guard is `>=`, and Undo is the one action that always
// decreases the count. Left unfixed, user_calibration_status.answer_count stays one commit
// higher than the real, post-undo user_calibration_answers count after EVERY Undo, which trips
// useCalibrationGate's `hasInsufficientData` (`live < persisted`) on a normal, frequent
// calibration action — not just after Restart.
//
// This drives a REAL Undo click against a resumed session and asserts two things a narrower
// unit test on persistence.ts alone couldn't: (1) syncCalibrationStatus is actually reached
// from the real handler with the correct post-undo answer count, and (2) it lands strictly
// AFTER the stale-tier upsertWeightsAndStatus write resolves — same ordering discipline as
// CriteriaCalibrationRestart.test.tsx, and the same reason: resolving both mocks synchronously
// would let a same-tick reordering bug pass.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import system from '../theme';
import { CriteriaCalibrationPage } from '../CriteriaCalibrationPage';
import { buildHistoricalFixture } from '../lib/criteria-calibration/fixtures';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';

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

const callOrder: string[] = [];
const deleteAnswerMock = vi.fn().mockImplementation(async () => {
  callOrder.push('deleteAnswer');
});
// Resolves on a real microtask delay, not synchronously — see the file header on why this
// matters for the ordering assertion.
const upsertWeightsAndStatusMock = vi.fn().mockImplementation(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  callOrder.push('upsertWeightsAndStatus (stale tier)');
});
const syncCalibrationStatusMock = vi.fn().mockImplementation(async () => {
  callOrder.push('syncCalibrationStatus');
});

vi.mock('../lib/criteria-calibration/persistence', () => ({
  insertAnswer: vi.fn().mockResolvedValue('new-db-id'),
  deleteAnswer: (...args: unknown[]) => deleteAnswerMock(...args),
  deleteAllAnswers: vi.fn().mockResolvedValue(undefined),
  resetCalibrationStatus: vi.fn().mockResolvedValue(undefined),
  syncCalibrationStatus: (...args: unknown[]) => syncCalibrationStatusMock(...args),
  upsertWeightsAndStatus: (...args: unknown[]) => upsertWeightsAndStatusMock(...args),
  upsertCalibrationStatus: vi.fn().mockResolvedValue(undefined),
}));

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
  entries: CRITERION_NAMES.map((name, index) => ({
    index,
    name,
    description: `${name} description.`,
    levels: buildLevels(),
  })),
  levelsPerCriterion: [5, 5, 5, 5, 5, 5],
};

// A small, resumed degree-2 session — Undo doesn't need a mature/degree-4 session the way the
// Restart regression test did (that mattered there for the RPC guard's rejection threshold; here
// the guard rejects a DECREASE regardless of how mature the session is).
const ROUNDS = buildHistoricalFixture().slice(0, 5);
const RESUMED_ANSWERS = ROUNDS.map((round, i) => ({
  localId: `local-${i}`,
  dbId: `db-${i}`,
  profileA: round.profileA,
  profileB: round.profileB,
  result: round.result,
}));

async function clickButton(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('CriteriaCalibrationPage — Undo syncs persisted status', () => {
  beforeEach(() => {
    callOrder.length = 0;
    // Mocks are module-scoped (shared across every test in this file), so a call recorded by
    // one test would otherwise leak into the next — load-bearing for the second test's "not
    // called" assertion, not just tidiness.
    deleteAnswerMock.mockClear();
    upsertWeightsAndStatusMock.mockClear();
    syncCalibrationStatusMock.mockClear();
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
      answers: RESUMED_ANSWERS,
      degree: 2,
      loading: false,
      error: null,
    });
  });

  function renderPage() {
    return render(
      <ChakraProvider value={system}>
        <MemoryRouter>
          <CriteriaCalibrationPage />
        </MemoryRouter>
      </ChakraProvider>
    );
  }

  it('syncs user_calibration_status to the real post-undo answer count, after the stale-tier write settles', async () => {
    renderPage();
    await screen.findAllByRole('article');

    await clickButton('Undo');

    await waitFor(() => {
      expect(deleteAnswerMock).toHaveBeenCalledWith('db-4');
      expect(syncCalibrationStatusMock).toHaveBeenCalled();
    });

    // The resumed session had 5 answers; Undo pops the last one, so the synced count must be
    // exactly 4 — not the stale 5 the guarded RPC's rejected write would have left behind.
    const [, , , answerCount] = syncCalibrationStatusMock.mock.calls[0];
    expect(answerCount).toBe(4);

    // The bug this regresses: syncCalibrationStatus landing BEFORE the stale-tier
    // upsertWeightsAndStatus write would let that write's now-permissive guard (answer_count
    // freshly lowered) clobber the sync with the pre-undo tier. Sequencing matters, not just
    // "both were called".
    const syncIndex = callOrder.indexOf('syncCalibrationStatus');
    const staleWriteIndex = callOrder.indexOf('upsertWeightsAndStatus (stale tier)');
    expect(staleWriteIndex).toBeGreaterThanOrEqual(0);
    expect(syncIndex).toBeGreaterThan(staleWriteIndex);
  });

  it('does not fire the sync when there is nothing to undo', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 2,
      loading: false,
      error: null,
    });
    renderPage();
    // Zero answers lands on the Guide tab (the same "brand-new session" landing rule any
    // fresh account gets) — reach the question screen via "Start Calibration" first.
    await screen.findByRole('button', { name: 'Start Calibration' });
    await clickButton('Start Calibration');
    await screen.findAllByRole('article');

    // Undo is rendered disabled with zero answers — clicking it is a no-op, not a call with
    // meaningless arguments.
    await clickButton('Undo');
    expect(syncCalibrationStatusMock).not.toHaveBeenCalled();
  });
});
