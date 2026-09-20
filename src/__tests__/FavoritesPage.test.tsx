// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    rpc: vi.fn(),
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
// Flipped by the soft-gate tests below; every other test leaves it false, which is the
// pre-existing "brand new user" shape.
let stubHasCalibrationWeights = false;
// Drives useCalibrationGate's `tier` — null (the pre-existing default) means "no status row",
// which useCalibrationGate treats the same as tier 'none'. Set to a real tier string to test the
// no-gate-at-all path (hasWeights AND a tier past 'none').
let stubCalibrationTier: string | null = null;
// The two halves of the insufficient-data signal (useCalibrationGate): the live
// user_calibration_answers row count vs. the answer_count the persisted status row was written
// at. Equal by default, which is every healthy session; a live count BELOW the stored one is the
// post-Restart frozen window the signal exists to catch.
let stubLiveAnswerCount = 0;
let stubStatusAnswerCount = 0;

function stubCalibrationTable(table: string): unknown | undefined {
  if (table === 'user_calibration_status') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: stubCalibrationTier
              ? { tier: stubCalibrationTier, answer_count: stubStatusAnswerCount }
              : null,
            error: null,
          }),
        }),
      }),
    };
  }
  if (table === 'user_criterion_weights') {
    // Two different shapes hit this table: useAlbumRatingsSummary awaits `.select(...)`
    // directly, while useCalibrationGate's soft-gate check (2026-08-18) chains
    // `.select(...).eq(...).limit(1)`. The returned object is therefore both thenable and
    // chainable, so one stub serves both without either test caring which is which.
    const result = {
      data: stubHasCalibrationWeights ? [{ criterion_id: 0 }] : [],
      error: null,
    };
    const chain = {
      eq: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(result) }),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return { select: vi.fn().mockReturnValue(chain) };
  }
  if (table === 'user_calibration_answers') {
    // head:true count query — only `count` is read, never `data`.
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: stubLiveAnswerCount, error: null }),
      }),
    };
  }
  if (table === 'album_criteria_ratings') {
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
    stubHasCalibrationWeights = false;
    stubCalibrationTier = null;
    stubLiveAnswerCount = 0;
    stubStatusAnswerCount = 0;
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
    // FavoriteListItemRow mounts both a desktop and a mobile layout simultaneously
    // (CSS `@media` display:none toggles which is visible — see FavoritesPage.tsx),
    // so band/album text appears twice in the DOM regardless of viewport.
    expect(screen.getAllByText(/Opeth/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Blackwater Park/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the formatted release date', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    // Release date now carries the same "Release date: " label as the review card and
    // AlbumRatingPage desktop (design-system-audit-2026-08.md, Pass 4 unification).
    expect(
      screen.getAllByText(`Release date: 16 Mar ${currentYear}`).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders genre tags', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getAllByText('progressive metal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('death metal').length).toBeGreaterThanOrEqual(1);
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
    // Desktop and mobile layouts both mount (CSS-hidden, not conditionally rendered) and
    // now request the same thumbnail size — 250px — since the mobile compact redesign
    // (favorites-row-mobile-compact-redesign) dropped the 500px request to match desktop.
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(2);
    const srcs = imgs.map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['https://example.com/art-250.jpg', 'https://example.com/art-250.jpg']);
    imgs.forEach((img) => expect(img).toHaveAttribute('alt', 'Opeth – Blackwater Park'));
  });

  it('renders ♪ placeholder when artworkUrl is null', () => {
    vi.mocked(useFavoritesList).mockReturnValue(
      mockHookReturn({ items: [{ ...mockItem, artworkUrl: null }] })
    );
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // One placeholder each for the desktop and mobile layouts.
    expect(screen.getAllByText('♪')).toHaveLength(2);
  });

  it('renders year dropdown with current year and All years options', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('All years')).toBeInTheDocument();
    // Current year appears at least once (the option itself)
    expect(screen.getAllByText(String(currentYear)).length).toBeGreaterThanOrEqual(1);
  });

  it('renders a Listen button that opens a menu with all four platform links', async () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });

    // Desktop and mobile trees both mount (see the row's own comment on that); take the
    // first — same convention as the Evaluate/Remove button queries above.
    const trigger = screen.getAllByRole('button', { name: 'Listen on a streaming platform' })[0];
    // Chakra's Ark-UI-based Menu opens on pointer interaction, not a bare `click` event —
    // jsdom needs the full pointerdown/pointerup/click sequence a real click produces.
    fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(trigger, { button: 0, pointerId: 1 });
    fireEvent.click(trigger);

    const bandcampLink = await screen.findByRole('menuitem', { name: /Bandcamp/i });
    expect(bandcampLink).toHaveAttribute(
      'href',
      'https://bandcamp.com/search?q=Opeth%20Blackwater%20Park'
    );
    expect(screen.getByRole('menuitem', { name: /Spotify/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /YouTube Music/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Deezer/i })).toBeInTheDocument();
  });

  it('orders the footer buttons Evaluate, Listen, Remove', () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });

    // Desktop tree's buttons (mobile mounts the same three, hidden via CSS in jsdom).
    const names = screen
      .getAllByRole('button')
      .map((btn) => btn.getAttribute('aria-label'))
      .filter((label): label is string => !!label && /Evaluate|Listen|Remove/.test(label));
    expect(names.slice(0, 3)).toEqual([
      'Evaluate this album',
      'Listen on a streaming platform',
      'Remove from favorites',
    ]);
  });

  // Hard vs soft gate (terminology-and-gate-unification). The hard gate still keys off
  // hasWeights alone, not tier — see useCalibrationGate's hasWeights comment for why: under
  // degree-tied tiers a user can answer ninety questions and still be tier 'none', so gating on
  // tier directly would nudge someone who has clearly already started.
  it('shows the hard gate when the user has no calibration weights at all', async () => {
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });

    // The gate's own fetch has to settle first: handleRate no-ops while it is loading, so
    // clicking too early would make BOTH gate tests pass for the wrong reason.
    await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: /Evaluate this album/i })[0]);
    expect(await screen.findByText(/Answer a few comparisons first/i)).toBeTruthy();
    // Hard gate is blocking: no "Evaluate Album" bypass button.
    expect(screen.queryByRole('button', { name: 'Evaluate Album' })).toBeNull();
  });

  it('shows the soft gate for a user who has weights but is still on the base tier', async () => {
    stubHasCalibrationWeights = true;
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });

    // The stubbed status row is absent, so the tier is 'none' — exactly the combination the
    // soft gate targets.
    await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: /Evaluate this album/i })[0]);
    expect(await screen.findByText(/Keep going for a steadier score/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Evaluate Album' })).toBeTruthy();
  });

  it('does NOT gate a user who has weights and has passed the base tier', async () => {
    stubHasCalibrationWeights = true;
    stubCalibrationTier = 'high';
    vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [mockItem] }));
    render(<FavoritesPage />, { wrapper });

    await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: /Evaluate this album/i })[0]);
    expect(screen.queryByText(/Answer a few comparisons first/i)).toBeNull();
    expect(screen.queryByText(/Keep going for a steadier score/i)).toBeNull();
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

  describe('existingMatch with no release date (Fix: RPC for existingMatch date fill)', () => {
    const existingAlbumRowNoDate = { ...existingAlbumRow, release_date: null };

    function makeSupabaseFromNoDate(
      favoritesInsert = vi.fn().mockResolvedValue({ data: null, error: null })
    ) {
      return (table: string) => {
        const calibrationStub = stubCalibrationTable(table);
        if (calibrationStub) return calibrationStub;
        if (table === 'albums') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: existingAlbumRowNoDate, error: null }),
              }),
            }),
            insert: vi.fn(),
          };
        }
        if (table === 'favorites') return { insert: favoritesInsert };
        throw new Error(`unexpected table ${table}`);
      };
    }

    it('requires a manual date and renders the date input for a no-date existingMatch', async () => {
      vi.mocked(supabase.from).mockImplementation(makeSupabaseFromNoDate());
      vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [] }));
      render(<FavoritesPage />, { wrapper });
      await openDrawerAndLookUp();

      expect(screen.getByPlaceholderText('e.g. 2024, 2024-03, or 2024-03-15')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    });

    it('calls fill_missing_release_date before favoriting once a manual date is entered', async () => {
      const favoritesInsert = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.from).mockImplementation(makeSupabaseFromNoDate(favoritesInsert));
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
      vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [] }));
      render(<FavoritesPage />, { wrapper });
      await openDrawerAndLookUp();

      fireEvent.change(screen.getByPlaceholderText('e.g. 2024, 2024-03, or 2024-03-15'), {
        target: { value: '2019' },
      });

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).not.toBeDisabled();
      fireEvent.click(confirmButton);

      await waitFor(() =>
        expect(supabase.rpc).toHaveBeenCalledWith('fill_missing_release_date', {
          p_album_id: 'existing-album-1',
          p_release_date: '2019',
        })
      );
      expect(favoritesInsert).toHaveBeenCalledWith({
        user_id: 'user-abc',
        album_id: 'existing-album-1',
      });
    });

    it('shows an error and does not favorite when fill_missing_release_date fails', async () => {
      const favoritesInsert = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.from).mockImplementation(makeSupabaseFromNoDate(favoritesInsert));
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } });
      vi.mocked(useFavoritesList).mockReturnValue(mockHookReturn({ items: [] }));
      render(<FavoritesPage />, { wrapper });
      await openDrawerAndLookUp();

      fireEvent.change(screen.getByPlaceholderText('e.g. 2024, 2024-03, or 2024-03-15'), {
        target: { value: '2019' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Could not save release date — try again')
      );
      expect(favoritesInsert).not.toHaveBeenCalled();
    });
  });
});
