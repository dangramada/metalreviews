# Phase 5b: Confirm Password + Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confirm-password validation on signup, a forgot-password flow in `LoginPage`, and a PASSWORD_RECOVERY handler in `AuthCallback` that shows an inline set-new-password form.

**Architecture:** All changes are confined to two existing files (`src/LoginPage.tsx`, `src/AuthCallback.tsx`) and their test files. `LoginPage` gains a third mode (`'forgot-password'`) and a confirm-password field in signup mode. `AuthCallback` switches from a one-shot `getSession()` call to an `onAuthStateChange` listener that can distinguish a `PASSWORD_RECOVERY` event from a normal login redirect.

**Tech Stack:** React, Chakra UI v2, Supabase JS v2 (`resetPasswordForEmail`, `updateUser`, `onAuthStateChange`), React Router v7, Vitest + `@testing-library/react`

---

## File Map

| Action | File                                  | What changes                                                                                      |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Modify | `src/LoginPage.tsx`                   | Add confirm-password field (signup), add forgot-password mode, `resetSent` state                  |
| Modify | `src/__tests__/LoginPage.test.tsx`    | Fix breaking test (exact placeholder), add 8 new tests                                            |
| Modify | `src/AuthCallback.tsx`                | Replace `getSession()` with `onAuthStateChange`; add recovery form state + `handleUpdatePassword` |
| Create | `src/__tests__/AuthCallback.test.tsx` | 6 new tests for the refactored callback                                                           |

---

## Task 1: Confirm-password field on signup

**Files:**

- Modify: `src/LoginPage.tsx`
- Modify: `src/__tests__/LoginPage.test.tsx`

When switching to signup mode, a "Confirm password" Input appears below the password field. `handleSubmit` validates the two fields match client-side before calling `supabase.auth.signUp` — no API round-trip on mismatch. On mode switch, `confirmPassword` is also cleared.

★ Insight ─────────────────────────────────────
The validation is intentionally client-side only. Supabase itself has no confirm-password concept — it accepts any password string. The check here is purely UX (catching typos before burning a signup attempt).
─────────────────────────────────────────────────

- [ ] **Step 1: Add new tests to LoginPage.test.tsx**

The existing test `shows email confirmation message after successful signup` uses `getByPlaceholderText(/password/i)` which will match two inputs once the Confirm password field is added in signup mode. Fix it now (before the implementation exists) so the test suite stays honest.

Also add three new tests. Replace the **entire** `src/__tests__/LoginPage.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../LoginPage';
import theme from '../theme';

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
    <ChakraProvider theme={theme}>
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

  // ── forgot-password tests (added in Task 2) ───────────────────────────────
  // (kept here so the mock already includes resetPasswordForEmail)

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
```

- [ ] **Step 2: Run tests to confirm 3 new tests fail**

```
npm test -- --run src/__tests__/LoginPage.test.tsx
```

Expected: the 3 new confirm-password tests fail with "Unable to find an element with placeholder text: Confirm password". The pre-existing 6 tests pass (the updated signup test now uses exact placeholder 'Password'). The 5 forgot-password tests fail because LoginPage doesn't have that mode yet — that's expected at this step.

- [ ] **Step 3: Update src/LoginPage.tsx to add confirm-password**

Replace the entire file with:

```tsx
import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Button, Container, Flex, Heading, Input, Link, Text, VStack } from '@chakra-ui/react';
import { supabase } from './supabaseClient';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const navigate = useNavigate();

  const inputStyle = {
    size: 'md',
    variant: 'outline',
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
  } as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // signUp() resolves without error even when email confirmation is required.
        // We show the confirmation screen; the user can't log in until they click the link.
        setConfirmationSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : ((err as any)?.message ?? 'An error occurred. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack spacing={4} textAlign="center">
            <Text fontSize="lg">Check your email to confirm your account.</Text>
            <Text fontSize="sm" color="text.dim">
              Once confirmed, you can log in below.
            </Text>
            <Link as={RouterLink} to="/login" color="accent.text" fontSize="sm">
              Back to log in
            </Link>
          </VStack>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="sm">
        <VStack spacing={6} align="stretch">
          <Heading size="lg" textAlign="center" color="text.primary">
            {mode === 'login' ? 'Log in' : 'Sign up'}
          </Heading>

          <Box as="form" onSubmit={handleSubmit}>
            <VStack spacing={4}>
              <Input
                {...inputStyle}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                _placeholder={{ color: 'text.dim' }}
                required
              />
              <Input
                {...inputStyle}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                _placeholder={{ color: 'text.dim' }}
                required
              />
              {/* Confirm password — only shown in signup mode */}
              {mode === 'signup' && (
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
              )}

              {error && (
                <Text color="red.400" fontSize="sm" alignSelf="flex-start">
                  {error}
                </Text>
              )}

              <Button
                type="submit"
                w="100%"
                bg="accent.border"
                color="white"
                _hover={{ bg: 'teal.600' }}
                _active={{ bg: 'teal.700' }}
                isLoading={loading}
              >
                {mode === 'login' ? 'Log in' : 'Sign up'}
              </Button>
            </VStack>
          </Box>

          {/*
           * OAuth buttons will go here in a future session (Google, Facebook).
           * Each will call: supabase.auth.signInWithOAuth({ provider: 'google' | 'facebook' })
           * They slot between the password submit button above and the mode toggle below.
           */}

          <Flex justify="center" align="center" gap={1} fontSize="sm">
            <Text color="text.dim">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <Button
              variant="link"
              size="sm"
              color="accent.text"
              fontWeight="normal"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
                setEmail('');
                setPassword('');
                setConfirmPassword('');
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </Button>
          </Flex>

          <Text textAlign="center" fontSize="sm">
            <Link as={RouterLink} to="/" color="text.dim" _hover={{ color: 'text.primary' }}>
              ← Back to dashboard
            </Link>
          </Text>
        </VStack>
      </Container>
    </Box>
  );
}
```

- [ ] **Step 4: Run the confirm-password tests only to confirm they pass**

```
npm test -- --run src/__tests__/LoginPage.test.tsx
```

Expected: the first 9 tests (6 original + 3 confirm-password) all pass. The 5 forgot-password tests still fail — they will be fixed in Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/LoginPage.tsx src/__tests__/LoginPage.test.tsx
git commit -m "feat: add confirm-password validation to signup form"
```

---

## Task 2: Forgot-password mode in LoginPage

**Files:**

- Modify: `src/LoginPage.tsx`

Add a third mode `'forgot-password'`. In login mode, a "Forgot password?" button switches to it. This mode shows only the email field and a "Send reset link" submit button. On success show "Check your email for a password reset link." — never reveal whether the email is registered (Supabase already hides this server-side; we just always show the success state).

`switchMode()` is extracted as a helper to avoid repeating the 4-field-clear pattern across the mode-toggle buttons.

- [ ] **Step 1: Confirm the 5 forgot-password tests currently fail**

```
npm test -- --run src/__tests__/LoginPage.test.tsx
```

Expected: 5 tests fail (`login mode shows a Forgot password button`, etc.). The previously passing 9 tests still pass.

- [ ] **Step 2: Replace src/LoginPage.tsx with the full forgot-password version**

```tsx
import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Button, Container, Flex, Heading, Input, Link, Text, VStack } from '@chakra-ui/react';
import { supabase } from './supabaseClient';

type Mode = 'login' | 'signup' | 'forgot-password';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();

  const inputStyle = {
    size: 'md',
    variant: 'outline',
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
  } as const;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setConfirmationSent(true);
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      } else {
        // forgot-password: uses window.location.origin so it works in both dev and production
        // without requiring a VITE_APP_URL env var.
        const redirectTo = `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        // Always show the success screen regardless of whether the email exists —
        // revealing that would tell an attacker which emails are registered.
        setResetSent(true);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : ((err as any)?.message ?? 'An error occurred. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack spacing={4} textAlign="center">
            <Text fontSize="lg">Check your email to confirm your account.</Text>
            <Text fontSize="sm" color="text.dim">
              Once confirmed, you can log in below.
            </Text>
            <Link as={RouterLink} to="/login" color="accent.text" fontSize="sm">
              Back to log in
            </Link>
          </VStack>
        </Container>
      </Box>
    );
  }

  if (resetSent) {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack spacing={4} textAlign="center">
            <Text fontSize="lg">Check your email for a password reset link.</Text>
            <Link as={RouterLink} to="/login" color="accent.text" fontSize="sm">
              Back to log in
            </Link>
          </VStack>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="sm">
        <VStack spacing={6} align="stretch">
          <Heading size="lg" textAlign="center" color="text.primary">
            {mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Reset password'}
          </Heading>

          <Box as="form" onSubmit={handleSubmit}>
            <VStack spacing={4}>
              <Input
                {...inputStyle}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                _placeholder={{ color: 'text.dim' }}
                required
              />
              {/* Password fields hidden in forgot-password mode — only email needed there */}
              {mode !== 'forgot-password' && (
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
              )}
              {mode === 'signup' && (
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
              )}

              {error && (
                <Text color="red.400" fontSize="sm" alignSelf="flex-start">
                  {error}
                </Text>
              )}

              <Button
                type="submit"
                w="100%"
                bg="accent.border"
                color="white"
                _hover={{ bg: 'teal.600' }}
                _active={{ bg: 'teal.700' }}
                isLoading={loading}
              >
                {mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
              </Button>
            </VStack>
          </Box>

          {/*
           * OAuth buttons will go here in a future session (Google, Facebook).
           * Each will call: supabase.auth.signInWithOAuth({ provider: 'google' | 'facebook' })
           * They slot between the password submit button above and the mode controls below.
           */}

          {/* Login mode controls: forgot-password link + sign-up toggle */}
          {mode === 'login' && (
            <>
              <Flex justify="center" fontSize="sm">
                <Button
                  variant="link"
                  size="sm"
                  color="text.dim"
                  fontWeight="normal"
                  onClick={() => switchMode('forgot-password')}
                >
                  Forgot password?
                </Button>
              </Flex>
              <Flex justify="center" align="center" gap={1} fontSize="sm">
                <Text color="text.dim">Don't have an account?</Text>
                <Button
                  variant="link"
                  size="sm"
                  color="accent.text"
                  fontWeight="normal"
                  onClick={() => switchMode('signup')}
                >
                  Sign up
                </Button>
              </Flex>
            </>
          )}

          {/* Signup mode: back-to-login toggle */}
          {mode === 'signup' && (
            <Flex justify="center" align="center" gap={1} fontSize="sm">
              <Text color="text.dim">Already have an account?</Text>
              <Button
                variant="link"
                size="sm"
                color="accent.text"
                fontWeight="normal"
                onClick={() => switchMode('login')}
              >
                Log in
              </Button>
            </Flex>
          )}

          {/* Forgot-password mode: back-to-login link */}
          {mode === 'forgot-password' && (
            <Flex justify="center" fontSize="sm">
              <Button
                variant="link"
                size="sm"
                color="accent.text"
                fontWeight="normal"
                onClick={() => switchMode('login')}
              >
                Back to log in
              </Button>
            </Flex>
          )}

          <Text textAlign="center" fontSize="sm">
            <Link as={RouterLink} to="/" color="text.dim" _hover={{ color: 'text.primary' }}>
              ← Back to dashboard
            </Link>
          </Text>
        </VStack>
      </Container>
    </Box>
  );
}
```

- [ ] **Step 3: Run all LoginPage tests — confirm all 14 pass**

```
npm test -- --run src/__tests__/LoginPage.test.tsx
```

Expected: 14 tests pass, 0 failures.

- [ ] **Step 4: Run full test suite — confirm nothing regressed**

```
npm test -- --run
```

Expected: all test files passing.

- [ ] **Step 5: Commit**

```bash
git add src/LoginPage.tsx
git commit -m "feat: add forgot-password mode to LoginPage"
```

---

## Task 3: PASSWORD_RECOVERY handler in AuthCallback

**Files:**

- Modify: `src/AuthCallback.tsx`
- Create: `src/__tests__/AuthCallback.test.tsx`

★ Insight ─────────────────────────────────────
Supabase JS v2 fires `PASSWORD_RECOVERY` via `onAuthStateChange` when a user arrives via a password reset link. The token exchange happens automatically inside the SDK before the event fires. Using `onAuthStateChange` (instead of the old `getSession()`) is the only way to distinguish this event from a normal sign-in — both result in a session, but only the recovery flow sets `event === 'PASSWORD_RECOVERY'`.
─────────────────────────────────────────────────

AuthCallback switches from a one-shot `getSession()` to an `onAuthStateChange` subscription. The subscription is unsubscribed on unmount. A local `mode` state (`'loading' | 'recovery'`) drives which UI is shown. The recovery form validates passwords match client-side, then calls `supabase.auth.updateUser({ password })`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/AuthCallback.test.tsx`:

```tsx
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
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('navigates to /login when event fires with no session', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('SIGNED_OUT', null);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    render(<AuthCallback />, { wrapper });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }));
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- --run src/__tests__/AuthCallback.test.tsx
```

Expected: all 6 tests fail. The loading spinner test may fail because `onAuthStateChange` is not yet used; the recovery form tests fail because the form doesn't exist yet.

- [ ] **Step 3: Replace src/AuthCallback.tsx with the refactored version**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { supabase } from './supabaseClient';

type CallbackMode = 'loading' | 'recovery';

export function AuthCallback() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<CallbackMode>('loading');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    size: 'md',
    variant: 'outline',
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
  } as const;

  useEffect(() => {
    // onAuthStateChange fires PASSWORD_RECOVERY when the user arrives via a reset link.
    // The SDK has already exchanged the token from the URL by the time the callback fires.
    // For every other event (SIGNED_IN from email confirmation, later OAuth), redirect to /.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
      } else if (session) {
        navigate('/', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      navigate('/');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : ((err as any)?.message ?? 'Failed to update password. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'recovery') {
    return (
      <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
        <Container maxW="sm">
          <VStack spacing={6} align="stretch">
            <Heading size="lg" textAlign="center" color="text.primary">
              Set new password
            </Heading>
            <Box as="form" onSubmit={handleUpdatePassword}>
              <VStack spacing={4}>
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
                <Input
                  {...inputStyle}
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  _placeholder={{ color: 'text.dim' }}
                  required
                />
                {error && (
                  <Text color="red.400" fontSize="sm" alignSelf="flex-start">
                    {error}
                  </Text>
                )}
                <Button
                  type="submit"
                  w="100%"
                  bg="accent.border"
                  color="white"
                  _hover={{ bg: 'teal.600' }}
                  _active={{ bg: 'teal.700' }}
                  isLoading={loading}
                >
                  Update password
                </Button>
              </VStack>
            </Box>
          </VStack>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary">
      <Flex justify="center" align="center" minH="100vh" direction="column" gap={4}>
        <Spinner size="xl" color="accent.start" thickness="4px" speed="0.65s" />
        <Text color="text.dim">Signing you in…</Text>
      </Flex>
    </Box>
  );
}
```

- [ ] **Step 4: Run AuthCallback tests — confirm all 6 pass**

```
npm test -- --run src/__tests__/AuthCallback.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Run the full test suite**

```
npm test -- --run
```

Expected: all test files passing (the old AuthCallback tests no longer exist — this is the new test file for the same component).

- [ ] **Step 6: Commit**

```bash
git add src/AuthCallback.tsx src/__tests__/AuthCallback.test.tsx
git commit -m "feat: handle PASSWORD_RECOVERY in AuthCallback with inline set-password form"
```

---

## Task 4: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Phase 5 session decisions section**

Find the `## Session decisions — Auth + routing (Phase 5, June 2026)` section. Append the following after the existing `### env vars` paragraph at the end of the section:

```markdown
### Phase 5b additions (June 2026)

- **Signup confirm-password:** `LoginPage` validates that password and confirm-password match client-side before calling `signUp()`. Error shown inline; no API call made on mismatch.
- **Forgot password:** `LoginPage` gains a third mode `'forgot-password'`. Clicking "Forgot password?" shows an email-only form that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/callback' })`. On success shows a neutral "check your email" screen (no email-existence leak).
- **Password recovery at /auth/callback:** `AuthCallback` replaced `getSession()` with an `onAuthStateChange` listener. `PASSWORD_RECOVERY` event shows an inline "Set new password" form (password + confirm-password, same mismatch validation, calls `supabase.auth.updateUser({ password })`). All other events with a session navigate to `/`; no session navigates to `/login`.
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Phase 5b confirm-password and forgot-password additions"
```

---

## Self-review against spec

| Requirement                                                       | Task                         |
| ----------------------------------------------------------------- | ---------------------------- |
| Signup: confirm-password field shown                              | Task 1                       |
| Signup: mismatch → error, no API call                             | Task 1                       |
| "Forgot password?" link in login mode                             | Task 2                       |
| Forgot-password mode: email field only                            | Task 2                       |
| Forgot-password: calls `resetPasswordForEmail` with redirectTo    | Task 2                       |
| Forgot-password success: "check your email" message               | Task 2                       |
| No email-existence leak                                           | Task 2 (always show success) |
| `/auth/callback`: `PASSWORD_RECOVERY` → inline form, not redirect | Task 3                       |
| Recovery form: password + confirm-password, match validation      | Task 3                       |
| Recovery form: `updateUser()` then navigate to `/`                | Task 3                       |
| Other auth events still redirect to `/` or `/login`               | Task 3                       |
| CLAUDE.md updated                                                 | Task 4                       |
