// @vitest-environment jsdom
//
// Coverage for the criteria-calibration-page-redesign IA: the single /calibration route with
// ?step=guide|calibration|results, the persistent Tabs bar (always clickable, no
// forward-blocking), the default landing step, and the two new tabs (GuideTab's criteria
// carousel + "Start Calibration" CTA, ResultsTab's below-grade-2 soft gate).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import system from '../theme';
import { CriteriaCalibrationPage } from '../CriteriaCalibrationPage';
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
vi.mock('../lib/criteria-calibration/persistence', () => ({
  insertAnswer: vi.fn().mockResolvedValue('new-db-id'),
  deleteAnswer: vi.fn().mockResolvedValue(undefined),
  deleteAllAnswers: vi.fn().mockResolvedValue(undefined),
  resetCalibrationStatus: vi.fn().mockResolvedValue(undefined),
  upsertWeightsAndStatus: vi.fn().mockResolvedValue(undefined),
  upsertCalibrationStatus: vi.fn().mockResolvedValue(undefined),
}));

import { useCriteriaCatalog } from '../hooks/useCriteriaCatalog';
import { useCalibrationResume } from '../hooks/useCalibrationResume';
import { usePendingWritesGuard } from '../hooks/usePendingWritesGuard';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useAuth } from '../AuthContext';

const CRITERION_NAMES = [
  'Innovation',
  'Emotional impact',
  'Performance',
  'Coherence',
  'Production',
  'Songwriting',
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

function renderAt(path: string) {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter initialEntries={[path]}>
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

describe('CriteriaCalibrationPage — tabs, Guide, Results', () => {
  beforeEach(() => {
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

  it('a brand-new session (no ?step=, no answers) lands on the Guide tab, not Calibration', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 2,
      loading: false,
      error: null,
    });
    renderAt('/calibrate');

    expect(await screen.findByRole('button', { name: 'Start Calibration' })).toBeTruthy();
    // Every criterion's name appears once as a carousel card heading (desktop + mobile
    // carousels are both mounted, CSS-hidden per breakpoint — jsdom doesn't apply @media
    // hides, so both render, hence getAllByText rather than getByText).
    expect(screen.getAllByText('Innovation').length).toBeGreaterThan(0);
    // No badge yet — round 0, nothing calibrated (brief §5).
    expect(
      screen.queryByRole('img', { name: /tier\. \d+ percent of your weighting settled\./ })
    ).toBeNull();
  });

  // terminology-and-gate-unification: the resume banner shown on every entry while tier is
  // 'none' — a brand-new session (no answers at all) is squarely inside that condition.
  it('shows the resume banner on a tier-none entry, dismissible per visit', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 2,
      loading: false,
      error: null,
    });
    renderAt('/calibrate');

    expect(await screen.findByText('Pick up where you left off')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByText('Pick up where you left off')).toBeNull();
  });

  it('"Start Calibration" switches to the Calibration tab and shows a real question', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 2,
      loading: false,
      error: null,
    });
    renderAt('/calibrate');

    await screen.findByRole('button', { name: 'Start Calibration' });
    await clickButton('Start Calibration');

    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Round 1')).toBeTruthy();
  });

  it('a resumed session with answers already logged lands on Calibration by default, not Guide', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [
        {
          localId: 'seed-1',
          dbId: 'db-1',
          profileA: { 0: 5, 1: 1 },
          profileB: { 0: 1, 1: 5 },
          result: 'A',
        },
      ],
      degree: 2,
      loading: false,
      error: null,
    });
    renderAt('/calibrate');

    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Start Calibration' })).toBeNull();
  });

  it('the Your Taste tab is clickable with zero answers and shows the below-grade-2 soft gate, not a forward-block', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [],
      degree: 2,
      loading: false,
      error: null,
    });
    renderAt('/calibrate?step=guide');

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Your Taste' }));
    });
    expect(await screen.findByText(/Nothing's taken shape yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to Calibration' })).toBeTruthy();
  });

  it('the Guide tab is reachable at any time via the tab bar, even mid-session (no forward-blocking)', async () => {
    vi.mocked(useCalibrationResume).mockReturnValue({
      answers: [
        {
          localId: 'seed-1',
          dbId: 'db-1',
          profileA: { 0: 5, 1: 1 },
          profileB: { 0: 1, 1: 5 },
          result: 'A',
        },
      ],
      degree: 2,
      loading: false,
      error: null,
    });
    renderAt('/calibrate?step=calibration');

    await screen.findAllByRole('article');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Guide' }));
    });
    expect(await screen.findByRole('button', { name: 'Start Calibration' })).toBeTruthy();
  });
});
