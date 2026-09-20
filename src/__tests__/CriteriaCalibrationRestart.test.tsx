// @vitest-environment jsdom
//
// Regression coverage for the Restart stale-status bug (diagnosed 2026-09-20, see
// docs/decisions/criteria-calibration/criteria-calibration-insufficient-data-state.md's
// "urgent follow-up" section): handleRestart's own status write (via applyCommitComputation's
// upsertWeightsAndStatus, carrying the OLD session's tier at p_answer_count: 0) is rejected by
// the guarded upsert_calibration_status RPC in the mature-session case, so nothing ever zeroed
// user_calibration_status out — Restart looked like it worked (the answer log really was
// cleared) while the stored tier/answer_count stayed pinned to the old session indefinitely.
//
// This drives a REAL Restart click (confirm dialog included) against a resumed, mature session
// and asserts two things a narrower unit test on persistence.ts alone couldn't: (1)
// resetCalibrationStatus is actually reached from the real handler, and (2) it lands strictly
// AFTER the stale-tier upsertWeightsAndStatus write resolves — the ordering the fix depends on,
// per resetCalibrationStatus's own "CALLER MUST SEQUENCE" comment. Reusing
// upsertWeightsAndStatus's mock to resolve on a delay (not immediately) is what makes a
// same-tick-races-first bug actually observable here; resolving both mocks synchronously would
// pass even with the two calls in the wrong order.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, within, act, fireEvent, waitFor } from '@testing-library/react';
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
const deleteAllAnswersMock = vi.fn().mockImplementation(async () => {
  callOrder.push('deleteAllAnswers');
});
// Resolves on a real microtask delay, not synchronously — see the file header on why this
// matters for the ordering assertion.
const upsertWeightsAndStatusMock = vi.fn().mockImplementation(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  callOrder.push('upsertWeightsAndStatus (stale tier)');
});
const resetCalibrationStatusMock = vi.fn().mockImplementation(async () => {
  callOrder.push('resetCalibrationStatus');
});

vi.mock('../lib/criteria-calibration/persistence', () => ({
  insertAnswer: vi.fn().mockResolvedValue('new-db-id'),
  deleteAnswer: vi.fn().mockResolvedValue(undefined),
  deleteAllAnswers: (...args: unknown[]) => deleteAllAnswersMock(...args),
  resetCalibrationStatus: (...args: unknown[]) => resetCalibrationStatusMock(...args),
  syncCalibrationStatus: vi.fn().mockResolvedValue(undefined),
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

// A mature, 29-round resumed session (same fixture slice as the Undo/Redo regression test) —
// mature enough that the stale-tier write's p_answer_count: 0 would be rejected by the real
// RPC's guard, which is exactly the case that used to leave the row untouched.
const MATURE_ROUNDS = buildHistoricalFixture().slice(0, 29);
const RESUMED_ANSWERS = MATURE_ROUNDS.map((round, i) => ({
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

describe('CriteriaCalibrationPage — Restart resets persisted status', () => {
  beforeEach(() => {
    callOrder.length = 0;
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
      degree: 4,
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

  it('clears both the answer log and the persisted status on Restart, in that order relative to the stale-tier write', async () => {
    renderPage();
    await screen.findAllByRole('article');

    // Opens the confirm dialog, not the reset itself.
    await clickButton('Restart calibration');
    expect(await screen.findByText('Restart calibration?')).toBeInTheDocument();

    // Confirms — this is what fires handleRestart for real.
    await clickButton('Restart');

    await waitFor(() => {
      expect(deleteAllAnswersMock).toHaveBeenCalledWith('user-1');
      expect(resetCalibrationStatusMock).toHaveBeenCalledWith('user-1');
    });

    // The bug this regresses: resetCalibrationStatus landing BEFORE the stale-tier
    // upsertWeightsAndStatus write would let that write's now-permissive guard (answer_count
    // freshly at 0) clobber the reset with the pre-Restart tier. Sequencing matters, not just
    // "both were called".
    const resetIndex = callOrder.indexOf('resetCalibrationStatus');
    const staleWriteIndex = callOrder.indexOf('upsertWeightsAndStatus (stale tier)');
    expect(staleWriteIndex).toBeGreaterThanOrEqual(0);
    expect(resetIndex).toBeGreaterThan(staleWriteIndex);
  });

  it('resumes at degree 2 with zero answers after Restart, not stranded on the old degree', async () => {
    renderPage();
    await screen.findAllByRole('article');

    await clickButton('Restart calibration');
    await screen.findByText('Restart calibration?');
    await clickButton('Restart');

    await waitFor(() => {
      expect(resetCalibrationStatusMock).toHaveBeenCalled();
    });

    // With no answers left, a no-?step= visit lands on the Guide tab (same "brand-new
    // session" landing rule any fresh account gets) — "Start Calibration" is what actually
    // reaches the question screen.
    await screen.findByRole('button', { name: 'Start Calibration' });
    await clickButton('Start Calibration');

    // Round 1 of a fresh session: exactly 2 criteria per card (degree 2), not still 4 — the
    // exact thing a Restart that only cleared the answer log but never the local `degree`
    // state would have gotten wrong.
    const articles = await screen.findAllByRole('article');
    const level1Card = within(articles[0]).getAllByText(/^Level \d$/);
    expect(level1Card.length).toBe(2);
  });
});
