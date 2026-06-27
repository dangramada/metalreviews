// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../LoginPage';
import system from '../theme';

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
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
    <ChakraProvider value={system}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  // ── existing tests (unchanged except #6 which uses exact placeholder) ──────

  it('renders email and password inputs', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('starts in login mode with a Log in heading', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument();
  });

  it('switches to signup mode when Sign up toggle is clicked', () => {
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    expect(screen.getByRole('heading', { name: /sign up/i })).toBeInTheDocument();
  });

  it('shows error message when login fails', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' } as any,
    });
    render(<LoginPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument();
    });
  });

  it('navigates to / on successful login', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { email: 'dan@example.com' } as any, session: {} as any },
      error: null,
    });
    render(<LoginPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'dan@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'correct' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  // Updated: uses exact placeholder 'Password' and also fills Confirm password
  it('shows email confirmation message after successful signup', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'securepass' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), {
      target: { value: 'securepass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });

  // ── new tests for confirm-password ────────────────────────────────────────

  it('signup mode shows a Confirm password field', () => {
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument();
  });

  it('login mode does not show Confirm password field', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.queryByPlaceholderText('Confirm password')).not.toBeInTheDocument();
  });

  it('shows error and does not call signUp when passwords do not match', async () => {
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'hunter2' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  // ── forgot-password tests (these will fail until Task 2 is implemented) ───

  it('login mode shows a Forgot password button', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument();
  });

  it('clicking Forgot password switches to reset mode', () => {
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
  });

  it('forgot-password mode shows email field but no password field', () => {
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
  });

  it('forgot-password success shows check-your-email message without leaking email existence', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    } as any);
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'anyone@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText(/check your email for a password reset link/i)).toBeInTheDocument();
    });
  });

  it('forgot-password calls resetPasswordForEmail with the current origin as redirectTo', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    } as any);
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'dan@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'dan@example.com',
        expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback') })
      );
    });
  });
});
