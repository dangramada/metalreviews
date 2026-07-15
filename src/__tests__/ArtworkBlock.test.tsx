// src/__tests__/ArtworkBlock.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import system from '../theme';
import { ArtworkBlock } from '../App';

// App.tsx imports supabaseClient at module load — mock to avoid env-var errors
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

// App.tsx imports useAuth — mock so we don't need a full AuthProvider when rendering ArtworkBlock alone
vi.mock('../AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({ user: null, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// App.tsx will import useFeedbackToast — pre-mock it
vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showAction: vi.fn(),
  }),
}));

const mockReview = {
  albumId: 'album1',
  band: 'Opeth',
  album: 'Blackwater Park',
  genre: ['progressive metal'],
  artworkUrl: null,
  releaseDate: null,
  reviews: [
    {
      source: 'Angry Metal Guy',
      score: '9/10',
      url: 'https://example.com',
      publishedAt: '2006-01-01T00:00:00Z',
      publishedDate: '1 Jan 2006',
    },
  ],
  averageScore: 90,
  publishedAt: '2006-01-01T00:00:00Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}

describe('ArtworkBlock', () => {
  it('renders an "Add to favorites" button when not favorited', () => {
    render(<ArtworkBlock rev={mockReview} isFavorited={false} onToggle={vi.fn()} />, { wrapper });
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  });

  it('renders a "Remove from favorites" button when favorited', () => {
    render(<ArtworkBlock rev={mockReview} isFavorited={true} onToggle={vi.fn()} />, { wrapper });
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });

  it('calls onToggle when the heart button is clicked', () => {
    const onToggle = vi.fn();
    render(<ArtworkBlock rev={mockReview} isFavorited={false} onToggle={onToggle} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
