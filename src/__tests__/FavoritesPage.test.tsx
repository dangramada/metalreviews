// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { FavoritesPage } from '../FavoritesPage';
import theme from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

vi.mock('../hooks/useFavoritesList', () => ({
  useFavoritesList: vi.fn(),
}));

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({ user: { email: 'dan@test.com' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}));

import { useFavoritesList } from '../hooks/useFavoritesList';

const mockItem: FavoriteListItem = {
  id: 'rev1',
  type: 'review',
  band: 'Opeth',
  album: 'Blackwater Park',
  artworkUrl: 'https://example.com/art.jpg',
  releaseDate: '2001-03-16',
  genre: ['progressive metal', 'death metal'],
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('FavoritesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading', () => {
    vi.mocked(useFavoritesList).mockReturnValue({ items: [], loading: true, error: null });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when list is empty', () => {
    vi.mocked(useFavoritesList).mockReturnValue({ items: [], loading: false, error: null });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(/no favorites yet/i)).toBeInTheDocument();
    expect(screen.getByText(/heart an album/i)).toBeInTheDocument();
  });

  it('shows error message when loading fails', () => {
    vi.mocked(useFavoritesList).mockReturnValue({ items: [], loading: false, error: 'Supabase error' });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(/failed to load favorites/i)).toBeInTheDocument();
    expect(screen.queryByText(/no favorites yet/i)).not.toBeInTheDocument();
  });

  it('renders band and album for each item', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(/Opeth/)).toBeInTheDocument();
    expect(screen.getByText(/Blackwater Park/)).toBeInTheDocument();
  });

  it('renders the formatted release date', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('16 Mar 2001')).toBeInTheDocument();
  });

  it('renders genre tags', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('progressive metal')).toBeInTheDocument();
    expect(screen.getByText('death metal')).toBeInTheDocument();
  });

  it('does NOT render a score badge', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    // Score would be text like "9/10" — not rendered on this page
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
  });

  it('does NOT render a source badge', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByText('Angry Metal Guy')).not.toBeInTheDocument();
  });

  it('renders artwork thumbnail when artworkUrl is present', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
    expect(img).toHaveAttribute('alt', 'Opeth – Blackwater Park');
  });

  it('renders ♪ placeholder when artworkUrl is null', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [{ ...mockItem, artworkUrl: null }],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('♪')).toBeInTheDocument();
  });
});
