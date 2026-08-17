// @vitest-environment jsdom
//
// Regression coverage for the cross-degree Undo/Redo stale-`degree` bug (diagnosed
// 2026-08-15, see docs/decisions/criteria-calibration/criteria-calibration-second-session-reset.md):
// `degree` was a plain forward-only useState, never re-derived when Undo/Redo crossed a
// degree boundary, so `nextAction` kept running against a stale degree until a page refresh.
// This test seeds a resumed session that's already up at degree 4 (via buildHistoricalFixture,
// the same real degree-ramp fixture preferenceGraph.test.ts uses), then drives real Undo/Redo
// clicks across the degree 3/4 boundary and asserts the rendered question's criteria count
// (i.e. its degree) updates correctly in both directions, with no remount/refresh involved.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
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
// Reduced-motion path skips the fade choreography entirely — irrelevant here since this test
// only exercises Undo/Redo (synchronous, no hold/fade timers either way), but mocking it out
// avoids depending on jsdom's window.matchMedia support.
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
import { usePendingWritesGuard } from '../hooks/usePendingWritesGuard';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useAuth } from '../AuthContext';

// Small catalog matching the fixture's 6-criteria/5-level shape. Level labels are all
// "Level N" deliberately — a rendered comparison card shows exactly one such text node per
// criterion row (CriterionRow.tsx), so counting "Level N" matches on one card is a direct,
// reliable proxy for that card's profile degree, independent of which specific level got
// assigned to which criterion.
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

// buildHistoricalFixture()'s default config produces rounds in ascending-degree blocks: 20 at
// degree 2, 7 at degree 3, 2 at degree 4, 2 at degree 5 (DEFAULT_FIXTURE_CONFIG.roundsByDegree),
// generated against the same 6-criteria/5-level shape as FIXTURE_CATALOG above, and guaranteed
// internally consistent (profileValue-based total order — see fixtures.ts). Slicing to the
// first 29 rounds (20 + 7 + 2) gives a resumed session that's freshly escalated to degree 4
// with exactly 2 degree-4 answers — undoing both crosses back over the 3/4 boundary.
const DEGREE_4_ROUNDS = buildHistoricalFixture().slice(0, 29);
// Sanity-check the slice boundary against DEFAULT_FIXTURE_CONFIG's round counts (rather than
// asserting via `expect` at module scope) — a plain throw here fails fast and legibly if the
// fixture's shape ever changes, instead of silently testing the wrong degree.
if (DEGREE_4_ROUNDS[DEGREE_4_ROUNDS.length - 1].degree !== 4) {
  throw new Error('Fixture slice boundary assumption broke: last round is not degree 4');
}
if (DEGREE_4_ROUNDS[DEGREE_4_ROUNDS.length - 3].degree !== 3) {
  throw new Error(
    'Fixture slice boundary assumption broke: round before the degree-4 pair is not degree 3'
  );
}

const RESUMED_ANSWERS = DEGREE_4_ROUNDS.map((round, i) => ({
  localId: `local-${i}`,
  dbId: `db-${i}`,
  profileA: round.profileA,
  profileB: round.profileB,
  result: round.result,
}));

function countCriteriaOnCard(article: HTMLElement): number {
  return within(article).getAllByText(/^Level \d$/).length;
}

async function clickButton(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('CriteriaCalibrationPage — cross-degree Undo/Redo (regression)', () => {
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

  it('reverts degree on Undo across a degree boundary, and restores it on Redo, without a refresh', async () => {
    renderPage();

    // Resumed straight into degree 4 — the first rendered comparison should show 4 criteria
    // per card.
    let articles = await screen.findAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(countCriteriaOnCard(articles[0])).toBe(4);
    expect(countCriteriaOnCard(articles[1])).toBe(4);

    // Undo the first (most recent) of the 2 seeded degree-4 answers — one degree-4 answer
    // still remains, so degree should stay at 4.
    await clickButton('Undo');
    articles = screen.getAllByRole('article');
    expect(countCriteriaOnCard(articles[0])).toBe(4);

    // Undo the second (last remaining) degree-4 answer — this crosses the 3/4 boundary. Pre-fix,
    // `degree` stayed pinned at 4 here and the next question was wrongly still degree-4; the
    // fix re-derives `degree` from the post-pop answer log, so it should now read degree 3.
    await clickButton('Undo');
    articles = screen.getAllByRole('article');
    expect(countCriteriaOnCard(articles[0])).toBe(3);
    expect(countCriteriaOnCard(articles[1])).toBe(3);

    // Redo back across the same boundary. Mirrors the Undo fix: without it, `degree` would
    // stay wrongly at 3 even though the answer log is back to including a degree-4 entry.
    await clickButton('Redo');
    articles = screen.getAllByRole('article');
    expect(countCriteriaOnCard(articles[0])).toBe(4);
    expect(countCriteriaOnCard(articles[1])).toBe(4);
  });
});
