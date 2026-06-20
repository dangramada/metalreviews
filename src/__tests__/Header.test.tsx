// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '../Header';
import theme from '../theme';

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}));

import { useAuth } from '../AuthContext';

// makeWrapper lets tests set the initial route so active-link logic can be exercised.
function makeWrapper(initialPath = '/') {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ChakraProvider theme={theme}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      </ChakraProvider>
    );
  };
}

describe('Header — title', () => {
  it('renders "Metal Reviews" (not "Metal Reviews Dashboard")', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    expect(screen.getByText('Metal Reviews')).toBeInTheDocument();
    expect(screen.queryByText('Metal Reviews Dashboard')).not.toBeInTheDocument();
  });
});

describe('Header — loading state', () => {
  it('hides all controls while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true });
    render(<Header />, { wrapper: makeWrapper() });
    // No buttons (hamburger, account menu) and no nav links while loading
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /reviews/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument();
  });
});

describe('Header — desktop nav links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders Reviews and Favorites links (logged out)', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper: makeWrapper('/') });
    // Desktop nav links have role="link" (Chakra Link as RouterLink renders <a>)
    const reviewsLinks = screen.getAllByRole('link', { name: /^reviews$/i });
    const favoritesLinks = screen.getAllByRole('link', { name: /^favorites$/i });
    expect(reviewsLinks.length).toBeGreaterThan(0);
    expect(favoritesLinks.length).toBeGreaterThan(0);
    expect(reviewsLinks[0]).toHaveAttribute('href', '/');
    expect(favoritesLinks[0]).toHaveAttribute('href', '/favorites');
  });

  it('renders Reviews and Favorites links (logged in)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'dan@test.com' } as any,
      loading: false,
    });
    render(<Header />, { wrapper: makeWrapper('/favorites') });
    const reviewsLinks = screen.getAllByRole('link', { name: /^reviews$/i });
    const favoritesLinks = screen.getAllByRole('link', { name: /^favorites$/i });
    expect(reviewsLinks.length).toBeGreaterThan(0);
    expect(favoritesLinks.length).toBeGreaterThan(0);
  });
});

describe('Header — logged-out account control', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a Log in link when logged out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    // Desktop "Log in" is role="link"; mobile hamburger "Log in" is role="menuitem"
    const loginLinks = screen.getAllByRole('link', { name: /^log in$/i });
    expect(loginLinks.length).toBeGreaterThan(0);
  });

  it('does NOT render an account MenuButton when logged out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    // Only button present is the hamburger ("Open menu")
    const buttons = screen.getAllByRole('button');
    expect(buttons.every((b) => b.getAttribute('aria-label') === 'Open menu')).toBe(true);
  });
});

describe('Header — logged-in account control (desktop)', () => {
  const mockUser = { id: 'u1', email: 'dan@example.com' } as any;

  beforeEach(() => vi.clearAllMocks());

  it('renders account MenuButton with email local-part', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    // The desktop account MenuButton renders as <button> with the email local-part as its label
    expect(screen.getByRole('button', { name: /^dan$/i })).toBeInTheDocument();
  });

  it('opens dropdown with Log out on MenuButton click', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /^dan$/i }));
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /^log out$/i })).toBeInTheDocument()
    );
  });

  it('does NOT render a Log in link when logged in', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    expect(screen.queryByRole('link', { name: /^log in$/i })).not.toBeInTheDocument();
  });
});

describe('Header — mobile hamburger menu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a hamburger button with aria-label "Open menu"', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  it('hamburger opens menu with Reviews, Favorites, and Log in when logged out', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /^reviews$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^favorites$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^log in$/i })).toBeInTheDocument();
    });
  });

  it('hamburger opens menu with Reviews, Favorites, and Log out when logged in', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'dan@test.com' } as any,
      loading: false,
    });
    render(<Header />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /^reviews$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^favorites$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^log out$/i })).toBeInTheDocument();
    });
  });
});
