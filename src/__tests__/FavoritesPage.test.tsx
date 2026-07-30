// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { FavoritesPage } from '../FavoritesPage';
import system from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

vi.mock('../hooks/useFavoritesList', () => ({
  useFavoritesList: vi.fn(),
}));

vi.mock('../AuthContext', () => ({
  useAuth: vi
    .fn()
    .mockReturnValue({ user: { id: 'user-abc', email: 'dan@test.com' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
    from: vi.fn(),
  },
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

import { useFavoritesList } from '../hooks/useFavoritesList';
import { supabase } from '../supabaseClient';

// Use current year so items survive the default year filter
const currentYear = new Date().getFullYear();

const mockItem: FavoriteListItem = {
  albumId: 'album1',
  band: 'Opeth',
  album: 'Blackwater Park',
  artworkUrl: 'https://example.com/art.jpg',
  releaseDate: `${currentYear}-03-16`,
  genre: ['progressive metal', 'death metal'],
  publishedAt: `${currentYear}-01-01T00:00:00Z`,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

// Criteria Calibration part 6 (useCalibrationGate, useAlbumRatingsSummary) queries these
// tables on every FavoritesPage mount, unrelated to whatever a given test is actually
// exercising — stub them to benign empty responses so every test's supabase.from mock can
// stay focused on its own flow. Module-scoped so both the plain-render tests (which never
// touch supabase directly) and the AddAlbumDrawer tests (which set their own richer mocks)
// can use it.
function stubCalibrationTable(table: string): unknown | undefined {
  if (table === 'user_calibration_status') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi
          .fn()
          .mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
    };
  }
  if (table === 'album_criteria_ratings' || table === 'user_criterion_weights') {
    return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
  }
  return undefined;
}

// Convenience: build a mock return value that includes refetch
function mockHookReturn(overrides: Partial<ReturnType<typeof useFavoritesList>>) {
  return { items: [], loading: false, error: null, refetch: vi.fn(), ...overrides };
}

describe('FavoritesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const calibrationStub = stubCalibrationTable(table);
      if (calibrationStub) return calibrationStub;
      throw new Error(`unexpected table ${table}`);
    });
  });

  it('shows a spinner while loading', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ loading: true }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows year-scoped empty state when list is empty', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [] }));
    render(<FavoritesPage />, { wrapper });
    // Default year is current year, so the year-specific message is shown
    expect(
      screen.getByText(new RegExp(`no favorites for ${currentYear} yet`, 'i'))
    ).toBeInTheDocument();
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
    expect(img).toHaveAttribute('src', 'https://example.com/art-250.jpg');
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

describe('AddAlbumDrawer — existing-album match scoping (Item 1)', () => {
  const existingAlbumRow = {
    id: 'existing-album-1',
    band: 'Opeth',
    album: 'Blackwater Park',
    artwork_url: 'https://example.com/art.jpg',
    genre: ['progressive metal'],
    release_date: '2001-03-16',
  };

  // Mirrors the shape returned by /api/manual-album-lookup.
  const lookupResponse = {
    artworkUrl: 'https://example.com/fresh.jpg',
    genre: ['progressive metal'],
    releaseDate: '2001-03-16',
    releaseGroupId: 'mb-release-group-123',
  };

  function makeSupabaseFrom(
    favoritesInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  ) {
    return (table: string) => {
      const calibrationStub = stubCalibrationTable(table);
      if (calibrationStub) return calibrationStub;
      if (table === 'albums') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingAlbumRow, error: null }),
            }),
          }),
          insert: vi.fn(),
        };
      }
      if (table === 'favorites') {
        return { insert: favoritesInsert };
      }
      throw new Error(`unexpected table ${table}`);
    };
  }

  async function openDrawerAndLookUp() {
    fireEvent.click(screen.getByText('+ Add album'));
    // The drawer mounts into a Portal and its open transition settles asynchronously
    // (Ark UI's dialog machine) — wait for the band input rather than asserting right away.
    const bandInput = await waitFor(() => screen.getByPlaceholderText('e.g. Opeth'));
    fireEvent.change(bandInput, { target: { value: 'Opeth' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Blackwater Park'), {
      target: { value: 'Blackwater Park' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByText('Preview'));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => lookupResponse })
    );
    // This Node/jsdom combination doesn't wire up a working global `localStorage`
    // (Node's own experimental stub shadows jsdom's) — stub an in-memory one so the
    // drawer's draft-persistence effects (unrelated to what these tests cover) don't throw.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("finds an existing album's row via mb_release_group_id with no created_by/user_id scoping", async () => {
    // The mock chain only implements select().eq().maybeSingle() — the exact same shape
    // asserted directly against findExistingAlbum() in findExistingAlbum.test.ts. There is
    // no second .eq() call and no user-scoping column anywhere in this chain: the query is
    // unconditionally cross-user, as required (see
    // docs/decisions/album-identity-visibility-and-duplicate-fix.md).
    const eqSpy = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: existingAlbumRow, error: null }),
    });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const calibrationStub = stubCalibrationTable(table);
      if (calibrationStub) return calibrationStub;
      if (table === 'albums') return { select: vi.fn().mockReturnValue({ eq: eqSpy }) };
      if (table === 'favorites')
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [] }));
    render(<FavoritesPage />, { wrapper });
    await openDrawerAndLookUp();

    expect(eqSpy).toHaveBeenCalledWith('mb_release_group_id', 'mb-release-group-123');
    expect(eqSpy).toHaveBeenCalledTimes(1);
  });

  it('favorites an existing album the user has not yet favorited, without creating a duplicate albums row', async () => {
    const albumsInsert = vi.fn();
    const favoritesInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const calibrationStub = stubCalibrationTable(table);
      if (calibrationStub) return calibrationStub;
      if (table === 'albums') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingAlbumRow, error: null }),
            }),
          }),
          insert: albumsInsert,
        };
      }
      if (table === 'favorites') return { insert: favoritesInsert };
      throw new Error(`unexpected table ${table}`);
    });
    // This user has no favorites yet — the match is a genuinely new favorite for them.
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [] }));
    render(<FavoritesPage />, { wrapper });
    await openDrawerAndLookUp();

    // No "already exists" notice for this case — the user doesn't need to know or care that
    // the album row already existed; the preview just shows the album info.
    expect(screen.queryByText('Already in your favorites')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(favoritesInsert).toHaveBeenCalledWith({
        user_id: 'user-abc',
        album_id: 'existing-album-1',
      })
    );
    expect(albumsInsert).not.toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalledWith('Opeth – Blackwater Park added to favorites');
  });

  it('treats confirming an already-favorited existing album as a no-op', async () => {
    const favoritesInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockImplementation(makeSupabaseFrom(favoritesInsert));
    // This user already has `existing-album-1` favorited.
    vi.mocked(useFavoritesList).mockReturnValue(
      mockHookReturn({
        items: [
          {
            albumId: 'existing-album-1',
            band: 'Opeth',
            album: 'Blackwater Park',
            artworkUrl: null,
            releaseDate: '2001-03-16',
            genre: [],
            publishedAt: null,
          },
        ],
      })
    );
    render(<FavoritesPage />, { wrapper });
    await openDrawerAndLookUp();

    expect(screen.getByText('Already in your favorites')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Opeth – Blackwater Park is already in your favorites'
      )
    );
    expect(favoritesInsert).not.toHaveBeenCalled();
  });
});
