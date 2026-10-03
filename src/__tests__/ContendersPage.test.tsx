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
let mockAotyLoading = false;
const mockRefetchAoty = vi.fn();
vi.mock('../hooks/useAotyList', () => ({
  useAotyList: () => ({
    items: mockAotyItems,
    loading: mockAotyLoading,
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

let pickerContenderIds = new Set<string>();
vi.mock('../components/AddToContendersPicker', () => ({
  AddToContendersPicker: (p: { contenderAlbumIds: Set<string> }) => {
    pickerContenderIds = p.contenderAlbumIds;
    return null;
  },
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
    mockAotyLoading = false;
    mockRefetchAoty.mockReset();
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

    it('labels the score badge "Your Score x.x"', async () => {
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      expect(screen.getAllByText('Your Score 8.0').length).toBeGreaterThan(0);
    });

    it('disables the action and shows visible status text without a release date', async () => {
      mockItems = [{ ...mockItem, releaseDate: null }];
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      expect(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]).toBeDisabled();
      expect(screen.getAllByText('No release date yet.').length).toBeGreaterThan(0);
    });

    it('hides an album already in AOTY from the list, but keeps it in the picker set', async () => {
      mockItems = [mockItem, { ...mockItem, albumId: 'album2', band: 'Mgla' }];
      mockAotyItems = [{ ...mockItem, createdAt: '2026-09-30' }];
      render(<ContendersPage />, { wrapper });
      expect(screen.getAllByText(/Mgla/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Opeth/)).toBeNull();
      expect(screen.queryByText('In AOTY')).toBeNull();
      expect(pickerContenderIds.has('album1')).toBe(true);
    });

    it('shows the all-in-AOTY empty state, distinct from the true empty state', async () => {
      mockAotyItems = [{ ...mockItem, createdAt: '2026-09-30' }];
      render(<ContendersPage />, { wrapper });
      expect(screen.getByText('All your contenders are in AOTY.')).toBeInTheDocument();
      expect(screen.queryByText('No contenders yet.')).toBeNull();
    });

    it('does not flash AOTY members while the AOTY list is still loading', async () => {
      mockAotyLoading = true;
      render(<ContendersPage />, { wrapper });
      expect(screen.queryByText(/Opeth/)).toBeNull();
    });

    it('shows every contender when the AOTY fetch failed, and re-selecting is a harmless upsert', async () => {
      // A failed fetch surfaces as an empty AOTY list; the album was already selected earlier.
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Added to AOTY'));
      expect(upsert.mock.calls[0][1]).toMatchObject({ ignoreDuplicates: true });
    });

    it('toasts exactly "Added to AOTY" on a single select', async () => {
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Added to AOTY'));
    });

    it('keeps the row and shows the error toast when the insert fails', async () => {
      upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
      await waitFor(() => expect(mockShowError).toHaveBeenCalled());
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0);
    });

    describe('focus after the row leaves', () => {
      const two = () => {
        mockItems = [mockItem, { ...mockItem, albumId: 'album2', band: 'Mgla' }];
        mockSummary = new Map([
          ['album1', { score: 0.8, rank: 1, contributions: new Map<number, number>() }],
          ['album2', { score: 0.7, rank: 2, contributions: new Map<number, number>() }],
        ]);
      };
      // Mimics the real refetch: membership lands, the page re-renders without the row.
      const wireRefetch = (rerender: () => void, moved: FavoriteListItem) => {
        mockRefetchAoty.mockImplementation(() => {
          mockAotyItems = [{ ...moved, createdAt: '2026-10-01' }];
          rerender();
        });
      };

      it('moves to the next row primary control', async () => {
        two();
        const { rerender } = render(<ContendersPage />, { wrapper });
        wireRefetch(() => rerender(<ContendersPage />), mockItem);
        fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
        await waitFor(() =>
          expect(screen.getAllByRole('button', { name: /Select Mgla.*for AOTY/ })[0]).toHaveFocus()
        );
      });

      it('moves to the heading when it was the last row', async () => {
        two();
        const { rerender } = render(<ContendersPage />, { wrapper });
        wireRefetch(() => rerender(<ContendersPage />), mockItems[1]);
        fireEvent.click(screen.getAllByRole('button', { name: /Select Mgla.*for AOTY/ })[0]);
        await waitFor(() =>
          expect(screen.getByRole('heading', { name: 'Contenders' })).toHaveFocus()
        );
      });
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

    it('bulk remove goes straight through with no AOTY confirmation', async () => {
      vi.mocked(supabase.from).mockImplementation(
        () => makeContendersDeleteChain() as unknown as ReturnType<typeof supabase.from>
      );
      render(<ContendersPage />, { wrapper });
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
      await waitFor(() =>
        expect(mockShowSuccess).toHaveBeenCalledWith('1 removed from Contenders')
      );
      expect(screen.queryByText(/AOTY list/)).toBeNull();
    });
  });
});
