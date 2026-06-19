// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '../Header';
import theme from '../theme';

// Mock AuthContext to control user state in tests
vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock supabaseClient — Header imports it for signOut
vi.mock('../supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}));

import { useAuth } from '../AuthContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('Header', () => {
  it('renders a "Log in" link when no user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper });
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
  });

  it('does not render auth controls while loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true });
    render(<Header />, { wrapper });
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('renders the username prefix and a Log out button when logged in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'dan@example.com' } as any,
      loading: false,
    });
    render(<Header />, { wrapper });
    expect(screen.getByText('dan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('renders the app title', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(<Header />, { wrapper });
    expect(screen.getByText('Metal Reviews Dashboard')).toBeInTheDocument();
  });
});
