// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthCallback } from '../AuthCallback';
import theme from '../theme';

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { supabase } from '../supabaseClient';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: subscribe but never fire any event (stay on loading spinner)
  vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  } as any);
});

describe('AuthCallback', () => {
  it('shows loading spinner on mount before any auth event', () => {
    render(<AuthCallback />, { wrapper });
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
  });

  it('navigates to / when SIGNED_IN fires with a session', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('SIGNED_IN', { user: { email: 'dan@example.com' } } as any);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    render(<AuthCallback />, { wrapper });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    );
  });

  it('navigates to /login when event fires with no session', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('SIGNED_OUT', null);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    render(<AuthCallback />, { wrapper });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    );
  });

  it('shows password recovery form when PASSWORD_RECOVERY event fires', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('PASSWORD_RECOVERY', { user: { email: 'dan@example.com' } } as any);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    await act(async () => {
      render(<AuthCallback />, { wrapper });
    });
    expect(screen.getByRole('heading', { name: /set new password/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('New password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm new password')).toBeInTheDocument();
  });

  it('shows error and does not call updateUser when passwords do not match', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('PASSWORD_RECOVERY', { user: {} } as any);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    await act(async () => {
      render(<AuthCallback />, { wrapper });
    });
    fireEvent.change(screen.getByPlaceholderText('New password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('shows error message when updateUser returns an error', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('PASSWORD_RECOVERY', { user: {} } as any);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: null as any },
      error: { message: 'Password should be at least 6 characters.' } as any,
    });
    await act(async () => {
      render(<AuthCallback />, { wrapper });
    });
    fireEvent.change(screen.getByPlaceholderText('New password'), {
      target: { value: 'abc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() =>
      expect(screen.getByText('Password should be at least 6 characters.')).toBeInTheDocument()
    );
    expect(mockNavigate).not.toHaveBeenCalledWith('/');
  });

  it('calls updateUser and navigates to / on successful password reset', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('PASSWORD_RECOVERY', { user: {} } as any);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: { email: 'dan@example.com' } as any },
      error: null,
    });
    await act(async () => {
      render(<AuthCallback />, { wrapper });
    });
    fireEvent.change(screen.getByPlaceholderText('New password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
  });
});
