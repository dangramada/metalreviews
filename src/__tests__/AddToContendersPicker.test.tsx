// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { AddToContendersPicker } from '../components/AddToContendersPicker';
import system from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

let mockFavorites: FavoriteListItem[] = [];
vi.mock('../hooks/useFavoritesList', () => ({
  useFavoritesList: () => ({ items: mockFavorites, loading: false, error: null, refetch: vi.fn() }),
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

const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock('../supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({ insert: mockInsert })) },
}));

const mockItem: FavoriteListItem = {
  albumId: 'album1',
  band: 'Opeth',
  album: 'Blackwater Park',
  artworkUrl: null,
  releaseDate: '2024-03-16',
  genre: ['progressive metal'],
  publishedAt: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('AddToContendersPicker', () => {
  const onAdded = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFavorites = [mockItem];
  });

  it('lists favorites not already in Contenders', async () => {
    render(
      <AddToContendersPicker
        isOpen
        onClose={onClose}
        contenderAlbumIds={new Set()}
        onAdded={onAdded}
      />,
      { wrapper }
    );
    await waitFor(() => screen.getByText(/Opeth/));
  });

  it('excludes favorites already in Contenders', async () => {
    render(
      <AddToContendersPicker
        isOpen
        onClose={onClose}
        contenderAlbumIds={new Set(['album1'])}
        onAdded={onAdded}
      />,
      { wrapper }
    );
    await waitFor(() => screen.getByText(/already in Contenders/));
    expect(screen.queryByText(/Opeth/)).not.toBeInTheDocument();
  });

  it('bulk-inserts selected favorites into contenders and closes on confirm', async () => {
    render(
      <AddToContendersPicker
        isOpen
        onClose={onClose}
        contenderAlbumIds={new Set()}
        onAdded={onAdded}
      />,
      { wrapper }
    );
    await waitFor(() => screen.getByText(/Opeth/));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Opeth/ }));
    // Ark's checkbox machine dispatches CHECKED.SET asynchronously — wait for the button
    // label (driven by selected.size) to pick up the change before clicking it.
    await waitFor(() => screen.getByRole('button', { name: /Add 1 to Contenders/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add 1 to Contenders/ }));
    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith([{ user_id: 'user-abc', album_id: 'album1' }])
    );
    expect(mockShowSuccess).toHaveBeenCalledWith('Added 1 album to Contenders');
    expect(onAdded).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // Regression test — see FavoritesPage.test.tsx's identical describe block for why this checks
  // the actual <input> rather than relying on getByRole's name matching.
  it('puts aria-label on the hidden input itself, not just the wrapping label', async () => {
    render(
      <AddToContendersPicker
        isOpen
        onClose={onClose}
        contenderAlbumIds={new Set()}
        onAdded={onAdded}
      />,
      { wrapper }
    );
    await waitFor(() => screen.getByText(/Opeth/));
    // Chakra's DrawerContent portals to document.body, so it isn't under render()'s own
    // container — query the whole document, same as `screen`'s own queries already do.
    const input = document.querySelector('input[type="checkbox"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('aria-label', 'Select Opeth – Blackwater Park');
  });
});
