// src/__tests__/App.favorites.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import App from '../App';
import system from '../theme';

const mockShowAction = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showAction: mockShowAction,
  }),
}));

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

// Minimal AlbumWithReviewsRow shape matching the columns App reads via fromAlbumWithReviews
// (post-album-identity-migration: albums joined to a nested reviews array).
const mockAlbumRow = {
  id: 'album1',
  band: 'Opeth',
  album: 'Blackwater Park',
  genre: ['progressive metal'],
  artwork_url: null,
  release_date: null,
  created_at: '2006-01-01T00:00:00Z',
  reviews: [
    {
      id: 'rev1',
      source: 'Angry Metal Guy',
      score: '9/10',
      normalized_score: 90,
      summary: 'A classic.',
      url: 'https://example.com',
      published_at: '2006-01-01T00:00:00Z',
      published_date: '1 Jan 2006',
    },
  ],
};

// Returns a plain function suitable for mockImplementation(). Builds a chain
// that matches the call shapes used by App.tsx:
//   albums:    .from('albums').select(...).order(...).then(cb)
//   favorites: .from('favorites').select('album_id').then(cb)
//              .from('favorites').insert({...})
//              .from('favorites').delete().eq(...).eq(...)
function makeFromImpl(
  options: {
    albumsData?: (typeof mockAlbumRow)[];
    favoritesData?: { album_id: string }[];
    insertError?: { message: string } | null;
    deleteError?: { message: string } | null;
  } = {}
) {
  const {
    albumsData = [mockAlbumRow],
    favoritesData = [],
    insertError = null,
    deleteError = null,
  } = options;

  return (table: string) => {
    if (table === 'albums') {
      const result = { data: albumsData, error: null };
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            then: (cb: (v: unknown) => unknown) => Promise.resolve(result).then(cb),
          }),
        }),
      };
    }
    if (table === 'favorites') {
      const selectResult = { data: favoritesData, error: null };
      return {
        select: vi.fn().mockReturnValue({
          then: (cb: (v: unknown) => unknown) => Promise.resolve(selectResult).then(cb),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: insertError }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: deleteError }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        then: (cb: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(cb),
      }),
    };
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('App favorites — logged out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
  });

  it('shows an action toast when a logged-out user clicks a heart', async () => {
    render(<App />, { wrapper });
    // Band name appears inside "Opeth – Blackwater Park", so use partial match
    await waitFor(() => screen.getByText(/Opeth/));
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(mockShowAction).toHaveBeenCalledWith(
      'Log in to save favorites',
      expect.objectContaining({ label: 'Log in' })
    );
  });

  it('hides the favorites switch when logged out', async () => {
    render(<App />, { wrapper });
    await waitFor(() => screen.getByText(/Opeth/));
    expect(screen.queryByLabelText(/favorites only/i)).not.toBeInTheDocument();
  });
});

describe('App favorites — logged in', () => {
  const mockUser = { id: 'user1', email: 'dan@test.com' } as unknown as User;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false });
  });

  it('shows a filled heart for a favorited review on load', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesData: [{ album_id: 'album1' }] })
    );
    render(<App />, { wrapper });
    await waitFor(() => screen.getByRole('button', { name: 'Remove from favorites' }));
  });

  it('fills the heart and shows success toast after a successful favorite', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
    render(<App />, { wrapper });
    await waitFor(() => screen.getByRole('button', { name: 'Add to favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Added to favorites'));
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });

  it('unfills the heart and shows success toast after a successful unfavorite', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesData: [{ album_id: 'album1' }] })
    );
    render(<App />, { wrapper });
    await waitFor(() => screen.getByRole('button', { name: 'Remove from favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Removed from favorites'));
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  });

  it('shows an error toast and leaves heart unchanged when insert fails', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ insertError: { message: 'DB error' } })
    );
    render(<App />, { wrapper });
    await waitFor(() => screen.getByRole('button', { name: 'Add to favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  });
});

describe('App album cards — review-count branching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
  });

  it('degrades sensibly for a manually-added album with zero attached reviews', async () => {
    const zeroReviewAlbum = {
      ...mockAlbumRow,
      id: 'album-manual',
      band: 'Manual Band',
      album: 'Manual Album',
      reviews: [],
    };
    vi.mocked(supabase.from).mockImplementation(makeFromImpl({ albumsData: [zeroReviewAlbum] }));
    render(<App />, { wrapper });
    await waitFor(() => screen.getByText(/Manual Band/));

    // No source badge, no average-score badge, no per-source review lines — just album
    // info. The heart toggle is still present and functional even with no review data.
    expect(screen.queryByText('Angry Metal Guy')).not.toBeInTheDocument();
    expect(screen.queryByText('9/10', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  });

  it('renders the original single-review layout for an album with exactly one attached review', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
    render(<App />, { wrapper });
    await waitFor(() => screen.getByText(/Opeth/));

    // Summary excerpt and its single review-date line — not the per-source <li> list.
    expect(screen.getByText('A classic.')).toBeInTheDocument();
    expect(screen.getByText('1 Jan 2006')).toBeInTheDocument();
    // Single source badge (not a wrapped multi-badge row).
    expect(screen.getByText('Angry Metal Guy', { selector: 'span' })).toBeInTheDocument();
    // Score slab. Design-system pass 3 replaced the single-string score badge ("9/10", the
    // raw source string) with a two-node slab driven by normalized_score: the number on the
    // /10 scale plus a separate "/10" denominator. This album's normalized_score is 90, so
    // it renders "9.0" — the same grade, just normalised and split across two elements.
    expect(screen.getByText('9.0', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('/10', { selector: 'span' })).toBeInTheDocument();
    // No per-source "[see review]" line — that's the 2+ review layout only.
    expect(screen.queryByText('[see review]')).not.toBeInTheDocument();
    // The whole card links out to the single review's url.
    const cardLink = screen.getByText(/Opeth/).closest('a');
    expect(cardLink).toHaveAttribute('href', 'https://example.com');
  });

  it('renders every attached review as its own line with the correct average score badge', async () => {
    const multiReviewAlbum = {
      ...mockAlbumRow,
      id: 'album-multi',
      band: 'Multi Band',
      album: 'Multi Album',
      reviews: [
        {
          id: 'rev-lower',
          source: 'Metal Storm',
          score: '7/10',
          normalized_score: 70,
          summary: 'Decent.',
          url: 'https://example.com/lower',
          published_at: '2006-02-01T00:00:00Z',
          published_date: '1 Feb 2006',
        },
        {
          id: 'rev-higher',
          source: 'Angry Metal Guy',
          score: '9/10',
          normalized_score: 90,
          summary: 'A classic.',
          url: 'https://example.com/higher',
          published_at: '2006-01-01T00:00:00Z',
          published_date: '1 Jan 2006',
        },
      ],
    };
    vi.mocked(supabase.from).mockImplementation(makeFromImpl({ albumsData: [multiReviewAlbum] }));
    render(<App />, { wrapper });
    await waitFor(() => screen.getByText(/Multi Band/));

    // Both source badges render (over the artwork), stacked/wrapped rather than collapsed
    // to one representative review.
    expect(screen.getByText('Metal Storm', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Angry Metal Guy', { selector: 'span' })).toBeInTheDocument();

    // Average of 70 and 90 (normalized 0–100) is 80 -> "8.0" on the /10 display scale.
    expect(screen.getByText('8.0')).toBeInTheDocument();

    // Per-source lines: each review's own score/date, linking to its own url.
    expect(screen.getByText(/Metal Storm: 7\/10 — 1 Feb 2006/)).toBeInTheDocument();
    expect(screen.getByText(/Angry Metal Guy: 9\/10 — 1 Jan 2006/)).toBeInTheDocument();
    const lowerLink = screen.getAllByText('[see review]')[0].closest('a');
    expect(lowerLink).toHaveAttribute('href', 'https://example.com/lower');

    // No card-level outbound link with multiple reviews — only the per-source lines link out.
    expect(screen.getByText(/Multi Band/).closest('a')).toBeNull();
  });

  it('queries albums with an inner join on reviews, excluding zero-review albums at the DB level', async () => {
    const selectSpy = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        then: (cb: (v: unknown) => unknown) =>
          Promise.resolve({ data: [mockAlbumRow], error: null }).then(cb),
      }),
    });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'albums') return { select: selectSpy };
      return makeFromImpl()(table);
    });
    render(<App />, { wrapper });
    await waitFor(() => screen.getByText(/Opeth/));

    // reviews!inner forces PostgREST to only return albums with at least one matching
    // review — this is what keeps zero-review manually-added albums off the home page.
    expect(selectSpy).toHaveBeenCalledWith(expect.stringContaining('reviews!inner('));
  });
});
