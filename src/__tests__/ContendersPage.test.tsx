// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ContendersPage } from '../ContendersPage';
import system from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

// ContendersPage's own hook dependencies are mocked directly (rather than the raw supabase
// tables underneath them) — same reasoning FavoritesPage.test.tsx gives for stubbing the
// calibration tables: these hooks' own internals are already covered by their own test files,
// so a ContendersPage test only needs to exercise ContendersPage's own logic.
const mockRefetch = vi.fn();
const mockAddContendersLocal = vi.fn();
let mockItems: FavoriteListItem[] = [];
vi.mock('../hooks/useContendersList', () => ({
  useContendersList: () => ({
    items: mockItems,
    loading: false,
    error: null,
    refetch: mockRefetch,
    addLocal: mockAddContendersLocal,
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

  it('carries the scope in the AOTY link', () => {
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=2024') });
    fireEvent.click(screen.getByRole('button', { name: 'AOTY →' }));
    expect(loc()).toBe('/aoty?year=2024');
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

  it('shows a visible reason and no promotion for an undated contender in the no-year scope', () => {
    mockSummary = new Map([
      ['n1', { score: 0.8, rank: 1, contributions: new Map<number, number>() }],
    ]);
    render(<ContendersPage />, { wrapper: at('/aoty/contenders?year=none') });
    expect(year().value).toBe('none');
    expect(screen.getAllByText(/Delta/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('No release date yet.').length).toBeGreaterThan(0);
    const btns = screen.getAllByRole('button', { name: /Select Delta .* for AOTY/ });
    btns.forEach((b) => {
      expect(b).toBeDisabled();
      fireEvent.click(b);
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('says no contenders without a release year when that scope is empty', () => {
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
