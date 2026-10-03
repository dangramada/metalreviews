// src/__tests__/ArtworkBlock.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
      summary: 'A classic.',
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

  it('renders a Listen chip that opens a menu with all four platform links', async () => {
    render(<ArtworkBlock rev={mockReview} isFavorited={false} onToggle={vi.fn()} />, { wrapper });
    const chip = screen.getByRole('button', { name: 'Listen on a streaming platform' });
    // Chakra's Ark-UI-based Menu opens on pointer interaction, not on a bare `click` event —
    // jsdom needs the full pointerdown/pointerup/click sequence a real click produces.
    fireEvent.pointerDown(chip, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(chip, { button: 0, pointerId: 1 });
    fireEvent.click(chip);

    const bandcampLink = await screen.findByRole('menuitem', { name: /Bandcamp/i });
    expect(bandcampLink).toHaveAttribute(
      'href',
      'https://bandcamp.com/search?q=Opeth%20Blackwater%20Park'
    );
    expect(bandcampLink).toHaveAttribute('target', '_blank');

    expect(screen.getByRole('menuitem', { name: /Spotify/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /YouTube Music/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Deezer/i })).toBeInTheDocument();
  });

  describe('artwork load retry', () => {
    afterEach(() => vi.useRealTimers());
    const rev = { ...mockReview, artworkUrl: 'https://coverartarchive.org/release/x/1.jpg' };

    it('retries with ?r= (retries only), then shows the placeholder after 2 retries', () => {
      vi.useFakeTimers();
      render(<ArtworkBlock rev={rev} />, { wrapper });
      const src = () => screen.queryByRole('img')?.getAttribute('src');
      expect(src()).toBe('https://coverartarchive.org/release/x/1-500.jpg');
      fireEvent.error(screen.getByRole('img'));
      expect(screen.queryByText('No artwork found')).not.toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(3000));
      expect(src()).toBe('https://coverartarchive.org/release/x/1-500.jpg?r=1');
      fireEvent.error(screen.getByRole('img'));
      act(() => void vi.advanceTimersByTime(8000));
      expect(src()).toBe('https://coverartarchive.org/release/x/1-500.jpg?r=2');
      fireEvent.error(screen.getByRole('img'));
      expect(screen.getByText('No artwork found')).toBeInTheDocument();
    });
  });
});
