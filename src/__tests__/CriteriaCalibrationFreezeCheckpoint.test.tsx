// @vitest-environment jsdom
//
// Integration coverage for the freeze checkpoint (criteria-calibration-freeze-checkpoint,
// Step 2) — the fifth checkpoint, shown while degree 2 is NOT exhausted (the driver keeps
// reporting `ask`, the candidate pool is non-empty per
// criteria-calibration-freeze-checkpoint-step1-pool-check.md) but the session has given
// DEGREE_2_FREEZE_ANSWER_THRESHOLD (78) answers at degree 2 without resolving.
//
// UNLIKE CriteriaCalibrationCheckpoints.test.tsx, this file does NOT mock `nextAction` or
// `computeScoreSpreadAccuracy`. This is the "live simulated" verification the freeze-checkpoint
// brief asked for: the full real driver (nextAction, CalibrationSession, solveValues,
// computeScoreSpreadAccuracy) runs against a REAL 78-round answer log for the `#2
// single-dominant` oracle shape — the same ground truth used in
// scripts/freeze-checkpoint-pool-recon-2026-08-25.ts and degree-tier-recon-2026-08-18.ts,
// confirmed in Step 1 to never reach coverage-complete at degree 2. The 78-round sequence is
// generated once, at module load, by replaying the real driver exactly as those scripts do —
// not fabricated — so the seeded resume answers are indistinguishable from a real session's.
//
// Only the hooks and persistence layer are mocked (same as the other checkpoint test file):
// useCriteriaCatalog, useCalibrationResume (used to SEED the 77/78-answer prefix, replacing a
// real Supabase fetch), usePendingWritesGuard, useFeedbackToast, useReducedMotion, auth,
// supabase client, and the persistence write functions. Everything about what happens once the
// page has that answer log is real.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import system from '../theme';
import { CriteriaCalibrationPage } from '../CriteriaCalibrationPage';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import { CalibrationSession } from '../lib/criteria-calibration/calibrationSession';
import { nextAction } from '../lib/criteria-calibration/elicitationDriver';
import { DEGREE_2_FREEZE_ANSWER_THRESHOLD } from '../lib/criteria-calibration/degreeTiers';
import type { ComparisonResult, Profile } from '../lib/criteria-calibration/preferenceGraph';
import type { ResumedAnswer } from '../hooks/useCalibrationResume';

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
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];
const FIXTURE_CATALOG: CriteriaCatalog = {
  entries: CRITERION_NAMES.map((name, index) => ({ index, name, levels: buildLevels() })),
  levelsPerCriterion: LEVELS_PER_CRITERION,
};

// ---------------------------------------------------------------------------------------
// The #2 single-dominant ground truth — copied verbatim (same constants, same construction)
// from scripts/degree-tier-recon-2026-08-18.ts / freeze-checkpoint-pool-recon-2026-08-25.ts,
// which both replicate scripts/synthetic-calibration-oracles-2026-08-16.ts. Confirmed in
// criteria-calibration-freeze-checkpoint-step1-pool-check.md to still have 62 unasked degree-2
// candidates at round 90 (never reaches coverage-complete) — the exact shape this checkpoint
// exists for.
// ---------------------------------------------------------------------------------------
type GroundTruth = number[][];
const LINEAR_SHAPE = [0.25, 0.5, 0.75, 1.0];
const DOMINANT_MAX = [0.7, 0.06, 0.06, 0.06, 0.06, 0.06];

function buildGroundTruth(criterionMax: number[], shape: number[]): GroundTruth {
  return criterionMax.map((max) => {
    const arr = new Array(6).fill(0);
    for (let level = 2; level <= 5; level++) arr[level] = max * shape[level - 2];
    return arr;
  });
}
const SINGLE_DOMINANT_GT = buildGroundTruth(DOMINANT_MAX, LINEAR_SHAPE);

function scoreProfileGT(profile: Profile, gt: GroundTruth): number {
  let total = 0;
  for (const key of Object.keys(profile)) total += gt[Number(key)][profile[Number(key)]];
  return total;
}
function trueAnswer(profileA: Profile, profileB: Profile, gt: GroundTruth): ComparisonResult {
  const a = scoreProfileGT(profileA, gt);
  const b = scoreProfileGT(profileB, gt);
  if (Math.abs(a - b) < 1e-12) return 'equal';
  return a > b ? 'A' : 'B';
}

/** Replays the REAL driver for `rounds` degree-2 answers against the single-dominant ground
 *  truth, returning the resulting answer log in ResumedAnswer shape. Fails loudly (rather than
 *  silently returning a shorter log) if the driver ever reports degree 2 exhausted within
 *  `rounds` answers — that would mean Step 1's finding (pool non-empty at round 90) no longer
 *  holds and this test's whole premise needs re-checking, not a quiet truncation. */
function buildSingleDominantDegree2Log(rounds: number): ResumedAnswer[] {
  const session = new CalibrationSession();
  const log: ResumedAnswer[] = [];
  for (let round = 0; round < rounds; round++) {
    const action = nextAction(session, LEVELS_PER_CRITERION, 2);
    if (action.type !== 'ask') {
      throw new Error(
        `Test premise broken: driver reported '${action.type}' at answer ${round + 1}, ` +
          `expected 'ask' for all ${rounds} rounds (single-dominant should not reach ` +
          `coverage-complete this early — see criteria-calibration-freeze-checkpoint-step1-pool-check.md).`
      );
    }
    const result = trueAnswer(action.profileA, action.profileB, SINGLE_DOMINANT_GT);
    session.recordAnswer(action.profileA, action.profileB, result);
    log.push({
      localId: `local-${round}`,
      dbId: `db-${round}`,
      profileA: action.profileA,
      profileB: action.profileB,
      result,
    });
  }
  return log;
}

// Generated once — 78 answers is the exact threshold, so the 77-answer prefix (one short of
// freezing) is just this array's first 77 entries, not a separately-generated sequence. That
// makes the boundary assertion exact: same trajectory, one fewer answer, nothing else differs.
let FULL_LOG: ResumedAnswer[];
beforeAll(() => {
  FULL_LOG = buildSingleDominantDegree2Log(DEGREE_2_FREEZE_ANSWER_THRESHOLD);
});

function renderWithAnswers(answers: ResumedAnswer[]) {
  vi.mocked(useCalibrationResume).mockReturnValue({
    answers,
    degree: 2,
    loading: false,
    error: null,
  });
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

// The page shows two different percentages side by side in the header (the segmented progress
// ring's own value, and AccuracyStatus's separate accuracy reading right next to "Detail: ...")
// — both match a bare /^\d+%$/. Scoped to AccuracyStatus's own row (the parent of its "Detail:"
// text) so this reads the accuracy percentage specifically, not the ring's.
function getAccuracyPercentText(): string {
  const detailText = screen.getByText(/Detail:/);
  return within(detailText.parentElement!).getByText(/^\d+%$/).textContent ?? '';
}

describe('CriteriaCalibrationPage — freeze checkpoint (live, real driver)', () => {
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
  });

  // The exact-boundary assertion: 77 answers (one short of the threshold) must show a real
  // question, not the freeze checkpoint. Confirms this isn't just "eventually appears" but
  // fires at exactly the documented threshold and not a single answer earlier.
  it('does NOT show the freeze checkpoint at 77 answers, one short of the threshold', async () => {
    renderWithAnswers(FULL_LOG.slice(0, DEGREE_2_FREEZE_ANSWER_THRESHOLD - 1));

    await screen.findByText('Which of these 2 alternatives do you prefer?');
    expect(screen.queryByText('Your answers have stopped narrowing this down')).toBeNull();
  }, 20000);

  it('shows the freeze checkpoint at exactly 78 answers, with the Unfocused badge', async () => {
    renderWithAnswers(FULL_LOG);

    expect(
      await screen.findByText('Your answers have stopped narrowing this down')
    ).toBeTruthy();
    // Degree 2 was never actually completed (coverage-complete never fired — that's the whole
    // point of this checkpoint), so the tier must still read the base rung, not a promoted one.
    expect(screen.getByText('Unfocused')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause here' })).toBeTruthy();
  }, 20000);

  // Weights don't reset: computeScoreSpreadAccuracy is NOT mocked in this file, so the
  // percentage shown is the real solver's output against the real 78-answer log. If continuing
  // to degree 3 silently reset or discarded that log, this number would change (typically drop
  // toward 0) the instant "Continue" is clicked, since nothing else changes about the answer
  // log in that click. Asserting it stays IDENTICAL is a direct behavioral proof, not an
  // inference from reading the source.
  it('keeps the accuracy percentage identical across "Continue" (weights are not reset)', async () => {
    renderWithAnswers(FULL_LOG);
    await screen.findByText('Your answers have stopped narrowing this down');

    const percentBefore = getAccuracyPercentText();
    expect(percentBefore).toMatch(/^\d+%$/);

    await clickButton('Continue');

    // The freeze checkpoint is gone (degree is now 3, no longer frozen at 2), replaced by a
    // real degree-3 question or, on the rare chance degree 3 happens to be exhausted for this
    // exact log, its own checkpoint — either way the SAME percentage must still be showing,
    // since the answer log itself did not change.
    await screen.findByText('Now comparing 3 criteria at once.');
    expect(getAccuracyPercentText()).toBe(percentBefore);
  }, 20000);

  // The label-promotion rule (criteria-calibration-checkpoint-copy-rewrite's skip-Blurry case,
  // now exercised end to end with the real driver instead of a mocked boundary): degree 2 was
  // never marked complete, so moving to degree 3 must NOT retroactively show Blurry at any
  // point, including immediately after clicking Continue.
  it('never shows the Blurry badge after continuing past the freeze (degree 2 was never actually completed)', async () => {
    renderWithAnswers(FULL_LOG);
    await screen.findByText('Your answers have stopped narrowing this down');
    await clickButton('Continue');

    await screen.findByText('Now comparing 3 criteria at once.');
    expect(screen.queryByText('Blurry')).toBeNull();
  }, 20000);

  it('"Pause here" from the freeze checkpoint navigates to the ?from= destination', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: FULL_LOG,
      degree: 2,
      loading: false,
      error: null,
    });
    render(
      <ChakraProvider value={system}>
        <MemoryRouter initialEntries={['/calibrate?from=favorites']}>
          <CriteriaCalibrationPage />
        </MemoryRouter>
      </ChakraProvider>
    );
    await screen.findByText('Your answers have stopped narrowing this down');
    await clickButton('Pause here');
    expect(mockNavigate).toHaveBeenCalledWith('/favorites');
  }, 20000);
});
