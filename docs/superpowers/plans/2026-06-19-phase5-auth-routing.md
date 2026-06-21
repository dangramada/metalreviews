# Phase 5: Auth + Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password auth via Supabase and React Router routing so the app has a `/login` page, a header with login/logout state, and every client-side route resolves correctly on the Render deployment.

**Architecture:** `createBrowserRouter` wraps the three routes (`/`, `/login`, `/auth/callback`) under an `AuthProvider` that lives in `main.tsx`. The auth state (user + loading flag) is shared via a context hook so any component can read it without prop-drilling. The existing dashboard (`App.tsx`) is unchanged except that its `<Heading>` is replaced by a `<Header>` component.

**Tech Stack:** React Router DOM v7 (already installed as `react-router-dom`), Supabase Auth (`@supabase/supabase-js` already installed), Chakra UI v2, Vitest + `@testing-library/react` (both already installed), Express (server.ts already exists)

---

## File Map

| Action | File                               | Responsibility                                                    |
| ------ | ---------------------------------- | ----------------------------------------------------------------- |
| Create | `src/AuthContext.tsx`              | `AuthProvider` + `useAuth()` hook — wraps `supabase.auth` state   |
| Create | `src/Header.tsx`                   | Gradient title + login/logout button, uses `useAuth()`            |
| Create | `src/LoginPage.tsx`                | `/login` route — email/password form, mode toggle, error display  |
| Create | `src/AuthCallback.tsx`             | `/auth/callback` route — loading spinner, redirect to `/`         |
| Create | `src/__tests__/setup.ts`           | `@testing-library/jest-dom` import for component tests            |
| Create | `src/__tests__/Header.test.tsx`    | Header render tests (logged-out / logged-in states)               |
| Create | `src/__tests__/LoginPage.test.tsx` | LoginPage form render + error display tests                       |
| Modify | `vite.config.ts`                   | Add `test.environmentMatchGlobs` for jsdom on `.test.tsx` files   |
| Modify | `src/main.tsx`                     | Add `RouterProvider` + `AuthProvider` + route definitions         |
| Modify | `src/App.tsx`                      | Replace `<Heading>` with `<Header />`, update top-of-file comment |
| Modify | `server.ts`                        | Add SPA catch-all: `GET *` → `dist/index.html`                    |
| Modify | `CLAUDE.md`                        | Update architecture section (routing, auth)                       |

---

## Task 1: Configure Vitest for component testing

**Files:**

- Modify: `vite.config.ts`
- Create: `src/__tests__/setup.ts`

`@testing-library/react` is already installed. We need Vitest to use jsdom for `.test.tsx` files and to import jest-dom matchers automatically. We use `environmentMatchGlobs` so existing `.test.ts` / `.test.js` files keep their Node environment (they import express, puppeteer, etc. and those don't need the change).

- [ ] **Step 1: Add test config to vite.config.ts**

The full updated file:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import WebfontDownload from 'vite-plugin-webfont-dl';

export default defineConfig({
  plugins: [react(), WebfontDownload()],
  base: './',
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environmentMatchGlobs: [
      // Use jsdom for React component tests (.test.tsx files only).
      // Existing .test.ts and .test.js files stay in the default Node environment.
      ['src/__tests__/**/*.test.tsx', 'jsdom'],
    ],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
```

- [ ] **Step 2: Create src/**tests**/setup.ts**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm test -- --run
```

Expected: all existing tests pass (angrymetal, progressivesubway, metalstorm, mergeGuard, dbMapping, serverAuth).

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts src/__tests__/setup.ts
git commit -m "test: configure jsdom environment for React component tests"
```

---

## Task 2: AuthContext — auth state provider and hook

**Files:**

- Create: `src/AuthContext.tsx`
- Create: `src/__tests__/AuthContext.test.tsx` (pure unit test — no jsdom needed, tests the exported types)

`AuthContext` is the single source of truth for auth state. It calls `supabase.auth.getSession()` on mount to hydrate from an existing session cookie, then subscribes to `onAuthStateChange` so login/logout events anywhere in the app (including the OAuth callback) automatically update every consumer.

★ Insight ─────────────────────────────────────
`onAuthStateChange` fires on: initial SIGNED*IN from an existing session, new sign-ins, sign-outs, and token refreshes. The `getSession()` call on mount is still necessary because the state-change listener only fires on \_changes* — it won't fire if the session is already established when the component mounts.
─────────────────────────────────────────────────

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/AuthContext.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock supabaseClient to avoid env var errors at import time
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

function TestConsumer() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? user.email : 'no user'}</div>;
}

describe('AuthContext', () => {
  it('starts in loading state then resolves to no user when session is null', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });
    expect(screen.getByText('no user')).toBeInTheDocument();
  });

  it('resolves to user email when session exists', async () => {
    const { supabase } = await import('../supabaseClient');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { email: 'dan@example.com' } } as any },
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });
    expect(screen.getByText('dan@example.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails with "Cannot find module '../AuthContext'"**

```bash
npm test -- --run src/__tests__/AuthContext.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/AuthContext.tsx**

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- --run src/__tests__/AuthContext.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AuthContext.tsx src/__tests__/AuthContext.test.tsx
git commit -m "feat: add AuthContext with useAuth hook"
```

---

## Task 3: Header component — login/logout UI

**Files:**

- Create: `src/Header.tsx`
- Create: `src/__tests__/Header.test.tsx`

The Header replaces the `<Heading>` currently at the top of `App.tsx`. It renders the same gradient title on the left and an auth button on the right. Chakra's `Link` can render as React Router's `Link` via the `as` prop — `to` is forwarded to the underlying component.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/Header.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --run src/__tests__/Header.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/Header.tsx**

```tsx
import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Flex, Heading, Button, Text, Link } from '@chakra-ui/react';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';

export function Header() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  return (
    <Flex align="center" justify="space-between" mb={6}>
      <Heading as="h1" size="xl" bgGradient="linear(to-r, accent.start, accent.end)" bgClip="text">
        Metal Reviews Dashboard
      </Heading>

      {/* Auth controls — hidden during initial session hydration to avoid a flash */}
      {!loading && (
        <Flex align="center" gap={3}>
          {user ? (
            <>
              <Text fontSize="sm" color="text.dim">
                {user.email?.split('@')[0]}
              </Text>
              <Button
                size="sm"
                bg="surface.card"
                color="gray.300"
                border="1px solid"
                borderColor="border.default"
                borderRadius="md"
                _hover={{ borderColor: 'border.hover', color: 'text.primary', bg: 'surface.card' }}
                _active={{ bg: 'surface.raised' }}
                onClick={handleLogout}
              >
                Log out
              </Button>
            </>
          ) : (
            <Link
              as={RouterLink}
              to="/login"
              fontSize="sm"
              color="accent.text"
              _hover={{ color: 'accent.start', textDecoration: 'none' }}
            >
              Log in
            </Link>
          )}
        </Flex>
      )}
    </Flex>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --run src/__tests__/Header.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Header.tsx src/__tests__/Header.test.tsx
git commit -m "feat: add Header component with login/logout state"
```

---

## Task 4: LoginPage — email/password form

**Files:**

- Create: `src/LoginPage.tsx`
- Create: `src/__tests__/LoginPage.test.tsx`

The form has two modes: `login` and `signup`. Supabase email confirmation is on by default — a signup succeeds but requires the user to click an email link before they can log in. We show a confirmation message rather than immediately navigating to `/`. A clear placeholder comment marks where OAuth buttons will go in the next session.

★ Insight ─────────────────────────────────────
`supabase.auth.signUp()` resolves successfully even when email confirmation is required — it doesn't reject or error. The distinction is that `data.session` is `null` until the email is confirmed. We detect the "confirmation sent" state by checking `!error` after signUp; no extra API call needed.
─────────────────────────────────────────────────

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/LoginPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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
    },
  },
}));

// useNavigate must be mocked before LoginPage renders
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

describe('LoginPage', () => {
  it('renders email and password inputs', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('starts in login mode with a Log in heading', () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument();
  });

  it('switches to signup mode when Sign up toggle is clicked', () => {
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
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
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
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
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'correct' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('shows email confirmation message after successful signup', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    render(<LoginPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'securepass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --run src/__tests__/LoginPage.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/LoginPage.tsx**

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const navigate = useNavigate();

  // Same token palette as the controls bar in App.tsx — no new styles introduced.
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
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
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

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --run src/__tests__/LoginPage.test.tsx
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/LoginPage.tsx src/__tests__/LoginPage.test.tsx
git commit -m "feat: add LoginPage with email/password auth and signup flow"
```

---

## Task 5: AuthCallback — OAuth redirect handler

**Files:**

- Create: `src/AuthCallback.tsx`

This route exists for OAuth flows (deferred to next session). When Google/Facebook redirect back to `/auth/callback`, Supabase automatically exchanges the token from the URL. We just wait for `getSession()` to resolve and redirect. For email/password flows, this page is never visited, but it must exist and handle gracefully.

- [ ] **Step 1: Create src/AuthCallback.tsx**

No business logic to test independently — the redirect behaviour depends on the real supabase session. Manual browser testing is sufficient for this component.

```tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Flex, Spinner, Text } from '@chakra-ui/react';
import { supabase } from './supabaseClient';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Supabase has already exchanged the OAuth code from the URL by the time this runs.
      // If a session exists, go to the dashboard. If not (malformed callback), go to login.
      navigate(data.session ? '/' : '/login', { replace: true });
    });
  }, [navigate]);

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

- [ ] **Step 2: Run type-check to confirm no TypeScript errors**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/AuthCallback.tsx
git commit -m "feat: add AuthCallback route for OAuth redirects"
```

---

## Task 6: Wire routing in main.tsx

**Files:**

- Modify: `src/main.tsx`

`AuthProvider` wraps `RouterProvider` (not the other way around) so all routes can access the auth context without nesting context inside each page component.

★ Insight ─────────────────────────────────────
`createBrowserRouter` (data router) is the recommended React Router v7 API. It enables future loaders and actions if needed. Wrapping it in `RouterProvider` keeps router state outside the React tree — it's not a context provider itself, just a bridge. Adding a new route later is a one-line addition to the `routes` array.
─────────────────────────────────────────────────

- [ ] **Step 1: Update src/main.tsx**

The full updated file:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import App from './App';
import { LoginPage } from './LoginPage';
import { AuthCallback } from './AuthCallback';
import { AuthProvider } from './AuthContext';
import theme from './theme';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  // { path: '/list/:shareId', element: <SharedList /> }  — reserved for shareable favorites
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ChakraProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: set up React Router with auth, login, and callback routes"
```

---

## Task 7: Integrate Header into App.tsx

**Files:**

- Modify: `src/App.tsx`

Replace the standalone `<Heading>` element with `<Header />`. Update the top comment (which currently says "no routing, no server-side state") to reflect Phase 5. No other changes to App.

- [ ] **Step 1: Add Header import to App.tsx**

Add after the existing Supabase imports (around line 47):

```ts
import { Header } from './Header';
```

- [ ] **Step 2: Remove the Heading element and replace with Header**

Find this block in the render (around line 397–406):

```tsx
{
  /* Page title — gradient is clipped to the text shape via bgClip="text" */
}
<Heading
  as="h1"
  size="xl"
  textAlign="center"
  bgGradient="linear(to-r, accent.start, accent.end)"
  bgClip="text"
>
  Metal Reviews Dashboard
</Heading>;
```

Replace with:

```tsx
<Header />
```

- [ ] **Step 3: Update the top-of-file comment**

Replace lines 1–6:

```ts
// src/App.tsx
//
// The main dashboard component. Loads reviews from Supabase on mount and
// renders a dark-themed card grid with filtering, sorting, and searching.
// Routing is handled by React Router (see main.tsx); this file owns only
// the dashboard route at /.
//
// Two things are defined here:
//   ArtworkBlock — a small self-contained component that renders one card's image
//   App          — the root component: state, data fetching, controls, and the card grid
```

- [ ] **Step 4: Remove Heading from the Chakra import list**

In the import block, remove `Heading` from the `@chakra-ui/react` import (it's now only used in Header.tsx).

- [ ] **Step 5: Run type-check and tests**

```bash
npm run type-check && npm test -- --run
```

Expected: no type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: replace Heading with Header component in App"
```

---

## Task 8: SPA catch-all in server.ts

**Files:**

- Modify: `server.ts`

Without this, directly visiting `https://metalreviews.onrender.com/login` returns a 404 — Express tries to find a file at `dist/login` and fails. The catch-all serves `index.html` for any GET request that isn't a static asset or `/api/*`, letting React Router take over client-side.

The catch-all must come **after** the `/api/*` routes and **after** `express.static`. Express matches routes in registration order.

- [ ] **Step 1: Add the catch-all route to server.ts**

Add after the `GET /api/ingest/status` handler and before `app.listen`:

```ts
// Catch-all for client-side routes: serve index.html so React Router handles
// paths like /login and /auth/callback when typed directly in the address bar.
// Must come after all /api/* routes — Express matches in registration order.
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
});
```

- [ ] **Step 2: Run existing server tests**

```bash
npm test -- --run src/__tests__/serverAuth.test.ts
```

Expected: PASS (7 tests — unchanged).

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "fix: add SPA catch-all so /login and /auth/callback resolve on Render"
```

---

## Task 9: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

The architecture section says "No routing, no server-side state" — that's now wrong. Update it to reflect Phase 5.

- [ ] **Step 1: Update the Frontend section in CLAUDE.md**

Find the "### 2. Frontend" section. Replace:

```
A single-page React + Chakra UI app that queries Supabase on load and renders a dark-themed card grid. No routing, no server-side state — all filtering, sorting, and searching happen in-memory on the already-loaded array.

Key data flow: Supabase `reviews` table → `supabase.from('reviews').select('*')` → `fromDbRow` mapping → React state → filter/sort → card grid.
```

With:

```
A React + Chakra UI app with client-side routing via React Router (v7, `react-router-dom`). All filtering, sorting, and searching happen in-memory on the already-loaded array.

Key data flow: Supabase `reviews` table → `supabase.from('reviews').select('*')` → `fromDbRow` mapping → React state → filter/sort → card grid.

Routes:
- `/` — dashboard (review grid), public — no auth required
- `/login` — email/password auth form (`LoginPage`); OAuth buttons reserved for future session
- `/auth/callback` — OAuth redirect handler (`AuthCallback`); not used until OAuth is enabled

Auth state is managed by `AuthContext` (wraps `supabase.auth` events) and exposed via `useAuth()`. The `Header` component renders the app title + login/logout controls.
```

- [ ] **Step 2: Add a Phase 5 session decisions section to CLAUDE.md**

Add at the end of the file:

```markdown
## Session decisions — Auth + routing (Phase 5, June 2026)

### What was built

- React Router (`react-router-dom` v7) added with `createBrowserRouter` in `main.tsx`. Three routes: `/`, `/login`, `/auth/callback`.
- `AuthContext.tsx` — `AuthProvider` + `useAuth()` hook. Hydrates from `supabase.auth.getSession()` on mount; stays in sync via `onAuthStateChange`.
- `Header.tsx` — app title + login/logout controls. Logged out: `<Link to="/login">` (React Router). Logged in: email prefix + Log out button.
- `LoginPage.tsx` — email/password form with sign-up/log-in mode toggle. Signup shows confirmation message (Supabase requires email verification by default). OAuth button placeholder left in a comment.
- `AuthCallback.tsx` — loading spinner that redirects to `/` (session found) or `/login` (no session). Used by OAuth flows; not reachable via email/password auth.
- `server.ts` catch-all: `GET *` → `dist/index.html` so `/login` typed in the address bar doesn't 404 on Render.

### What was deferred

- Google and Facebook OAuth — credentials not yet configured. The placeholder comment in `LoginPage.tsx` marks where to add the two `supabase.auth.signInWithOAuth()` buttons.
- Protecting any route behind auth — review browsing is still fully public. If a protected route is needed (e.g. `/list/:shareId` for saved favorites), use a wrapper that checks `useAuth().user` and redirects to `/login`.

### Reserved route shape

`/list/:shareId` — future shareable favorites list. No code yet; the commented-out line in `main.tsx` marks the slot.

### env vars (no new ones added in Phase 5)

Auth uses the existing `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) via `src/supabaseClient.ts`. Supabase Auth is enabled on the same project.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Phase 5 auth and routing"
```

---

## Task 10: Manual browser verification

- [ ] **Step 1: Build and start the full stack**

```bash
npm run build && npm run dev
```

- [ ] **Step 2: Verify each route in the browser**

| Check                                                            | Expected                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Visit `http://localhost:5173/`                                   | Dashboard loads, Header shows "Log in" link                |
| Click "Log in"                                                   | Navigates to `/login`, form shows email + password         |
| Enter wrong password, click Log in                               | Error message appears inline                               |
| Enter correct credentials, click Log in                          | Redirects to `/`, Header shows username prefix + "Log out" |
| Click "Log out"                                                  | Header returns to "Log in" state                           |
| Click "Sign up", fill form                                       | "Check your email" confirmation screen appears             |
| Navigate to `http://localhost:5173/login` directly (address bar) | Page loads (not 404)                                       |
| Reload on `/login`                                               | Page reloads correctly                                     |
| Verify review browsing (search, filter, sort, refresh)           | Works identically to pre-Phase-5                           |

- [ ] **Step 3: Run full test suite one final time**

```bash
npm test -- --run
```

Expected: all tests pass.

---

## Self-review against spec

| Requirement                                            | Task                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `react-router` installed                               | Already at v7 as `react-router-dom` — no install needed |
| Routes `/`, `/login`, `/auth/callback`                 | Task 6                                                  |
| `/list/:shareId` reserved (no code)                    | Comment in main.tsx router array (Task 6)               |
| `AuthContext` with `getSession` + `onAuthStateChange`  | Task 2                                                  |
| `useAuth()` hook                                       | Task 2                                                  |
| Header: "Log in" link (logged out)                     | Task 3                                                  |
| Header: email prefix + "Log out" button (logged in)    | Task 3                                                  |
| Header uses `controlStyle` pattern + theme tokens      | Task 3 (inline button matches token palette)            |
| AuthForm: toggle Sign up / Log in                      | Task 4                                                  |
| Email + password inputs                                | Task 4                                                  |
| `signUp()` → confirmation message, not immediate login | Task 4                                                  |
| `signInWithPassword()` → navigate to `/`               | Task 4                                                  |
| OAuth buttons: clear placeholder, no rendering         | Task 4 (comment in LoginPage.tsx)                       |
| Error messaging on failure                             | Task 4                                                  |
| Loading state during request                           | Task 4 (isLoading on Button)                            |
| `/auth/callback`: loading state, navigate to `/`       | Task 5                                                  |
| server.ts catch-all for SPA routes                     | Task 8                                                  |
| CLAUDE.md updated                                      | Task 9                                                  |
| Review browsing unchanged                              | Tasks 7, 10                                             |
| Google/Facebook OAuth deferred                         | N/A — spec OBS                                          |
