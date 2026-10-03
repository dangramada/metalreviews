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
const mockRemoveLocal = vi.fn();
vi.mock('../hooks/useAotyList', () => ({
  useAotyList: () => ({
    items: mockItems,
    loading: false,
    error: null,
    refetch: mockRefetch,
    removeLocal: mockRemoveLocal,
  }),
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
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showAction: vi.fn(),
  }),
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
    mockRemoveLocal.mockReset();
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
    expect(screen.getAllByText('Rank 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rank 2').length).toBeGreaterThan(0);
    // Visible "#N" is aria-hidden, not the accessible name.
    expect(screen.getAllByText('#1')[0]).toHaveAttribute('aria-hidden', 'true');
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

  it('puts the rank badge before the score badge in the same strip', () => {
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    mockSummary = new Map([['a', sum(0.4)]]);
    render(<AotyPage />, { wrapper });
    const strip = screen.getAllByText('Rank 1')[0].parentElement?.parentElement as HTMLElement;
    const [rankBadge, scoreBadge] = Array.from(strip.children);
    expect(rankBadge.textContent).toContain('Rank 1');
    expect(scoreBadge.textContent).toContain('4.0');
  });

  it('names the score badge "Your Score x.x" once, with the visible number aria-hidden', () => {
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    mockSummary = new Map([['a', sum(0.4)]]);
    render(<AotyPage />, { wrapper });
    expect(screen.getAllByText('Your Score 4.0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('4.0')[0]).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByLabelText('Score 4.0')).toBeNull();
  });

  it('shows the Alert and no rank numbers at tier none', () => {
    stubTier = 'none';
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    mockSummary = new Map([['a', sum(0.4)]]);
    render(<AotyPage />, { wrapper });
    expect(screen.getByText(/Score level/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to calibration' })).toHaveAttribute(
      'href',
      '/calibration?from=aoty'
    );
    expect(screen.queryByText(/^Rank \d/)).toBeNull();
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

  it('Back to Contenders deletes only the aoty row, with no confirm, and offers no remove', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: secondEq }) });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as unknown as ReturnType<
      typeof supabase.from
    >);
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    mockSummary = new Map([['a', sum(0.4)]]);
    render(<AotyPage />, { wrapper });
    expect(screen.queryByRole('button', { name: /Remove from/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Contenders' })[0]);
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('aoty'));
    expect(supabase.from).not.toHaveBeenCalledWith('contenders');
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Moved back to Contenders'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('keeps the row and shows the error toast when the delete fails', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: secondEq }) });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as unknown as ReturnType<
      typeof supabase.from
    >);
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    render(<AotyPage />, { wrapper });
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Contenders' })[0]);
    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Aaa/).length).toBeGreaterThan(0);
  });

  it('moves focus to the next row, else the heading, after Back to Contenders', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: secondEq }) });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as unknown as ReturnType<
      typeof supabase.from
    >);
    mockItems = [member('a', 'Aaa', '2026-01-01'), member('b', 'Bbb', '2026-01-01')];
    mockSummary = new Map([
      ['a', sum(0.9)],
      ['b', sum(0.4)],
    ]);
    const { rerender } = render(<AotyPage />, { wrapper });
    mockRemoveLocal.mockImplementation(() => {
      mockItems = mockItems.filter((i) => i.albumId !== 'a');
      rerender(<AotyPage />);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Contenders' })[0]);
    await waitFor(() => expect(document.activeElement?.getAttribute('data-primary-for')).toBe('b'));
    mockRemoveLocal.mockImplementation(() => {
      mockItems = [];
      rerender(<AotyPage />);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Contenders' })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'AOTY' })).toHaveFocus());
  });

  it('Back to Contenders: double click writes once, busy visible, name and focus kept', async () => {
    const releases: Array<(r: { error: null }) => void> = [];
    const secondEq = vi.fn(() => new Promise((resolve) => releases.push(resolve)));
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: secondEq }) });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as unknown as ReturnType<
      typeof supabase.from
    >);
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    render(<AotyPage />, { wrapper });
    const btn = screen.getAllByRole('button', { name: 'Back to Contenders' })[0];
    btn.focus();
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveFocus();
    expect(secondEq).toHaveBeenCalledTimes(1);
    releases[0]({ error: null });
    await waitFor(() => expect(mockRemoveLocal).toHaveBeenCalledWith(['a']));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('Back to Contenders failure re-enables the control and keeps the row', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: secondEq }) });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as unknown as ReturnType<
      typeof supabase.from
    >);
    mockItems = [member('a', 'Aaa', '2026-01-01')];
    render(<AotyPage />, { wrapper });
    const btn = screen.getAllByRole('button', { name: 'Back to Contenders' })[0];
    fireEvent.click(btn);
    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    await waitFor(() => expect(btn).not.toHaveAttribute('aria-busy'));
    expect(mockRemoveLocal).not.toHaveBeenCalled();
  });
});
