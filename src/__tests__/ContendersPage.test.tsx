// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { ContendersPage } from '../ContendersPage';
import system from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

// ContendersPage's own hook dependencies are mocked directly (rather than the raw supabase
// tables underneath them) — same reasoning FavoritesPage.test.tsx gives for stubbing the
// calibration tables: these hooks' own internals are already covered by their own test files,
// so a ContendersPage test only needs to exercise ContendersPage's own logic.
const mockRefetch = vi.fn();
let mockItems: FavoriteListItem[] = [];
vi.mock('../hooks/useContendersList', () => ({
  useContendersList: () => ({
    items: mockItems,
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

let mockAotyItems: (FavoriteListItem & { createdAt: string })[] = [];
const mockRefetchAoty = vi.fn();
vi.mock('../hooks/useAotyList', () => ({
  useAotyList: () => ({
    items: mockAotyItems,
    loading: false,
    error: null,
    refetch: mockRefetchAoty,
  }),
}));

let stubInsufficient = false;
let stubTier: 'none' | 'medium' | 'high' | 'very_high' = 'high';
let stubHasWeights = true;
vi.mock('../hooks/useCalibrationGate', () => ({
  useCalibrationGate: () => ({
    tier: stubTier,
    hasWeights: stubHasWeights,
    hasInsufficientData: stubInsufficient,
    loading: false,
  }),
  confidenceLabel: (tier: string) => tier,
}));

let mockSummary = new Map<
  string,
  { score: number; rank: number; contributions: Map<number, number> }
>();
vi.mock('../hooks/useAlbumRatingsSummary', () => ({
  useAlbumRatingsSummary: () => ({ summary: mockSummary, loading: false, refetch: vi.fn() }),
}));

vi.mock('../components/AddToContendersPicker', () => ({
  AddToContendersPicker: () => null,
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-abc', email: 'dan@test.com' }, loading: false }),
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

vi.mock('../supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../supabaseClient';

const mockItem: FavoriteListItem = {
  albumId: 'album1',
  band: 'Opeth',
  album: 'Blackwater Park',
  artworkUrl: null,
  releaseDate: '2024-03-16',
  genre: ['progressive metal'],
  publishedAt: null,
};

function makeContendersDeleteChain(error: { message: string } | null = null) {
  const secondEq = vi.fn().mockResolvedValue({ data: null, error });
  const inFn = vi.fn().mockResolvedValue({ data: null, error });
  return {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: secondEq, in: inFn }),
    }),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('ContendersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItems = [mockItem];
    mockAotyItems = [];
    mockSummary = new Map();
    stubInsufficient = false;
    stubTier = 'high';
    stubHasWeights = true;
    vi.mocked(supabase.from).mockImplementation(
      () => makeContendersDeleteChain() as unknown as ReturnType<typeof supabase.from>
    );
  });

  it('shows the shared EmptyState component when there are no contenders', async () => {
    mockItems = [];
    render(<ContendersPage />, { wrapper });
    await waitFor(() => screen.getByText('No contenders yet.'));
    expect(screen.getByText('Score an album, or add one from your favorites.')).toBeInTheDocument();
  });

  it('renders each contender via the shared row component', async () => {
    render(<ContendersPage />, { wrapper });
    // Row component always mounts both its desktop and mobile trees (CSS-toggled, not
    // Chakra's responsive display prop — see FavoriteListItemRow's own comment on why), so
    // jsdom sees the band name twice. Same convention FavoritesPage.test.tsx uses throughout.
    await waitFor(() => expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0));
  });

  it('removes a single row after confirming, and refetches', async () => {
    render(<ContendersPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Contenders' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Opeth – Blackwater Park removed from Contenders'
      )
    );
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the bulk action bar after selecting a row, and bulk-removes on confirm', async () => {
    render(<ContendersPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0));
    // SelectableRow renders one checkbox per row (not duplicated per desktop/mobile tree like
    // the row's own text), so this is singular regardless of viewport.
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
    // Ark's checkbox machine dispatches CHECKED.SET asynchronously — the callback (and the
    // state update it drives) lands a tick after the click, not synchronously within it.
    await waitFor(() => screen.getByText('1 selected'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('1 removed from Contenders'));
  });

  it('toggles selection when the card body is clicked, not just the checkbox', async () => {
    render(<ContendersPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText(/Opeth/)[0]);
    await waitFor(() => screen.getByText('1 selected'));
  });

  it('does not select when the Rate/Listen/Remove row actions are clicked', async () => {
    render(<ContendersPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Contenders' })[0]);
    // The remove-confirm dialog opened instead of anything toggling selection.
    await screen.findByRole('button', { name: 'Remove' });
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('shows the low-confidence banner when calibration tier is none', async () => {
    stubTier = 'none';
    render(<ContendersPage />, { wrapper });
    await waitFor(() => screen.getByText(/Score level: none/));
    expect(screen.getByRole('link', { name: 'Go to calibration' })).toHaveAttribute(
      'href',
      '/calibration?from=contenders'
    );
  });

  it('hides the low-confidence banner at a settled tier', async () => {
    stubTier = 'very_high';
    render(<ContendersPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Score level:/)).not.toBeInTheDocument();
  });

  describe('Select for AOTY', () => {
    const rated = () =>
      new Map([['album1', { score: 0.8, rank: 1, contributions: new Map<number, number>() }]]);
    const upsert = vi.fn().mockResolvedValue({ error: null });

    beforeEach(() => {
      upsert.mockClear();
      vi.mocked(supabase.from).mockImplementation(
        () => ({ upsert }) as unknown as ReturnType<typeof supabase.from>
      );
    });

    it('adds a ready album via an idempotent upsert', async () => {
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
      await waitFor(() =>
        expect(upsert).toHaveBeenCalledWith([{ user_id: 'user-abc', album_id: 'album1' }], {
          onConflict: 'user_id,album_id',
          ignoreDuplicates: true,
        })
      );
      expect(mockRefetchAoty).toHaveBeenCalled();
    });

    it.each([
      ['unrated', () => undefined],
      ['tier none', () => ((stubTier = 'none'), rated())],
      ['insufficient data', () => ((stubInsufficient = true), rated())],
    ])('does not add when %s: hands off to the gate flow instead', async (_n, setup) => {
      mockSummary = (setup() as typeof mockSummary) ?? new Map();
      render(<ContendersPage />, { wrapper });
      const btn = screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0];
      expect(btn).toBeEnabled();
      fireEvent.click(btn);
      await Promise.resolve();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('disables the action and shows visible status text without a release date', async () => {
      mockItems = [{ ...mockItem, releaseDate: null }];
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      expect(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]).toBeDisabled();
      expect(screen.getAllByText('No release date yet.').length).toBeGreaterThan(0);
    });

    it('marks an album already in AOTY and offers no second select', async () => {
      mockAotyItems = [{ ...mockItem, createdAt: '2026-09-30' }];
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      expect(screen.getAllByText('In AOTY').length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /Select Opeth.*for AOTY/ })).toBeNull();
    });

    it('shows the AOTY cascade count in the single remove confirmation', async () => {
      mockAotyItems = [{ ...mockItem, createdAt: '2026-09-30' }];
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Contenders' })[0]);
      expect(
        await screen.findByText(/also removes 1 album from your AOTY list/)
      ).toBeInTheDocument();
    });

    it('bulk-adds only ready albums and reports the skipped count', async () => {
      mockItems = [mockItem, { ...mockItem, albumId: 'album2', band: 'Mgla', releaseDate: null }];
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Mgla/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Select for AOTY' }));
      await waitFor(() =>
        expect(upsert).toHaveBeenCalledWith([{ user_id: 'user-abc', album_id: 'album1' }], {
          onConflict: 'user_id,album_id',
          ignoreDuplicates: true,
        })
      );
      await waitFor(() =>
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining('1 skipped'))
      );
    });

    it('asks before a bulk remove that would also drop AOTY members', async () => {
      mockAotyItems = [{ ...mockItem, createdAt: '2026-09-30' }];
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
      expect(
        await screen.findByText(/also removes 1 album from your AOTY list/)
      ).toBeInTheDocument();
    });
  });
});
