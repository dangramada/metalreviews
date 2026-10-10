// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { AotyHub } from '../AotyHub';
import system from '../theme';

// Counts the table reads the hub makes with the REAL data hooks. On master each route cost 9 reads
// (/aoty read contenders twice: the page's own pool plus the AOTY list re-reading contenders ->
// albums for its members); with the hub and the shared pool it is 8 on either route.
const calls: string[] = [];

const table: Record<string, unknown> = {
  contenders: [
    {
      album_id: 'a',
      albums: {
        id: 'a',
        band: 'Alpha',
        album: 'LP',
        artwork_url: null,
        release_date: '2026-03-01',
        genre: [],
        reviews: [],
      },
    },
  ],
  aoty: [{ album_id: 'a', created_at: '2026-10-01' }],
  // One fully rated album (6 criteria), so the summary's follow-up `albums` read happens too.
  album_criteria_ratings: [1, 2, 3, 4, 5, 6].map((c) => ({
    album_id: 'a',
    criterion_id: c,
    level: 2,
  })),
  user_criterion_weights: [{ criterion_id: 1, level: 2, value: 1 }],
  albums: [{ id: 'a', release_date: '2026-03-01' }],
  user_calibration_status: { tier: 'high', answer_count: 5 },
  user_calibration_answers: [],
};

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (name: string) => {
      calls.push(name);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ['select', 'order', 'eq', 'in', 'limit']) chain[m] = self;
      chain.maybeSingle = () => Promise.resolve({ data: table[name], error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: Array.isArray(table[name]) ? table[name] : [],
          error: null,
          count: 5,
        });
      return chain;
    },
  },
}));
// A stable user reference: the real hooks re-run their effects when it changes.
const mockAuth = { user: { id: 'user-abc', email: 'dan@test.com' }, loading: false };
vi.mock('../AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showAction: vi.fn() }),
}));
vi.mock('../components/AddToContendersPicker', () => ({ AddToContendersPicker: () => null }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ChakraProvider value={system}>
    <MemoryRouter>{children}</MemoryRouter>
  </ChakraProvider>
);

const tally = () =>
  calls.reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});

describe('AotyHub reads', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it.each(['aoty', 'contenders'] as const)('reads each source once on /%s: 8 reads', async (s) => {
    render(<AotyHub screen={s} />, { wrapper });
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(8), { timeout: 1500 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(tally()).toEqual({
      contenders: 1,
      aoty: 1,
      album_criteria_ratings: 1,
      // One for the ratings summary, one for the calibration gate.
      user_criterion_weights: 2,
      albums: 1,
      user_calibration_status: 1,
      user_calibration_answers: 1,
    });
    expect(calls).toHaveLength(8);
    expect(
      screen.getByRole('heading', { name: s === 'aoty' ? 'AOTY' : 'Contenders' })
    ).toBeTruthy();
  });
});
