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
  useAuth: vi.fn().mockReturnValue({ user: { id: 'user-abc', email: 'dan@test.com' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}));

import { useFavoritesList } from '../hooks/useFavoritesList';

// Use current year so items survive the default year filter
const currentYear = new Date().getFullYear();

const mockItem: FavoriteListItem = {
  id: 'rev1',
  type: 'review',
  band: 'Opeth',
  album: 'Blackwater Park',
  artworkUrl: 'https://example.com/art.jpg',
  releaseDate: `${currentYear}-03-16`,
  genre: ['progressive metal', 'death metal'],
  publishedAt: `${currentYear}-01-01T00:00:00Z`,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

// Convenience: build a mock return value that includes refetch
function mockHookReturn(overrides: Partial<ReturnType<typeof useFavoritesList>>) {
  return { items: [], loading: false, error: null, refetch: vi.fn(), ...overrides };
}

describe('FavoritesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ loading: true }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows year-scoped empty state when list is empty', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [] }));
    render(<FavoritesPage />, { wrapper });
    // Default year is current year, so the year-specific message is shown
    expect(screen.getByText(new RegExp(`no favorites for ${currentYear} yet`, 'i'))).toBeInTheDocument();
  });

  it('shows error message when loading fails', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ error: 'Supabase error' }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(/failed to load favorites/i)).toBeInTheDocument();
    expect(screen.queryByText(/no favorites/i)).not.toBeInTheDocument();
  });

  it('renders band and album for each item', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(/Opeth/)).toBeInTheDocument();
    expect(screen.getByText(/Blackwater Park/)).toBeInTheDocument();
  });

  it('renders the formatted release date', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(`16 Mar ${currentYear}`)).toBeInTheDocument();
  });

  it('renders genre tags', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('progressive metal')).toBeInTheDocument();
    expect(screen.getByText('death metal')).toBeInTheDocument();
  });

  it('does NOT render a score badge', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
  });

  it('does NOT render a source badge', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByText('Angry Metal Guy')).not.toBeInTheDocument();
  });

  it('renders artwork thumbnail when artworkUrl is present', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
    expect(img).toHaveAttribute('alt', 'Opeth – Blackwater Park');
  });

  it('renders ♪ placeholder when artworkUrl is null', () => {
    vi.mocked(useFavoritesList).mockReturnValue(
      mockHookReturn({ items: [{ ...mockItem, artworkUrl: null }] })
    );
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('♪')).toBeInTheDocument();
  });

  it('renders year dropdown with current year and All years options', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('All years')).toBeInTheDocument();
    // Current year appears at least once (the option itself)
    expect(screen.getAllByText(String(currentYear)).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the + Add album button', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn());
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('+ Add album')).toBeInTheDocument();
  });
});
