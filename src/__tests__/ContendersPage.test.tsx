// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ContendersPage } from '../ContendersPage';
import { maxReleaseYear } from '../lib/aoty/releaseDate';
import system from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

// ContendersPage's own hook dependencies are mocked directly (rather than the raw supabase
// tables underneath them) — same reasoning FavoritesPage.test.tsx gives for stubbing the
// calibration tables: these hooks' own internals are already covered by their own test files,
// so a ContendersPage test only needs to exercise ContendersPage's own logic.
const mockRefetch = vi.fn();
const mockAddContendersLocal = vi.fn();
const mockSetReleaseDateLocal = vi.fn();
let mockItems: FavoriteListItem[] = [];
vi.mock('../hooks/useContendersList', () => ({
  useContendersList: () => ({
    items: mockItems,
    loading: false,
    error: null,
    refetch: mockRefetch,
    addLocal: mockAddContendersLocal,
    setReleaseDateLocal: mockSetReleaseDateLocal,
  }),
}));

let mockAotyItems: (FavoriteListItem & { createdAt: string })[] = [];
let mockAotyLoading = false;
const mockRefetchAoty = vi.fn();
const mockAddLocal = vi.fn();
vi.mock('../hooks/useAotyList', () => ({
  useAotyList: () => ({
    items: mockAotyItems,
    aotyIds: new Set(mockAotyItems.map((i) => i.albumId)),
    idsLoading: mockAotyLoading,
    loading: mockAotyLoading,
    error: null,
    refetch: mockRefetchAoty,
    addLocal: mockAddLocal,
    removeLocal: vi.fn(),
  }),
}));

let stubInsufficient = false;
let stubTier: 'none' | 'medium' | 'high' | 'very_high' = 'high';
let stubHasWeights = true;
let stubGateLoading = false;
let mockRatingsLoading = false;
vi.mock('../hooks/useCalibrationGate', () => ({
  useCalibrationGate: () => ({
    tier: stubTier,
    hasWeights: stubHasWeights,
    hasInsufficientData: stubInsufficient,
    loading: stubGateLoading,
  }),
  confidenceLabel: (tier: string) => tier,
}));

const mockRefetchRatings = vi.fn();
let mockSummary = new Map<
  string,
  { score: number; rank: number; contributions: Map<number, number> }
>();
vi.mock('../hooks/useAlbumRatingsSummary', () => ({
  useAlbumRatingsSummary: () => ({
    summary: mockSummary,
    loading: mockRatingsLoading,
    refetch: mockRefetchRatings,
  }),
}));

let pickerContenderIds = new Set<string>();
let pickerOnAdded: (added: FavoriteListItem[]) => unknown = () => undefined;
vi.mock('../components/AddToContendersPicker', () => ({
  AddToContendersPicker: (p: {
    contenderAlbumIds: Set<string>;
    onAdded: (added: FavoriteListItem[]) => unknown;
  }) => {
    pickerContenderIds = p.contenderAlbumIds;
    pickerOnAdded = p.onAdded;
    return null;
  },
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-abc', email: 'dan@test.com' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockShowAction = vi.fn();
vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showAction: mockShowAction,
  }),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
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
    mockSetReleaseDateLocal.mockReset();
    mockAddLocal.mockReset();
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
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' })
    );
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
      upsert.mockReset();
      upsert.mockResolvedValue({ error: null });
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

    it('keeps Select for AOTY enabled without a release date, with the status text kept', async () => {
      mockItems = [{ ...mockItem, releaseDate: null }];
      mockSummary = rated();
      render(<ContendersPage />, { wrapper });
      const btn = screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0];
      expect(btn).toBeEnabled();
      expect(btn).toHaveTextContent('Select for AOTY');
      expect(screen.queryByRole('button', { name: /Add release date/ })).toBeNull();
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

    it('shows every candidate and does not hang in loading when the AOTY ids fetch failed', async () => {
      // A failed ids fetch resolves to idsLoading false with an empty set (see useAotyList).
      mockItems = [mockItem];
      mockAotyItems = [];
      mockAotyLoading = false;
      render(<ContendersPage />, { wrapper });
      expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0);
    });

    it('shows the all-in-AOTY empty state, distinct from the true empty state', async () => {
      mockAotyItems = [{ ...mockItem, createdAt: '2026-09-30' }];
      render(<ContendersPage />, { wrapper });
      expect(screen.getByText('All your 2024 contenders are in AOTY.')).toBeInTheDocument();
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

    describe('in-flight feedback', () => {
      const twoRated = () => {
        mockItems = [mockItem, { ...mockItem, albumId: 'album2', band: 'Mgla' }];
        mockSummary = new Map([
          ['album1', { score: 0.8, rank: 1, contributions: new Map<number, number>() }],
          ['album2', { score: 0.7, rank: 2, contributions: new Map<number, number>() }],
        ]);
      };
      const holdUpsert = () => {
        const releases: Array<(r: { error: { message: string } | null }) => void> = [];
        upsert.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
        return releases;
      };

      it('double click writes once; busy is visible, name unchanged, focus stays', async () => {
        mockSummary = rated();
        const releases = holdUpsert();
        render(<ContendersPage />, { wrapper });
        const btn = screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0];
        btn.focus();
        fireEvent.click(btn);
        fireEvent.click(btn);
        await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));
        expect(btn).toHaveAttribute('aria-disabled', 'true');
        expect(btn).not.toBeDisabled();
        expect(btn).toHaveFocus();
        expect(upsert).toHaveBeenCalledTimes(1);
        releases[0]({ error: null });
        await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Added to AOTY'));
      });

      it('adds locally from the write result, then refetches in the background', async () => {
        mockSummary = rated();
        render(<ContendersPage />, { wrapper });
        fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
        await waitFor(() => expect(mockAddLocal).toHaveBeenCalled());
        expect(mockAddLocal.mock.calls[0][0][0]).toMatchObject({ albumId: 'album1' });
        expect(mockRefetchAoty).toHaveBeenCalled();
      });

      it('failure re-enables the control and keeps the row', async () => {
        mockSummary = rated();
        upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
        render(<ContendersPage />, { wrapper });
        const btn = screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0];
        fireEvent.click(btn);
        await waitFor(() => expect(mockShowError).toHaveBeenCalled());
        await waitFor(() => expect(btn).not.toHaveAttribute('aria-busy'));
        expect(mockAddLocal).not.toHaveBeenCalled();
        fireEvent.click(btn); // usable again: a second attempt writes
        await waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
      });

      it('different rows write in parallel', async () => {
        twoRated();
        const releases = holdUpsert();
        render(<ContendersPage />, { wrapper });
        fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
        fireEvent.click(screen.getAllByRole('button', { name: /Select Mgla.*for AOTY/ })[0]);
        await waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
        releases.forEach((r) => r({ error: null }));
        await waitFor(() => expect(mockAddLocal).toHaveBeenCalledTimes(2));
      });

      it('moves focus once; the reconcile refetch does not move it again', async () => {
        twoRated();
        const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
        const { rerender } = render(<ContendersPage />, { wrapper });
        mockAddLocal.mockImplementation(() => {
          mockAotyItems = [{ ...mockItem, createdAt: '2026-10-01' }];
          rerender(<ContendersPage />);
        });
        fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
        await waitFor(() =>
          expect(screen.getAllByRole('button', { name: /Select Mgla.*for AOTY/ })[0]).toHaveFocus()
        );
        const after = focusSpy.mock.calls.length;
        // Reconcile: the refetched AOTY list replaces the local one (new array identity).
        mockAotyItems = [{ ...mockItem, createdAt: '2026-10-01T00:00:01Z' }];
        rerender(<ContendersPage />);
        expect(focusSpy.mock.calls.length).toBe(after);
        focusSpy.mockRestore();
      });

      it('bulk: locks bulk controls and the selected checkboxes while pending', async () => {
        twoRated();
        const releases = holdUpsert();
        render(<ContendersPage />, { wrapper });
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Select for AOTY' }));
        const remove = await screen.findByRole('button', { name: 'Remove' });
        await waitFor(() => expect(remove).toBeDisabled());
        expect(screen.getByRole('checkbox', { name: /Opeth/ })).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: /Mgla/ })).not.toBeDisabled();
        releases[0]({ error: null });
        await waitFor(() =>
          expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining('1 added'))
        );
      });
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
        mockAddLocal.mockImplementation(() => {
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

      it('moves to the active tab when it was the last row', async () => {
        two();
        const { rerender } = render(<ContendersPage />, { wrapper });
        wireRefetch(() => rerender(<ContendersPage />), mockItems[1]);
        fireEvent.click(screen.getAllByRole('button', { name: /Select Mgla.*for AOTY/ })[0]);
        await waitFor(() =>
          expect(screen.getByRole('tab', { name: /^Contenders/, selected: true })).toHaveFocus()
        );
      });
    });

    // A checked row that leaves the list through its own button must leave the selection too: the
    // count, and above all bulk Remove (deleting a contenders row cascades to its aoty row).
    describe('selection after a row leaves through its own button', () => {
      const twoRated = () => {
        mockItems = [mockItem, { ...mockItem, albumId: 'album2', band: 'Mgla' }];
        mockSummary = new Map([
          ['album1', { score: 0.8, rank: 1, contributions: new Map<number, number>() }],
          ['album2', { score: 0.7, rank: 2, contributions: new Map<number, number>() }],
        ]);
      };
      const wire = () => {
        const inFn = vi.fn().mockResolvedValue({ data: null, error: null });
        vi.mocked(supabase.from).mockImplementation(
          () =>
            ({
              upsert,
              delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
            }) as unknown as ReturnType<typeof supabase.from>
        );
        const { rerender } = render(<ContendersPage />, { wrapper });
        mockAddLocal.mockImplementation(() => {
          mockAotyItems = [{ ...mockItem, createdAt: '2026-10-01' }];
          rerender(<ContendersPage />);
        });
        return inFn;
      };

      it('count and bulk Remove ignore the promoted row', async () => {
        twoRated();
        const inFn = wire();
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Mgla/ }));
        await waitFor(() => screen.getByText('2 selected'));
        fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
        await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Added to AOTY'));
        await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Opeth/ })).toBeNull());
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        await waitFor(() =>
          expect(mockShowSuccess).toHaveBeenCalledWith('1 removed from Contenders')
        );
        expect(inFn).toHaveBeenCalledTimes(1);
        expect(inFn).toHaveBeenCalledWith('album_id', ['album2']);
      });

      it('the bar goes inert when the promoted row was the only one checked', async () => {
        twoRated();
        wire();
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
        await waitFor(() => screen.getByText('1 selected'));
        fireEvent.click(screen.getAllByRole('button', { name: /Select Opeth.*for AOTY/ })[0]);
        await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Opeth/ })).toBeNull());
        expect(screen.queryByText(/\d+ selected/)).toBeNull();
        expect(
          screen.getByText('Select albums to add or remove several at once.')
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toHaveAttribute(
          'aria-disabled',
          'true'
        );
      });
    });

    it('bulk-adds only ready albums and reports the skipped count', async () => {
      mockItems = [mockItem, { ...mockItem, albumId: 'album2', band: 'Mgla' }];
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

    describe('permanent bulk bar slot', () => {
      // These tests wire addLocal to re-render; later describes must not inherit that.
      afterEach(() => mockAddLocal.mockReset());
      const bar = () => screen.getByRole('button', { name: 'Select for AOTY' });
      const barRemove = () => screen.getByRole('button', { name: 'Remove' });

      it('is there with nothing selected: status text, both buttons inert, presses ignored', () => {
        mockSummary = rated();
        render(<ContendersPage />, { wrapper });
        expect(screen.getByText('Select albums to add or remove several at once.')).toBeVisible();
        for (const b of [bar(), barRemove()]) expect(b).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(bar());
        fireEvent.click(barRemove());
        expect(upsert).not.toHaveBeenCalled();
        expect(mockShowError).not.toHaveBeenCalled();
        expect(screen.queryByRole('alertdialog')).toBeNull();
      });

      it('keeps the same slot (same node, same height) from 0 to 1 selected, then enables', async () => {
        mockSummary = rated();
        render(<ContendersPage />, { wrapper });
        const slot = barRemove().parentElement!.parentElement!.parentElement!;
        expect(slot).toHaveStyle({ height: '64px' });
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
        await waitFor(() => screen.getByText('1 selected'));
        expect(barRemove().parentElement!.parentElement!.parentElement!).toBe(slot);
        expect(bar()).not.toHaveAttribute('aria-disabled');
        expect(barRemove()).not.toHaveAttribute('aria-disabled');
      });

      it('after a bulk add, focus goes to the first remaining row, else the heading', async () => {
        mockItems = [mockItem, { ...mockItem, albumId: 'album2', band: 'Mgla' }];
        mockSummary = rated();
        const { rerender } = render(<ContendersPage />, { wrapper });
        mockAddLocal.mockImplementation(() => {
          mockAotyItems = [{ ...mockItem, createdAt: '2026-10-01' }];
          rerender(<ContendersPage />);
        });
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
        await waitFor(() => screen.getByText('1 selected'));
        fireEvent.click(bar());
        await waitFor(() =>
          expect(screen.getAllByRole('button', { name: /Select Mgla.*for AOTY/ })[0]).toHaveFocus()
        );
      });

      it('after a bulk add of every row, focus goes to the active tab', async () => {
        mockItems = [mockItem];
        mockSummary = rated();
        const { rerender } = render(<ContendersPage />, { wrapper });
        mockAddLocal.mockImplementation(() => {
          mockAotyItems = [{ ...mockItem, createdAt: '2026-10-01' }];
          rerender(<ContendersPage />);
        });
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
        await waitFor(() => screen.getByText('1 selected'));
        fireEvent.click(bar());
        await waitFor(() =>
          expect(screen.getByRole('tab', { name: /^Contenders/, selected: true })).toHaveFocus()
        );
      });
    });
  });
});

function Loc() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}
const at = (entry: string) =>
  function RouterWrapper({ children }: { children: React.ReactNode }) {
    return (
      <ChakraProvider value={system}>
        <MemoryRouter initialEntries={[entry]}>
          <Loc />
          {children}
        </MemoryRouter>
      </ChakraProvider>
    );
  };
const album = (albumId: string, band: string, releaseDate: string | null): FavoriteListItem => ({
  ...mockItem,
  albumId,
  band,
  releaseDate,
});
const loc = () => screen.getByTestId('loc').textContent;
const year = () => screen.getByRole('combobox', { name: 'Year' }) as HTMLSelectElement;

describe('ContendersPage year scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAotyItems = [];
    mockAotyLoading = false;
    mockSummary = new Map();
    stubInsufficient = false;
    stubTier = 'high';
    stubHasWeights = true;
    mockItems = [
      album('a1', 'Alpha', '2025-03-01'),
      album('a2', 'Bravo', '2025-05'),
      album('b1', 'Charlie', '2024'),
      album('n1', 'Delta', null),
    ];
  });

  it('defaults to the year with most contenders when AOTY is empty, and filters rows', () => {
    render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
    expect(year().value).toBe('2025');
    expect(screen.getAllByText(/Alpha/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Charlie/)).toBeNull();
    expect(screen.queryByText(/Delta/)).toBeNull();
    expect(Array.from(year().options).map((o) => o.textContent)).toEqual([
      '2025',
      '2024',
      'No release year',
    ]);
  });

  it('prefers the year with most AOTY members over the one with most contenders', () => {
    mockAotyItems = [{ ...mockItems[2], createdAt: 'x' }];
    render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
    expect(year().value).toBe('2024');
  });

  it('breaks ties toward the latest year', () => {
    mockItems = [album('a1', 'Alpha', '2025-03-01'), album('b1', 'Charlie', '2024-01-01')];
    render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
    expect(year().value).toBe('2025');
  });

  it('writes the scope to the URL by replace and switches rows on change', () => {
    render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
    expect(loc()).toBe('/aoty/contenders?year=2025');
    fireEvent.change(year(), { target: { value: '2024' } });
    expect(loc()).toBe('/aoty/contenders?year=2024');
    expect(screen.getAllByText(/Charlie/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Alpha/)).toBeNull();
  });

  it('honors a valid ?year and falls back to the default for invalid or unavailable ones', () => {
    const { unmount } = render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=2024') });
    expect(year().value).toBe('2024');
    unmount();
    for (const bad of ['abc', '20245', '1999']) {
      const r = render(<ContendersPage />, { wrapper: at(`/aoty/contenders?year=${bad}`) });
      expect(year().value).toBe('2025');
      r.unmount();
    }
  });

  it('hides the selector when only one scope value exists', () => {
    mockItems = [album('a1', 'Alpha', '2025-03-01')];
    render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
    expect(screen.queryByRole('combobox', { name: 'Year' })).toBeNull();
    expect(loc()).toBe('/aoty/contenders');
  });

  it('keeps the scope when switching to the AOTY tab', async () => {
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=2024') });
    fireEvent.click(screen.getByRole('tab', { name: /^AOTY/ }));
    // Ark's tabs machine applies the change a tick after the click.
    await waitFor(() => expect(loc()).toBe('/aoty/contenders?year=2024&view=aoty'));
  });

  it('keeps the displayed scope when promotions change the counts (no ?year)', () => {
    const { rerender } = render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
    expect(year().value).toBe('2025');
    // A 2024 album joins AOTY: a recomputed default would now flip to 2024.
    mockAotyItems = [{ ...mockItems[2], createdAt: 'x' }];
    rerender(<ContendersPage />);
    expect(year().value).toBe('2025');
  });

  it('stays on a scope that became empty and shows its empty state', () => {
    mockItems = [album('b1', 'Charlie', '2024'), album('a1', 'Alpha', '2025-03-01')];
    const { rerender } = render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=2024') });
    mockItems = [album('a1', 'Alpha', '2025-03-01'), album('a2', 'Bravo', '2025-05')];
    rerender(<ContendersPage />);
    expect(year().value).toBe('2024');
    expect(screen.getByText('No contenders in 2024.')).toBeInTheDocument();
  });

  it('shows the all-promoted state for the scope when others still have contenders', () => {
    mockAotyItems = [{ ...mockItems[2], createdAt: 'x' }];
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=2024') });
    expect(screen.getByText('All your 2024 contenders are in AOTY.')).toBeInTheDocument();
  });

  it('shows the reason and asks for the date, without writing, for an undated contender in the no-year scope', async () => {
    mockSummary = new Map([
      ['n1', { score: 0.8, rank: 1, contributions: new Map<number, number>() }],
    ]);
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=none') });
    expect(year().value).toBe('none');
    expect(screen.getAllByText(/Delta/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('No release date yet.').length).toBeGreaterThan(0);
    // Enabled: the click asks for the date, it is not a write.
    screen.getAllByRole('button', { name: /Select Delta .* for AOTY/ }).forEach((b) => {
      expect(b).toBeEnabled();
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Select Delta .* for AOTY/ })[0]);
    expect(await screen.findByRole('dialog', { name: 'Add release date' })).toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('falls back to the default when ?year=none has no undated contenders', () => {
    mockItems = [album('a1', 'Alpha', '2025-03-01'), album('b1', 'Charlie', '2024')];
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=none') });
    // 'none' is unavailable at resolution, so the default applies.
    expect(year().value).toBe('2025');
  });

  it('clears the selection when the scope changes', async () => {
    render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Alpha/ }));
    await waitFor(() => screen.getByText('1 selected'));
    fireEvent.change(year(), { target: { value: '2024' } });
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  describe('Add from Favorites', () => {
    it('adds the albums to the pool first, and offers View <year> when all outside share one year', () => {
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      const added = [album('c1', 'Echo', '2023-01-01'), album('c2', 'Foxtrot', '2023-06-01')];
      let result: { suffix?: string; action?: { label: string; onClick: () => void } } | undefined;
      act(() => {
        result = pickerOnAdded(added) as typeof result;
      });
      expect(mockAddContendersLocal).toHaveBeenCalledWith(added);
      expect(result?.suffix).toBe(' 2 are outside 2025.');
      expect(result?.action?.label).toBe('View 2023');
      // Clicking View right away lands on that year, before any refetch has landed.
      act(() => result?.action?.onClick());
      expect(loc()).toBe('/aoty/contenders?year=2023');
      expect(year().value).toBe('2023');
    });

    it('offers no View action when the outside albums span years, and nothing when all are in scope', () => {
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      let result: { suffix?: string; action?: unknown } | undefined;
      act(() => {
        result = pickerOnAdded([
          album('c1', 'Echo', '2023-01-01'),
          album('c2', 'Foxtrot', '2022-06-01'),
          album('c3', 'Golf', '2025-01-01'),
        ]) as typeof result;
      });
      expect(result?.suffix).toBe(' 2 are outside 2025.');
      expect(result?.action).toBeUndefined();
      act(() => {
        result = pickerOnAdded([album('c4', 'Hotel', '2025-02-01')]) as typeof result;
      });
      expect(result).toBeUndefined();
    });
  });
});

// Release date at promotion: an undated contender gets its date from a dialog that calls
// fill_missing_release_date (v2 returns the stored date). The hook is mocked, so the mock
// stands in for setReleaseDateLocal by swapping `mockItems`; the page re-renders from its own
// state changes right after.
describe('ContendersPage release date at promotion', () => {
  let resolveRpc: (v: { data: unknown; error: unknown }) => void;
  const dated = (id: string, date: string) => {
    mockItems = mockItems.map((i) => (i.albumId === id ? { ...i, releaseDate: date } : i));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAotyItems = [];
    mockAotyLoading = false;
    mockSummary = new Map();
    stubInsufficient = false;
    stubTier = 'high';
    stubHasWeights = true;
    mockItems = [album('n1', 'Delta', null), album('n2', 'Echo', null)];
    mockSetReleaseDateLocal.mockReset();
    mockSetReleaseDateLocal.mockImplementation((id: string, d: string) => dated(id, d));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: '2024-03', error: null } as never);
  });

  const addButton = (band = 'Delta') =>
    screen.getAllByRole('button', { name: new RegExp(`Select ${band} .* for AOTY`) })[0];
  const openDialog = async (band = 'Delta') => {
    fireEvent.click(addButton(band));
    return screen.findByRole('dialog', { name: 'Add release date' });
  };
  const typeDate = (value: string) => {
    const input = screen.getByLabelText('Release date');
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  };
  const save = () => screen.getByRole('button', { name: 'Save date' });
  const renderNone = () =>
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=none') });

  it('opens a named dialog with a labelled input focused and the shared-catalog warning', async () => {
    renderNone();
    const dialog = await openDialog();
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Release date')).toBeInTheDocument();
    // jsdom has no layout, so the dialog's focus trap settles on the dialog itself instead of
    // the input (initialFocusEl); that the input gets focus in a real browser is a manual check.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.getByText(/Shared with everyone who has this album/)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('closes on Cancel and on Escape without writing, and focus returns to the row button', async () => {
    renderNone();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(document.activeElement).toBe(addButton()), { timeout: 4000 });

    await openDialog();
    // The dialog attaches its Escape listener a beat after opening, so retry the key press.
    await waitFor(
      () => {
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
      },
      { timeout: 4000 }
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  describe('validation', () => {
    it.each([
      ['3036-06-26', `Enter a year between 1900 and ${maxReleaseYear()}.`],
      ['3036', `Enter a year between 1900 and ${maxReleaseYear()}.`],
      ['1899', `Enter a year between 1900 and ${maxReleaseYear()}.`],
      ['2024-02-30', 'That date does not exist.'],
      ['2024-13', /Use a year, a year and month, or a full date/],
      ['abc', /Use a year, a year and month, or a full date/],
      ['2024abc', /Use a year, a year and month, or a full date/],
    ])('rejects %s inline and never calls the function', async (value, message) => {
      renderNone();
      await openDialog();
      typeDate(value);
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(save()).toBeDisabled();
      expect(screen.queryByText(/Will be saved as/)).toBeNull();
      fireEvent.submit(screen.getByLabelText('Release date').closest('form')!);
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it.each([
      ['2024', '2024'],
      ['2024-03', 'Mar 2024'],
      ['2024-03-15', '15 Mar 2024'],
    ])('previews %s as "%s" only once valid', async (value, shown) => {
      renderNone();
      await openDialog();
      expect(screen.queryByText(/Will be saved as/)).toBeNull();
      typeDate(value);
      expect(await screen.findByText(`Will be saved as: ${shown}`)).toBeInTheDocument();
      expect(save()).toBeEnabled();
    });
  });

  it('uses the shared calendar: picking a day fills the field, the preview and Save follow', async () => {
    renderNone();
    await openDialog();
    typeDate('2019-05-10');
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    fireEvent.click(await screen.findByRole('button', { name: /Choose Friday, May 17, 2019/ }));
    await waitFor(() =>
      expect((screen.getByLabelText('Release date') as HTMLInputElement).value).toBe('2019-05-17')
    );
    expect(screen.getByText('Will be saved as: 17 May 2019')).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('writes once on a double submit', async () => {
    vi.mocked(supabase.rpc).mockReturnValue(
      new Promise((r) => {
        resolveRpc = r;
      }) as never
    );
    renderNone();
    await openDialog();
    typeDate('2024-03');
    fireEvent.click(save());
    fireEvent.click(save());
    fireEvent.submit(screen.getByLabelText('Release date').closest('form')!);
    await waitFor(() => expect(save()).toHaveAttribute('aria-busy', 'true'));
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('fill_missing_release_date', {
      p_album_id: 'n1',
      p_release_date: '2024-03',
    });
    await act(async () => resolveRpc({ data: '2024-03', error: null }));
  });

  it('on success updates local state, reconciles, and the toast action switches scope', async () => {
    renderNone();
    await openDialog();
    typeDate(' 2024-03 ');
    fireEvent.click(save());

    await waitFor(() => expect(mockSetReleaseDateLocal).toHaveBeenCalledWith('n1', '2024-03'));
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockRefetchRatings).toHaveBeenCalled();
    expect(mockShowAction).toHaveBeenCalledWith('Saved Mar 2024 for Delta – Blackwater Park.', {
      label: 'View 2024',
      onClick: expect.any(Function),
    });
    // The row left "No release year"; the pinned scope stays and the other undated row remains.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
    expect(year().value).toBe('none');
    expect(screen.queryByText(/Delta/)).toBeNull();
    expect(screen.getAllByText(/Echo/).length).toBeGreaterThan(0);

    act(() => mockShowAction.mock.calls[0][1].onClick());
    expect(loc()).toBe('/aoty/contenders?year=2024');
    expect(year().value).toBe('2024');
    expect(screen.getAllByText(/Delta/).length).toBeGreaterThan(0);
  });

  describe('when the album is ready to be selected, saving continues into Select for AOTY', () => {
    const upsert = vi.fn();
    const ready = () => {
      mockSummary = new Map([
        ['n1', { score: 0.8, rank: 1, contributions: new Map<number, number>() }],
      ]);
    };
    beforeEach(() => {
      upsert.mockReset();
      upsert.mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockImplementation(
        () => ({ upsert }) as unknown as ReturnType<typeof supabase.from>
      );
    });

    it('labels the save accordingly and writes the date, then the AOTY membership', async () => {
      ready();
      renderNone();
      await openDialog();
      typeDate('2024-03');
      fireEvent.click(screen.getByRole('button', { name: 'Save and select for AOTY' }));
      await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(supabase.rpc).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledWith([{ user_id: 'user-abc', album_id: 'n1' }], {
        onConflict: 'user_id,album_id',
        ignoreDuplicates: true,
      });
      await waitFor(() =>
        expect(mockShowSuccess).toHaveBeenCalledWith(
          'Saved Mar 2024 and added Delta – Blackwater Park to AOTY.'
        )
      );
      expect(mockSetReleaseDateLocal).toHaveBeenCalledWith('n1', '2024-03');
      expect(mockAddLocal.mock.calls[0][0][0]).toMatchObject({
        albumId: 'n1',
        releaseDate: '2024-03',
      });
      expect(mockShowAction).not.toHaveBeenCalled();
    });

    it('selects with the date already stored when someone else dated it first', async () => {
      ready();
      vi.mocked(supabase.rpc).mockResolvedValue({ data: '2019-05-10', error: null } as never);
      renderNone();
      await openDialog();
      typeDate('2024');
      fireEvent.click(screen.getByRole('button', { name: 'Save and select for AOTY' }));
      await waitFor(() =>
        expect(mockShowSuccess).toHaveBeenCalledWith(
          'Delta – Blackwater Park already has the release date 10 May 2019. Added to AOTY with that date.'
        )
      );
      expect(mockAddLocal.mock.calls[0][0][0]).toMatchObject({ releaseDate: '2019-05-10' });
    });

    it('keeps the date when the selection fails, and says so', async () => {
      ready();
      upsert.mockResolvedValue({ error: { message: 'boom' } });
      renderNone();
      await openDialog();
      typeDate('2024-03');
      fireEvent.click(screen.getByRole('button', { name: 'Save and select for AOTY' }));
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not add to AOTY — try again')
      );
      expect(mockSetReleaseDateLocal).toHaveBeenCalledWith('n1', '2024-03');
      expect(mockAddLocal).not.toHaveBeenCalled();
      expect(mockShowAction.mock.calls[0][0]).toBe('Saved Mar 2024 for Delta – Blackwater Park.');
    });

    it('does not select when the date write fails', async () => {
      ready();
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'boom' },
      } as never);
      renderNone();
      await openDialog();
      typeDate('2024');
      fireEvent.click(screen.getByRole('button', { name: 'Save and select for AOTY' }));
      await waitFor(() => expect(mockShowError).toHaveBeenCalled());
      expect(upsert).not.toHaveBeenCalled();
    });

    it('saves the date only when the album is not ready (not fully rated)', async () => {
      mockSummary = new Map();
      renderNone();
      await openDialog();
      expect(screen.queryByRole('button', { name: 'Save and select for AOTY' })).toBeNull();
      typeDate('2024-03');
      fireEvent.click(save());
      await waitFor(() => expect(mockShowAction).toHaveBeenCalled());
      expect(upsert).not.toHaveBeenCalled();
      expect(mockAddLocal).not.toHaveBeenCalled();
    });
  });

  it('keeps the emptied no-year scope on screen with its empty state', async () => {
    mockItems = [album('n1', 'Delta', null)];
    renderNone();
    await openDialog();
    typeDate('2024');
    fireEvent.click(save());
    expect(await screen.findByText('No contenders without a release year.')).toBeInTheDocument();
    expect(year().value).toBe('none');
  });

  it('moves focus to the next row when the dated row leaves the scope', async () => {
    renderNone();
    await openDialog();
    typeDate('2024');
    fireEvent.click(save());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
    await waitFor(() => {
      const el = document.activeElement as HTMLElement | null;
      expect(el?.getAttribute('data-primary-for')).toBe('n2');
    });
  });

  it('shows the existing date when someone else filled it first, without claiming a save', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: '2019-05-10', error: null } as never);
    renderNone();
    await openDialog();
    typeDate('2024');
    fireEvent.click(save());
    await waitFor(() => expect(mockSetReleaseDateLocal).toHaveBeenCalledWith('n1', '2019-05-10'));
    const [message] = mockShowAction.mock.calls[0];
    expect(message).toBe(
      'Delta – Blackwater Park already has the release date 10 May 2019. Nothing was changed.'
    );
    expect(mockShowAction.mock.calls[0][1].label).toBe('View 2019');
  });

  it('keeps the row and the dialog, and re-enables the control, when the write fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } } as never);
    renderNone();
    await openDialog();
    typeDate('2024');
    fireEvent.click(save());
    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Could not save release date. Try again.')
    );
    expect(mockSetReleaseDateLocal).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Add release date' })).toBeInTheDocument();
    expect(save()).not.toHaveAttribute('aria-busy');
    expect(save()).toBeEnabled();
  });

  describe('a void or null return from the function (pre-v2 RPC, or album not found)', () => {
    const stubAlbumRead = (releaseDate: string | null | undefined) => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: releaseDate === undefined ? null : { release_date: releaseDate },
        error: null,
      });
      vi.mocked(supabase.from).mockImplementation(
        () =>
          ({
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
          }) as never
      );
    };

    it('reads the stored date back and uses it instead of trusting the write', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
      stubAlbumRead('2019-05-10');
      renderNone();
      await openDialog();
      typeDate('2024');
      fireEvent.click(save());
      await waitFor(() => expect(mockSetReleaseDateLocal).toHaveBeenCalledWith('n1', '2019-05-10'));
      expect(mockShowAction.mock.calls[0][0]).toMatch(/already has the release date/);
    });

    it('treats a matching read-back as saved', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
      stubAlbumRead('2024');
      renderNone();
      await openDialog();
      typeDate('2024');
      fireEvent.click(save());
      await waitFor(() => expect(mockSetReleaseDateLocal).toHaveBeenCalledWith('n1', '2024'));
      expect(mockShowAction.mock.calls[0][0]).toBe('Saved 2024 for Delta – Blackwater Park.');
    });

    it('does not report success when nothing is stored (album not found)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
      stubAlbumRead(undefined);
      renderNone();
      await openDialog();
      typeDate('2024');
      fireEvent.click(save());
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not confirm the release date. Try again.')
      );
      expect(mockSetReleaseDateLocal).not.toHaveBeenCalled();
      expect(mockShowAction).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Add release date' })).toBeInTheDocument();
    });
  });
});

// Select for AOTY on undated and not-ready rows: readiness while loading, the not-ready dialog
// hint, bulk with nothing to add, and throws. Release-date writes are stubbed like above.
describe('ContendersPage readiness and failure handling', () => {
  const upsert = vi.fn();
  const rated = (id: string) =>
    new Map([[id, { score: 0.8, rank: 1, contributions: new Map<number, number>() }]]);
  const dated = (id: string, date: string) => {
    mockItems = mockItems.map((i) => (i.albumId === id ? { ...i, releaseDate: date } : i));
  };
  const rowButtons = (band: string) =>
    screen.getAllByRole('button', { name: new RegExp(`Select ${band} .* for AOTY`) });
  const typeDate = (value: string) => {
    const input = screen.getByLabelText('Release date');
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  };
  const renderNone = () =>
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=none') });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAotyItems = [];
    mockAotyLoading = false;
    mockSummary = new Map();
    stubInsufficient = false;
    stubTier = 'high';
    stubHasWeights = true;
    stubGateLoading = false;
    mockRatingsLoading = false;
    mockItems = [album('n1', 'Delta', null), album('n2', 'Echo', null)];
    mockSetReleaseDateLocal.mockReset();
    mockSetReleaseDateLocal.mockImplementation((id: string, d: string) => dated(id, d));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: '2024-03', error: null } as never);
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockImplementation(
      () => ({ upsert }) as unknown as ReturnType<typeof supabase.from>
    );
  });

  describe('undated row that is not ready', () => {
    it('tier none: Save date with the hint, then the next click opens the soft gate', async () => {
      stubTier = 'none';
      mockSummary = rated('n1');
      renderNone();
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('dialog', { name: 'Add release date' });
      expect(await screen.findByRole('button', { name: 'Save date' })).toBeInTheDocument();
      expect(screen.getByText(/also needs a rating and a settled score level/)).toBeInTheDocument();
      typeDate('2024-03');
      fireEvent.click(screen.getByRole('button', { name: 'Save date' }));
      await waitFor(() => expect(mockShowAction).toHaveBeenCalled());
      expect(upsert).not.toHaveBeenCalled();
      // Now dated: pick its year, click again.
      fireEvent.change(year(), { target: { value: '2024' } });
      fireEvent.click(rowButtons('Delta')[0]);
      expect(await screen.findByText('Go to calibration')).toBeInTheDocument();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('insufficient data: Save date with the hint, then the next click goes to the rating page', async () => {
      stubInsufficient = true;
      mockSummary = rated('n1');
      renderNone();
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('dialog', { name: 'Add release date' });
      expect(screen.getByRole('button', { name: 'Save date' })).toBeInTheDocument();
      expect(screen.getByText(/also needs a rating and a settled score level/)).toBeInTheDocument();
      typeDate('2024-03');
      fireEvent.click(screen.getByRole('button', { name: 'Save date' }));
      await waitFor(() => expect(mockShowAction).toHaveBeenCalled());
      fireEvent.change(year(), { target: { value: '2024' } });
      fireEvent.click(rowButtons('Delta')[0]);
      // The harness keeps the page mounted after navigating, so its URL write may append &year.
      await waitFor(() => expect(loc()).toMatch(/^\/rate\/n1\?from=contenders/));
      expect(upsert).not.toHaveBeenCalled();
    });

    it('a selected row dated into another year is no longer counted or removed', async () => {
      const inFn = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.from).mockImplementation(
        () =>
          ({
            upsert,
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
          }) as unknown as ReturnType<typeof supabase.from>
      );
      renderNone();
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Delta/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Echo/ }));
      await waitFor(() => screen.getByText('2 selected'));
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('dialog', { name: 'Add release date' });
      typeDate('2024-03');
      fireEvent.click(screen.getByRole('button', { name: 'Save date' }));
      await waitFor(() => expect(mockShowAction).toHaveBeenCalled());
      expect(await screen.findByText('1 selected')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(inFn).toHaveBeenCalledWith('album_id', ['n2']));
      expect(inFn).toHaveBeenCalledTimes(1);
    });

    it('the hint is absent for a ready album', async () => {
      mockSummary = rated('n1');
      renderNone();
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('button', { name: 'Save and select for AOTY' });
      expect(screen.queryByText(/also needs a rating/)).toBeNull();
    });
  });

  describe('readiness still loading', () => {
    it('dialog: neutral busy Save, presses ignored, no hint; then the label is decided once and stays fixed', async () => {
      mockRatingsLoading = true;
      mockSummary = rated('n1');
      const view = renderNone();
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('dialog', { name: 'Add release date' });
      const busy = screen.getByRole('button', { name: 'Save' });
      expect(busy).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByText(/also needs a rating/)).toBeNull();
      typeDate('2024-03');
      // Valid input: busy by aria only, not disabled, and the press is ignored.
      expect(busy).not.toHaveAttribute('disabled');
      fireEvent.click(busy);
      expect(supabase.rpc).not.toHaveBeenCalled();

      // Settles as ready.
      mockRatingsLoading = false;
      view.rerender(<ContendersPage />);
      expect(
        await screen.findByRole('button', { name: 'Save and select for AOTY' })
      ).not.toHaveAttribute('aria-busy');
      // A refresh underneath (summary now empty, loading again) does not change the button.
      mockSummary = new Map();
      mockRatingsLoading = true;
      view.rerender(<ContendersPage />);
      expect(screen.getByRole('button', { name: 'Save and select for AOTY' })).toBeInTheDocument();
      mockRatingsLoading = false;
      view.rerender(<ContendersPage />);
      expect(screen.getByRole('button', { name: 'Save and select for AOTY' })).toBeInTheDocument();
      expect(screen.queryByText(/also needs a rating/)).toBeNull();
    });

    it('dialog: settles as not ready and only then shows the hint', async () => {
      stubGateLoading = true;
      const view = renderNone();
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('dialog', { name: 'Add release date' });
      expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByText(/also needs a rating/)).toBeNull();
      stubGateLoading = false;
      view.rerender(<ContendersPage />);
      expect(await screen.findByRole('button', { name: 'Save date' })).toBeInTheDocument();
      expect(screen.getByText(/also needs a rating and a settled score level/)).toBeInTheDocument();
    });

    it.each([
      ['ratings summary', () => (mockRatingsLoading = true)],
      [
        'calibration gate',
        () => {
          stubGateLoading = true;
          stubTier = 'none';
        },
      ],
    ])(
      'early click on a dated ready row (%s loading): no gate, no navigation, busy shown; selects once loaded',
      async (_n, setup) => {
        setup();
        mockItems = [album('a1', 'Alpha', '2025-03-01')];
        mockSummary = rated('a1');
        const view = render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
        fireEvent.click(rowButtons('Alpha')[0]);
        expect(loc()).toBe('/aoty/contenders');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(upsert).not.toHaveBeenCalled();
        // The ignored press makes the busy state visible at once, without disabling the button.
        expect(rowButtons('Alpha')[0]).toHaveAttribute('aria-busy', 'true');
        expect(rowButtons('Alpha')[0]).not.toHaveAttribute('disabled');

        mockRatingsLoading = false;
        stubGateLoading = false;
        stubTier = 'high';
        view.rerender(<ContendersPage />);
        await waitFor(() => expect(rowButtons('Alpha')[0]).not.toHaveAttribute('aria-busy'));
        fireEvent.click(rowButtons('Alpha')[0]);
        await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
        expect(loc()).toBe('/aoty/contenders');
      }
    );

    it('bulk press while loading is ignored, keeps the selection and shows busy', async () => {
      mockRatingsLoading = true;
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      mockSummary = rated('a1');
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Alpha/ }));
      await waitFor(() => screen.getByText('1 selected'));
      fireEvent.click(screen.getByRole('button', { name: 'Select for AOTY' }));
      expect(upsert).not.toHaveBeenCalled();
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(mockShowError).not.toHaveBeenCalled();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Select for AOTY' })).toHaveAttribute(
        'aria-busy',
        'true'
      );
    });

    it('a refresh after the first load does not make rows busy again', async () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      mockSummary = rated('a1');
      const view = render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      mockRatingsLoading = true;
      view.rerender(<ContendersPage />);
      fireEvent.click(rowButtons('Alpha')[0]);
      await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    });
  });

  describe('both row trees', () => {
    it('each tree has a button described by its own note; the mobile one opens the dialog', async () => {
      renderNone();
      const buttons = rowButtons('Delta');
      expect(buttons).toHaveLength(2);
      const ids = buttons.map((b) => b.getAttribute('aria-describedby'));
      expect(new Set(ids).size).toBe(2);
      ids.forEach((id) =>
        expect(document.getElementById(id!)).toHaveTextContent('No release date yet.')
      );
      // The accessible name does not change.
      expect(buttons[1]).toHaveAccessibleName(/^Select Delta .* for AOTY$/);
      fireEvent.click(buttons[1]);
      expect(await screen.findByRole('dialog', { name: 'Add release date' })).toBeInTheDocument();
    });

    it('a dated row has no description', () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      rowButtons('Alpha').forEach((b) => expect(b).not.toHaveAttribute('aria-describedby'));
    });

    it('selecting a ready dated row works from the mobile control', async () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      mockSummary = rated('a1');
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      fireEvent.click(rowButtons('Alpha')[1]);
      await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    });
  });

  describe('bulk', () => {
    it('all undated: only the skipped explanation, no "0 added", selection kept', async () => {
      renderNone();
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Delta/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Echo/ }));
      await waitFor(() => screen.getByText('2 selected'));
      fireEvent.click(screen.getByRole('button', { name: 'Select for AOTY' }));
      await waitFor(() => expect(mockShowError).toHaveBeenCalled());
      expect(mockShowError).toHaveBeenCalledWith(
        '2 skipped: not fully rated, no release date, or score level not settled.'
      );
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('mixed ready and not ready (same year): adds the ready ones, reports the rest, clears the selection', async () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01'), album('a2', 'Bravo', '2025-04-01')];
      mockSummary = rated('a1');
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Alpha/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Bravo/ }));
      await waitFor(() => screen.getByText('2 selected'));
      fireEvent.click(screen.getByRole('button', { name: 'Select for AOTY' }));
      await waitFor(() =>
        expect(mockShowSuccess).toHaveBeenCalledWith(
          '1 added to AOTY. 1 skipped: not fully rated, no release date, or score level not settled.'
        )
      );
      expect(screen.queryByText(/selected/)).toBeNull();
    });
  });

  describe('thrown rejections', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('rpc throws: error toast, dialog stays, control re-enabled, retry works', async () => {
      mockSummary = rated('n1');
      vi.mocked(supabase.rpc).mockRejectedValue(new Error('network down'));
      renderNone();
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('dialog', { name: 'Add release date' });
      typeDate('2024-03');
      fireEvent.click(await screen.findByRole('button', { name: 'Save and select for AOTY' }));
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not save release date. Try again.')
      );
      expect(warn).toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Add release date' })).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Save and select for AOTY' })
        ).not.toHaveAttribute('aria-busy')
      );
      vi.mocked(supabase.rpc).mockResolvedValue({ data: '2024-03', error: null } as never);
      fireEvent.click(screen.getByRole('button', { name: 'Save and select for AOTY' }));
      await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    });

    it('the chained select throws: error toast, the date stays saved', async () => {
      mockSummary = rated('n1');
      upsert.mockRejectedValue(new Error('network down'));
      renderNone();
      fireEvent.click(rowButtons('Delta')[0]);
      await screen.findByRole('dialog', { name: 'Add release date' });
      typeDate('2024-03');
      fireEvent.click(await screen.findByRole('button', { name: 'Save and select for AOTY' }));
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not add to AOTY — try again')
      );
      expect(mockSetReleaseDateLocal).toHaveBeenCalledWith('n1', '2024-03');
      expect(mockShowAction.mock.calls[0][0]).toBe('Saved Mar 2024 for Delta – Blackwater Park.');
      expect(warn).toHaveBeenCalled();
    });

    it('single select throws: error toast, no success, the row is not left busy', async () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      mockSummary = rated('a1');
      upsert.mockRejectedValue(new Error('network down'));
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      fireEvent.click(rowButtons('Alpha')[0]);
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not add to AOTY — try again')
      );
      expect(mockShowSuccess).not.toHaveBeenCalled();
      await waitFor(() => expect(rowButtons('Alpha')[0]).not.toHaveAttribute('aria-busy'));
    });

    it('bulk select throws: error toast, bulk controls re-enabled, selection kept', async () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      mockSummary = rated('a1');
      upsert.mockRejectedValue(new Error('network down'));
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Alpha/ }));
      await waitFor(() => screen.getByText('1 selected'));
      fireEvent.click(screen.getByRole('button', { name: 'Select for AOTY' }));
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not add to AOTY — try again')
      );
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Select for AOTY' })).not.toBeDisabled()
      );
    });

    const throwingDelete = () =>
      vi.mocked(supabase.from).mockImplementation(
        () =>
          ({
            delete: () => ({
              eq: () => ({
                eq: () => Promise.reject(new Error('network down')),
                in: () => Promise.reject(new Error('network down')),
              }),
            }),
          }) as unknown as ReturnType<typeof supabase.from>
      );

    it('single remove throws: error toast, no success, no refetch', async () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      throwingDelete();
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Contenders' })[0]);
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' })
      );
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not remove — try again')
      );
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(mockRefetch).not.toHaveBeenCalled();
    });

    it('bulk remove throws: error toast, bulk controls re-enabled, selection kept', async () => {
      mockItems = [album('a1', 'Alpha', '2025-03-01')];
      throwingDelete();
      render(<ContendersPage />, { wrapper: at('/aoty/contenders') });
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Alpha/ }));
      await waitFor(() => screen.getByText('1 selected'));
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not remove — try again')
      );
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled()
      );
    });
  });
});
