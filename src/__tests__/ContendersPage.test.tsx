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

let stubTier: 'none' | 'medium' | 'high' | 'very_high' = 'high';
let stubHasWeights = true;
vi.mock('../hooks/useCalibrationGate', () => ({
  useCalibrationGate: () => ({
    tier: stubTier,
    hasWeights: stubHasWeights,
    hasInsufficientData: false,
    loading: false,
  }),
  confidenceLabel: (tier: string) => tier,
}));

vi.mock('../hooks/useAlbumRatingsSummary', () => ({
  useAlbumRatingsSummary: () => ({ summary: new Map(), loading: false, refetch: vi.fn() }),
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
    stubTier = 'high';
    stubHasWeights = true;
    vi.mocked(supabase.from).mockImplementation(
      () => makeContendersDeleteChain() as unknown as ReturnType<typeof supabase.from>
    );
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
    // The checkbox only renders in the desktop tree (selectable is Contenders/desktop-only),
    // so this one is singular even though the row's text isn't.
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
    // Ark's checkbox machine dispatches CHECKED.SET asynchronously — the callback (and the
    // state update it drives) lands a tick after the click, not synchronously within it.
    await waitFor(() => screen.getByText('1 selected'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('1 removed from Contenders'));
  });

  it('shows the low-confidence banner when calibration tier is none', async () => {
    stubTier = 'none';
    render(<ContendersPage />, { wrapper });
    await waitFor(() => screen.getByText(/Score level: none/));
  });

  it('hides the low-confidence banner at a settled tier', async () => {
    stubTier = 'very_high';
    render(<ContendersPage />, { wrapper });
    await waitFor(() => expect(screen.getAllByText(/Opeth/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Score level:/)).not.toBeInTheDocument();
  });
});
