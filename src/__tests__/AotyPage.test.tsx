// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { AotyPage } from '../AotyPage';
import system from '../theme';

type Member = {
  albumId: string;
  band: string;
  album: string;
  artworkUrl: null;
  releaseDate: string | null;
  genre: string[];
  publishedAt: null;
  createdAt: string;
};
const member = (albumId: string, band: string, releaseDate: string | null): Member => ({
  albumId,
  band,
  album: `${band} LP`,
  artworkUrl: null,
  releaseDate,
  genre: [],
  publishedAt: null,
  createdAt: '2026-01-01',
});

let mockItems: Member[] = [];
const mockRefetch = vi.fn();
vi.mock('../hooks/useAotyList', () => ({
  useAotyList: () => ({ items: mockItems, loading: false, error: null, refetch: mockRefetch }),
}));

let stubTier: 'none' | 'medium' | 'high' | 'very_high' = 'high';
let stubInsufficient = false;
vi.mock('../hooks/useCalibrationGate', () => ({
  useCalibrationGate: () => ({
    tier: stubTier,
    hasWeights: true,
    hasInsufficientData: stubInsufficient,
    loading: false,
  }),
  confidenceLabel: (t: string) => t,
}));

let mockSummary = new Map<
  string,
  { score: number; rank: number; contributions: Map<number, number> }
>();
vi.mock('../hooks/useAlbumRatingsSummary', () => ({
  useAlbumRatingsSummary: () => ({ summary: mockSummary, criterionOrder: [0], loading: false }),
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-abc' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showAction: vi.fn() }),
}));
vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn() } }));
import { supabase } from '../supabaseClient';

const sum = (score: number) => ({ score, rank: 1, contributions: new Map<number, number>() });

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('AotyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItems = [];
    mockSummary = new Map();
    stubTier = 'high';
    stubInsufficient = false;
  });

  it('shows the empty state with a way back to Contenders', () => {
    render(<AotyPage />, { wrapper });
    expect(screen.getByText('No AOTY picks yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contenders →' })).toBeInTheDocument();
  });

  it('ranks the default (latest) year and labels ranks for screen readers', () => {
    mockItems = [member('a', 'Aaa', '2026-01-01'), member('b', 'Bbb', '2026-01-01')];
    mockSummary = new Map([
      ['a', sum(0.4)],
      ['b', sum(0.9)],
    ]);
    render(<AotyPage />, { wrapper });
    expect(screen.getAllByLabelText('Rank 1').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Rank 2').length).toBeGreaterThan(0);
  });

  it('shows no year selector for a single year and a selector for several', () => {
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    mockSummary = new Map([['a', sum(0.4)]]);
    const { unmount } = render(<AotyPage />, { wrapper });
    expect(screen.queryByRole('group', { name: 'Year' })).toBeNull();
    unmount();

    mockItems = [member('a', 'Aaa', '2026-01-01'), member('b', 'Bbb', '2025-01-01')];
    mockSummary = new Map([
      ['a', sum(0.4)],
      ['b', sum(0.9)],
    ]);
    render(<AotyPage />, { wrapper });
    expect(screen.getByRole('group', { name: 'Year' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    expect(screen.getByRole('button', { name: '2025' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the Alert and no rank numbers at tier none', () => {
    stubTier = 'none';
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    mockSummary = new Map([['a', sum(0.4)]]);
    render(<AotyPage />, { wrapper });
    expect(screen.getByText(/Score level/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Rank \d/)).toBeNull();
  });

  it('shows no banner and no badge when tier is above none', () => {
    render(<AotyPage />, { wrapper });
    expect(screen.queryByText(/Score level/)).toBeNull();
    expect(screen.queryByRole('img', { name: /percent of your weighting/ })).toBeNull();
  });

  it('keeps a member with no release year under its own heading', () => {
    mockItems = [member('x', 'Xxx', null)];
    render(<AotyPage />, { wrapper });
    expect(screen.getByText('No release year')).toBeInTheDocument();
    expect(screen.getAllByText(/Xxx/).length).toBeGreaterThan(0);
  });

  it('removes only the aoty row', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: secondEq }) });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as unknown as ReturnType<
      typeof supabase.from
    >);
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    mockSummary = new Map([['a', sum(0.4)]]);
    render(<AotyPage />, { wrapper });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from AOTY' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('aoty'));
    expect(supabase.from).not.toHaveBeenCalledWith('contenders');
    expect(mockRefetch).toHaveBeenCalled();
  });
});
