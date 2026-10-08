// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AotyHub } from '../AotyHub';
import system from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

let mockItems: FavoriteListItem[] = [];
let mockContendersError: string | null = null;
let mockContendersLoading = false;
vi.mock('../hooks/useContendersList', () => ({
  useContendersList: () => ({
    items: mockItems,
    loading: mockContendersLoading,
    error: mockContendersError,
    refetch: vi.fn(),
    addLocal: vi.fn(),
    setReleaseDateLocal: vi.fn(),
  }),
}));

let mockAotyIds: string[] = [];
vi.mock('../hooks/useAotyList', () => ({
  // Mirrors the real hook's derivation closely enough for layout tests.
  useAotyList: ({ pool, poolError }: { pool: FavoriteListItem[]; poolError: string | null }) => ({
    items: mockAotyIds.flatMap((id, i) => {
      const it = pool.find((p) => p.albumId === id);
      return it ? [{ ...it, createdAt: `2026-10-0${i + 1}` }] : [];
    }),
    aotyIds: new Set(mockAotyIds),
    idsLoading: false,
    loading: false,
    error: poolError,
    refetch: vi.fn(),
    addLocal: vi.fn(),
    removeLocal: vi.fn(),
  }),
}));

let mockHasWeights = true;
vi.mock('../hooks/useCalibrationGate', () => ({
  useCalibrationGate: () => ({
    tier: 'high',
    hasWeights: mockHasWeights,
    hasInsufficientData: false,
    loading: false,
  }),
  confidenceLabel: (t: string) => t,
}));

let mockRatingsLoading = false;
const summaryFor = (ids: string[]) =>
  new Map(
    ids.map((id, i) => [
      id,
      { score: 0.9 - i / 10, rank: i + 1, contributions: new Map<number, number>([[0, 1]]) },
    ])
  );
let mockSummary = new Map<
  string,
  { score: number; rank: number; contributions: Map<number, number> }
>();
vi.mock('../hooks/useAlbumRatingsSummary', () => ({
  useAlbumRatingsSummary: () => ({
    summary: mockSummary,
    criterionOrder: [0],
    loading: mockRatingsLoading,
    refetch: vi.fn(),
  }),
}));

vi.mock('../components/AddToContendersPicker', () => ({ AddToContendersPicker: () => null }));
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-abc', email: 'dan@test.com' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showAction: vi.fn() }),
}));
vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const album = (albumId: string, band: string): FavoriteListItem => ({
  albumId,
  band,
  album: `${band} LP`,
  artworkUrl: null,
  releaseDate: '2026-03-01',
  genre: [],
  publishedAt: null,
});

// Pool of 3: Alpha and Bravo are contenders, Charlie is an AOTY member.
function seed() {
  mockItems = [album('a', 'Alpha'), album('b', 'Bravo'), album('c', 'Charlie')];
  mockAotyIds = ['c'];
  mockSummary = summaryFor(['a', 'b', 'c']);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('AotyHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContendersError = null;
    mockContendersLoading = false;
    mockHasWeights = true;
    mockRatingsLoading = false;
    seed();
  });

  describe('two screens', () => {
    it('shows only AOTY on the aoty screen, with both trees per row', () => {
      render(<AotyHub screen="aoty" />, { wrapper });
      expect(screen.getByRole('heading', { name: 'AOTY' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Contenders' })).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Back to Contenders' })).toHaveLength(2);
    });

    it('shows only Contenders (with the bulk bar) on the contenders screen', () => {
      render(<AotyHub screen="contenders" />, { wrapper });
      expect(screen.getByRole('heading', { name: 'Contenders' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'AOTY' })).toBeNull();
      // Both trees mount (CSS picks one), so the row's control is there twice.
      expect(screen.getAllByRole('button', { name: /Select Alpha.*for AOTY/ })).toHaveLength(2);
      expect(screen.getByText('Select albums to add or remove several at once.')).toBeVisible();
    });

    it('picks the screen from ?view when none is forced', () => {
      const routed = ({ children }: { children: React.ReactNode }) => (
        <ChakraProvider value={system}>
          <MemoryRouter initialEntries={['/aoty?view=contenders']}>{children}</MemoryRouter>
        </ChakraProvider>
      );
      render(<AotyHub />, { wrapper: routed });
      expect(screen.getByRole('heading', { name: 'Contenders' })).toBeInTheDocument();
    });
  });

  describe('tabs', () => {
    const renderRouted = (entries: string[], index?: number) => {
      const router = createMemoryRouter([{ path: '/aoty', element: <AotyHub /> }], {
        initialEntries: entries,
        initialIndex: index,
      });
      const view = render(
        <ChakraProvider value={system}>
          <RouterProvider router={router} />
        </ChakraProvider>
      );
      return { router, ...view };
    };
    // Ark's tabs machine applies a click a tick later, so clicks go through act().
    const clickTab = async (name: RegExp) => {
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name }));
      });
    };

    it('defaults to the AOTY tab, and an unknown ?view falls back to it', () => {
      const first = renderRouted(['/aoty']);
      expect(screen.getByRole('tab', { name: /^AOTY/, selected: true })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'AOTY' })).toBeInTheDocument();
      first.unmount();
      renderRouted(['/aoty?view=bogus']);
      expect(screen.getByRole('tab', { name: /^AOTY/, selected: true })).toBeInTheDocument();
    });

    it('?view=contenders shows Contenders, and a forced screen wins over it', () => {
      const first = renderRouted(['/aoty?view=contenders']);
      expect(screen.getByRole('tab', { name: /^Contenders/, selected: true })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Contenders' })).toBeInTheDocument();
      first.unmount();
      const forced = ({ children }: { children: React.ReactNode }) => (
        <ChakraProvider value={system}>
          <MemoryRouter initialEntries={['/aoty?view=contenders']}>{children}</MemoryRouter>
        </ChakraProvider>
      );
      render(<AotyHub screen="aoty" />, { wrapper: forced });
      expect(screen.getByRole('tab', { name: /^AOTY/, selected: true })).toBeInTheDocument();
    });

    it('a tab click writes ?view with replace and keeps year and from', async () => {
      const { router } = renderRouted(['/aoty?year=2026&from=x']);
      await clickTab(/^Contenders/);
      await waitFor(() =>
        expect(router.state.location.search).toBe('?year=2026&from=x&view=contenders')
      );
      expect(router.state.historyAction).toBe('REPLACE');
      expect(screen.getByRole('heading', { name: 'Contenders' })).toBeInTheDocument();
    });

    it('puts the scoped counts in the tab names, and none while loading', () => {
      const first = renderRouted(['/aoty']);
      expect(screen.getByRole('tab', { name: 'AOTY 1' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Contenders 2' })).toBeInTheDocument();
      first.unmount();
      mockContendersLoading = true;
      renderRouted(['/aoty']);
      expect(screen.getByRole('tab', { name: 'AOTY' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Contenders' })).toBeInTheDocument();
    });

    it('counts follow the year scope', async () => {
      mockItems = mockItems.map((i) =>
        i.albumId === 'b' ? { ...i, releaseDate: '2025-03-01' } : i
      );
      renderRouted(['/aoty']);
      expect(screen.getByRole('tab', { name: 'AOTY 1' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Contenders 1' })).toBeInTheDocument();
      fireEvent.change(screen.getByRole('combobox', { name: 'Year' }), {
        target: { value: '2025' },
      });
      expect(screen.getByRole('tab', { name: 'AOTY 0' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Contenders 1' })).toBeInTheDocument();
    });

    it('the panel is the one tabpanel and is labelled by the active tab', async () => {
      renderRouted(['/aoty']);
      const labelled = (tabName: RegExp) => {
        const tab = screen.getByRole('tab', { name: tabName, selected: true });
        const panel = screen.getByRole('tabpanel');
        expect(tab.id).not.toBe('');
        expect(panel).toHaveAttribute('aria-labelledby', tab.id);
        expect(screen.getByRole('tabpanel', { name: tabName })).toBe(panel);
      };
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      labelled(/^AOTY/);
      await clickTab(/^Contenders/);
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      labelled(/^Contenders/);
    });

    describe('selection', () => {
      const selectAlpha = async () => {
        fireEvent.click(screen.getByRole('checkbox', { name: /Select Alpha/ }));
        await waitFor(() => screen.getByText('1 selected'));
      };

      it('is cleared by a tab switch, not brought back when returning', async () => {
        renderRouted(['/aoty?view=contenders']);
        await selectAlpha();
        await clickTab(/^AOTY/);
        await clickTab(/^Contenders/);
        expect(screen.queryByText('1 selected')).toBeNull();
        expect(screen.getByRole('checkbox', { name: /Select Alpha/ })).not.toBeChecked();
      });

      it('is cleared by a year change, not brought back when returning', async () => {
        mockItems = mockItems.map((i) =>
          i.albumId === 'b' ? { ...i, releaseDate: '2025-03-01' } : i
        );
        renderRouted(['/aoty?view=contenders']);
        await selectAlpha();
        const year = () => screen.getByRole('combobox', { name: 'Year' });
        fireEvent.change(year(), { target: { value: '2025' } });
        fireEvent.change(year(), { target: { value: '2026' } });
        expect(screen.queryByText('1 selected')).toBeNull();
        expect(screen.getByRole('checkbox', { name: /Select Alpha/ })).not.toBeChecked();
      });
    });

    describe('empty AOTY tab', () => {
      it('with Contenders not empty: points at the Contenders tab, and the button goes there', async () => {
        mockAotyIds = [];
        const { router } = renderRouted(['/aoty']);
        expect(screen.getByText('No AOTY picks yet.')).toBeInTheDocument();
        expect(screen.getByText('Choose albums from the Contenders tab.')).toBeInTheDocument();
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Go to Contenders' }));
        });
        await waitFor(() => expect(router.state.location.search).toBe('?view=contenders'));
        expect(screen.getByRole('heading', { name: 'Contenders' })).toBeInTheDocument();
      });

      it('with both lists empty: says Contenders comes first, with the same button', () => {
        mockItems = [];
        mockAotyIds = [];
        renderRouted(['/aoty']);
        expect(screen.getByText('No AOTY picks yet.')).toBeInTheDocument();
        expect(
          screen.getByText('Add albums to Contenders first, then choose from them here.')
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Go to Contenders' })).toBeInTheDocument();
      });
    });

    describe('browser Back while a dialog is open', () => {
      // History: /aoty, then /aoty?view=contenders. Going Back changes the tab under an open
      // dialog without the page's own tab handler; the dialog must go and must not come back.
      const backAndForward = async (router: ReturnType<typeof renderRouted>['router']) => {
        await act(async () => {
          await router.navigate(-1);
        });
        expect(screen.getByRole('heading', { name: 'AOTY' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();
        await act(async () => {
          await router.navigate(1);
        });
        expect(screen.getByRole('heading', { name: 'Contenders' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();
      };

      it('release-date dialog', async () => {
        mockItems = mockItems.map((i) => (i.albumId === 'a' ? { ...i, releaseDate: null } : i));
        const { router } = renderRouted(['/aoty', '/aoty?view=contenders&year=none'], 1);
        fireEvent.click(screen.getAllByRole('button', { name: /Select Alpha.*for AOTY/ })[0]);
        await screen.findByRole('dialog', { name: 'Add release date' });
        await backAndForward(router);
      });

      it('calibration gate dialog', async () => {
        mockHasWeights = false;
        mockSummary = new Map(); // unrated, so the row's button is Evaluate
        const { router } = renderRouted(['/aoty', '/aoty?view=contenders'], 1);
        fireEvent.click(screen.getAllByRole('button', { name: 'Evaluate this album' })[0]);
        await screen.findByRole('dialog');
        await backAndForward(router);
      });
    });
  });

  describe('genres', () => {
    // Both lists leave the genre tags out; the rows keep their title and release date.
    it.each(['aoty', 'contenders'] as const)('no genre tags on the %s screen', (name) => {
      mockItems = mockItems.map((i) => ({ ...i, genre: ['doom metal', 'sludge'] }));
      render(<AotyHub screen={name} />, { wrapper });
      expect(screen.getAllByText(/Alpha|Charlie/).length).toBeGreaterThan(0);
      expect(screen.queryByText('doom metal')).toBeNull();
      expect(screen.queryByText('sludge')).toBeNull();
    });
  });

  describe('a URL-driven tab change', () => {
    it('is followed, and the selection made on the other tab is not applied', async () => {
      const router = createMemoryRouter([{ path: '/aoty', element: <AotyHub /> }], {
        initialEntries: ['/aoty?view=contenders'],
      });
      render(
        <ChakraProvider value={system}>
          <RouterProvider router={router} />
        </ChakraProvider>
      );
      fireEvent.click(screen.getByRole('checkbox', { name: /Select Alpha/ }));
      await waitFor(() => screen.getByText('1 selected'));
      await act(async () => {
        await router.navigate('/aoty');
      });
      expect(screen.getByRole('heading', { name: 'AOTY' })).toBeInTheDocument();
      expect(screen.queryByText('1 selected')).toBeNull();
    });
  });
});
