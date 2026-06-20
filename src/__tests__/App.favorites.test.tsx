// src/__tests__/App.favorites.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import theme from '../theme';

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
  AuthProvider: ({ children }: any) => children,
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

// Minimal DbRow shape matching the columns App reads via fromDbRow
const mockDbRow = {
  id: 'rev1',
  source: 'Angry Metal Guy',
  band: 'Opeth',
  album: 'Blackwater Park',
  genre: ['progressive metal'],
  score: '9/10',
  summary: 'A classic.',
  url: 'https://example.com',
  published_at: '2006-01-01T00:00:00Z',
  published_date: '1 Jan 2006',
  normalized_score: 90,
  artwork_url: null,
};

// Returns a plain function suitable for mockImplementation(). Builds a chain
// that matches the call shapes used by App.tsx:
//   reviews:   .from('reviews').select('*').order(...).then(cb)
//   favorites: .from('favorites').select('review_id').then(cb)
//              .from('favorites').insert({...})
//              .from('favorites').delete().eq(...).eq(...)
function makeFromImpl(options: {
  reviewsData?: typeof mockDbRow[];
  favoritesData?: { review_id: string }[];
  insertError?: { message: string } | null;
  deleteError?: { message: string } | null;
} = {}) {
  const {
    reviewsData = [mockDbRow],
    favoritesData = [],
    insertError = null,
    deleteError = null,
  } = options;

  return (table: string) => {
    if (table === 'reviews') {
      const result = { data: reviewsData, error: null };
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            then: (cb: any) => Promise.resolve(result).then(cb),
          }),
        }),
      };
    }
    if (table === 'favorites') {
      const selectResult = { data: favoritesData, error: null };
      return {
        select: vi.fn().mockReturnValue({
          then: (cb: any) => Promise.resolve(selectResult).then(cb),
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
        then: (cb: any) => Promise.resolve({ data: null, error: null }).then(cb),
      }),
    };
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
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
  const mockUser = { id: 'user1', email: 'dan@test.com' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false });
  });

  it('shows the favorites switch when logged in', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
    render(<App />, { wrapper });
    await waitFor(() => screen.getByText(/Opeth/));
    expect(screen.getByLabelText(/favorites only/i)).toBeInTheDocument();
  });

  it('shows a filled heart for a favorited review on load', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesData: [{ review_id: 'rev1' }] })
    );
    render(<App />, { wrapper });
    await waitFor(() =>
      screen.getByRole('button', { name: 'Remove from favorites' })
    );
  });

  it('fills the heart and shows success toast after a successful favorite', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
    render(<App />, { wrapper });
    await waitFor(() => screen.getByRole('button', { name: 'Add to favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(() =>
      expect(mockShowSuccess).toHaveBeenCalledWith('Added to favorites')
    );
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });

  it('unfills the heart and shows success toast after a successful unfavorite', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesData: [{ review_id: 'rev1' }] })
    );
    render(<App />, { wrapper });
    await waitFor(() => screen.getByRole('button', { name: 'Remove from favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));
    await waitFor(() =>
      expect(mockShowSuccess).toHaveBeenCalledWith('Removed from favorites')
    );
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

  it('filters the grid to only favorited reviews when the switch is toggled', async () => {
    const anotherRow = {
      ...mockDbRow,
      id: 'rev2',
      band: 'Metallica',
      album: 'Master of Puppets',
    };
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        reviewsData: [mockDbRow, anotherRow],
        favoritesData: [{ review_id: 'rev1' }],
      })
    );
    render(<App />, { wrapper });
    // Band names appear inside "Band – Album" strings, so use partial match
    await waitFor(() => screen.getByText(/Metallica/));
    expect(screen.getByText(/Opeth/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/favorites only/i));

    await waitFor(() =>
      expect(screen.queryByText(/Metallica/)).not.toBeInTheDocument()
    );
    expect(screen.getByText(/Opeth/)).toBeInTheDocument();
  });
});
