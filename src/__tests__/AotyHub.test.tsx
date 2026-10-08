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
vi.mock('../hooks/useContendersList', () => ({
  useContendersList: () => ({
    items: mockItems,
    loading: false,
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

vi.mock('../hooks/useCalibrationGate', () => ({
  useCalibrationGate: () => ({
    tier: 'high',
    hasWeights: true,
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

    it('picks the screen from the URL path when none is forced', () => {
      const routed = ({ children }: { children: React.ReactNode }) => (
        <ChakraProvider value={system}>
          <MemoryRouter initialEntries={['/aoty/contenders']}>{children}</MemoryRouter>
        </ChakraProvider>
      );
      render(<AotyHub />, { wrapper: routed });
      expect(screen.getByRole('heading', { name: 'Contenders' })).toBeInTheDocument();
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

  describe('state survives the route change', () => {
    it('keeps the selection when switching /aoty <-> /aoty/contenders (same component type)', async () => {
      const Guard = ({ children }: { children: React.ReactNode }) => <>{children}</>;
      const router = createMemoryRouter(
        [
          {
            path: '/aoty',
            element: (
              <Guard>
                <AotyHub />
              </Guard>
            ),
          },
          {
            path: '/aoty/contenders',
            element: (
              <Guard>
                <AotyHub />
              </Guard>
            ),
          },
        ],
        { initialEntries: ['/aoty/contenders'] }
      );
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
      expect(screen.queryByText('1 selected')).toBeNull(); // the bar is not on the AOTY screen
      await act(async () => {
        await router.navigate('/aoty/contenders');
      });
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });
  });
});
