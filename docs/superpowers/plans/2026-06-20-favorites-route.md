# Favorites Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected `/favorites` route that displays the user's favorited albums as a dense read-only list, with forward-looking data plumbing for a future `manual_albums` source.

**Architecture:** Two-query data layer (favorites→reviews join + stubbed manual source) normalized into a shared `FavoriteListItem` shape, merged client-side in a new `useFavoritesList` hook. `RequireAuth` wrapper provides the first reusable auth guard, registered in main.tsx alongside a `/aoty/:shareId` placeholder rename.

**Tech Stack:** React, Chakra UI, Supabase JS client, React Router DOM v7, Vitest + React Testing Library

**Router import note:** `main.tsx` uses `react-router-dom` (not `react-router`). CLAUDE.md says "react-router v7" but `auth-routing.md` and the actual code both say `react-router-dom`. Use `react-router-dom` everywhere.

---

## File Map

| File                                     | Action | Responsibility                                                 |
| ---------------------------------------- | ------ | -------------------------------------------------------------- |
| `src/RequireAuth.tsx`                    | Create | Auth-guard HOC — redirects to `/login` if no user              |
| `src/hooks/useFavoritesList.ts`          | Create | Data hook: two-source merge, `FavoriteListItem` shape          |
| `src/FavoritesPage.tsx`                  | Create | Read-only list view: thumbnail, band/album, date, genres       |
| `src/App.tsx`                            | Modify | Export `formatReleaseDate` (currently private)                 |
| `src/Header.tsx`                         | Modify | Add "Favorites" nav link for logged-in users                   |
| `src/main.tsx`                           | Modify | Register `/favorites` route; rename `/list` comment to `/aoty` |
| `src/__tests__/RequireAuth.test.tsx`     | Create | Tests for redirect + render                                    |
| `src/__tests__/useFavoritesList.test.ts` | Create | Tests for loading, data mapping, error                         |
| `src/__tests__/FavoritesPage.test.tsx`   | Create | Tests for list layout, empty/loading states, field visibility  |
| `src/__tests__/Header.test.tsx`          | Modify | Add assertions for Favorites link                              |
| `docs/decisions/favorites-view.md`       | Create | Decision record for this brief                                 |

---

## Task 1: Export `formatReleaseDate` from App.tsx

`formatReleaseDate` is currently a private function in `App.tsx`. `FavoritesPage` needs it. The minimum change: add `export` keyword.

**Files:**

- Modify: `src/App.tsx` (line 100 — the `function formatReleaseDate` declaration)

- [ ] **Step 1: Add the export keyword**

In `src/App.tsx`, change line 100 from:

```ts
function formatReleaseDate(d: string | null): string {
```

to:

```ts
export function formatReleaseDate(d: string | null): string {
```

- [ ] **Step 2: Verify type-check passes**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: export formatReleaseDate for reuse in FavoritesPage"
```

---

## Task 2: RequireAuth wrapper

A reusable auth-guard component. Renders `null` during session hydration, redirects to `/login` when logged out, renders children when logged in.

**Files:**

- Create: `src/RequireAuth.tsx`
- Create: `src/__tests__/RequireAuth.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/RequireAuth.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from '../RequireAuth';
import theme from '../theme';

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../AuthContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <MemoryRouter initialEntries={['/favorites']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/favorites" element={children} />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>
  );
}

describe('RequireAuth', () => {
  it('renders nothing while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true });
    const { container } = render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
      { wrapper }
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('redirects to /login when user is null', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
      { wrapper }
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when user is logged in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'dan@test.com' } as any,
      loading: false,
    });
    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
      { wrapper }
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/__tests__/RequireAuth.test.tsx
```

Expected: FAIL — `RequireAuth` not found.

- [ ] **Step 3: Implement RequireAuth**

Create `src/RequireAuth.tsx`:

```tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/RequireAuth.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/RequireAuth.tsx src/__tests__/RequireAuth.test.tsx
git commit -m "feat: add RequireAuth wrapper for protected routes"
```

---

## Task 3: useFavoritesList hook

Two-query data hook: reads the user's `favorites` rows (RLS-restricted to the current user automatically), looks up the corresponding `reviews` rows by ID, and merges with a stubbed empty `manual_albums` source. Returns `{ items, loading, error }`.

**Files:**

- Create: `src/hooks/useFavoritesList.ts`
- Create: `src/__tests__/useFavoritesList.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/useFavoritesList.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFavoritesList } from '../hooks/useFavoritesList';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../supabaseClient';

// Helper: builds a supabase.from mock for the two-table query pattern:
//   .from('favorites').select('review_id').then(cb)
//   .from('reviews').select('*').in('id', ids).then(cb)
function makeFromImpl(
  options: {
    favoritesData?: { review_id: string }[];
    favoritesError?: { message: string } | null;
    reviewsData?: Record<string, unknown>[];
    reviewsError?: { message: string } | null;
  } = {}
) {
  const {
    favoritesData = [],
    favoritesError = null,
    reviewsData = [],
    reviewsError = null,
  } = options;

  return (table: string) => {
    if (table === 'favorites') {
      return {
        select: vi.fn().mockReturnValue({
          then: (cb: (v: unknown) => unknown) =>
            Promise.resolve({ data: favoritesData, error: favoritesError }).then(cb),
          catch: (cb: (e: unknown) => unknown) => Promise.resolve().catch(cb),
        }),
      };
    }
    if (table === 'reviews') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            then: (cb: (v: unknown) => unknown) =>
              Promise.resolve({ data: reviewsData, error: reviewsError }).then(cb),
            catch: (cb: (e: unknown) => unknown) => Promise.resolve().catch(cb),
          }),
        }),
      };
    }
    return { select: vi.fn() };
  };
}

const mockReviewRow = {
  id: 'rev1',
  band: 'Opeth',
  album: 'Blackwater Park',
  artwork_url: 'https://example.com/art.jpg',
  release_date: '2001-03-16',
  genre: ['progressive metal', 'death metal'],
  score: '9/10',
  normalized_score: 90,
  source: 'Angry Metal Guy',
  summary: 'A classic.',
  url: 'https://example.com',
  published_at: '2006-01-01T00:00:00Z',
  published_date: '1 Jan 2006',
};

describe('useFavoritesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading: true', () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
    const { result } = renderHook(() => useFavoritesList());
    expect(result.current.loading).toBe(true);
  });

  it('returns an empty list when user has no favorites', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl({ favoritesData: [] }));
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('maps a favorited review to FavoriteListItem shape with type: "review"', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [{ review_id: 'rev1' }],
        reviewsData: [mockReviewRow],
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    const item = result.current.items[0];
    expect(item).toMatchObject({
      id: 'rev1',
      type: 'review',
      band: 'Opeth',
      album: 'Blackwater Park',
      artworkUrl: 'https://example.com/art.jpg',
      releaseDate: '2001-03-16',
      genre: ['progressive metal', 'death metal'],
    });
  });

  it('sets error state when favorites query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesError: { message: 'DB error' } })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load favorites');
    expect(result.current.items).toEqual([]);
  });

  it('sets error state when reviews query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [{ review_id: 'rev1' }],
        reviewsError: { message: 'reviews error' },
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load review data');
  });

  it('sorts items by releaseDate descending, nulls last', async () => {
    const rows = [
      { ...mockReviewRow, id: 'a', release_date: '2020-01-01' },
      { ...mockReviewRow, id: 'b', release_date: null },
      { ...mockReviewRow, id: 'c', release_date: '2024-06-15' },
    ];
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [{ review_id: 'a' }, { review_id: 'b' }, { review_id: 'c' }],
        reviewsData: rows,
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const ids = result.current.items.map((i) => i.id);
    expect(ids).toEqual(['c', 'a', 'b']);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/useFavoritesList.test.ts
```

Expected: FAIL — `useFavoritesList` not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useFavoritesList.ts`:

```ts
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { DbRow } from '../dbMapping';

export interface FavoriteListItem {
  id: string;
  type: 'review' | 'manual';
  band: string;
  album: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  genre: string[];
}

// Placeholder for the future manual_albums table (not yet built).
// When the manual_albums brief lands, replace this stub with a real Supabase query.
function fetchManualAlbums(): Promise<FavoriteListItem[]> {
  return Promise.resolve([]);
}

function sortByReleaseDateDesc(a: FavoriteListItem, b: FavoriteListItem): number {
  if (!a.releaseDate && !b.releaseDate) return 0;
  if (!a.releaseDate) return 1;
  if (!b.releaseDate) return -1;
  return b.releaseDate.localeCompare(a.releaseDate);
}

export function useFavoritesList() {
  const [items, setItems] = useState<FavoriteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from('favorites')
      .select('review_id')
      .then(
        ({ data, error: favError }: { data: { review_id: string }[] | null; error: unknown }) => {
          if (cancelled) return;
          if (favError) {
            setError('Failed to load favorites');
            setLoading(false);
            return;
          }

          const ids = (data ?? []).map((r) => r.review_id);

          if (ids.length === 0) {
            fetchManualAlbums().then((manual) => {
              if (cancelled) return;
              setItems(manual);
              setLoading(false);
            });
            return;
          }

          supabase
            .from('reviews')
            .select('*')
            .in('id', ids)
            .then(
              ({
                data: reviewData,
                error: reviewError,
              }: {
                data: DbRow[] | null;
                error: unknown;
              }) => {
                if (cancelled) return;
                if (reviewError) {
                  setError('Failed to load review data');
                  setLoading(false);
                  return;
                }

                const reviewItems: FavoriteListItem[] = (reviewData ?? []).map((row) => ({
                  id: row.id,
                  type: 'review' as const,
                  band: row.band,
                  album: row.album,
                  artworkUrl: row.artwork_url,
                  releaseDate: row.release_date ?? null,
                  genre: row.genre ?? [],
                }));

                fetchManualAlbums().then((manual) => {
                  if (cancelled) return;
                  const merged = [...reviewItems, ...manual].sort(sortByReleaseDateDesc);
                  setItems(merged);
                  setLoading(false);
                });
              }
            )
            .catch((e: unknown) => {
              if (cancelled) return;
              console.warn('Failed to load review data for favorites', e);
              setError('Failed to load review data');
              setLoading(false);
            });
        }
      )
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('Failed to load favorites', e);
        setError('Failed to load favorites');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/useFavoritesList.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFavoritesList.ts src/__tests__/useFavoritesList.test.ts
git commit -m "feat: add useFavoritesList hook with two-source merge and manual_albums stub"
```

---

## Task 4: FavoritesPage component

Read-only list view. Each row: 48px thumbnail, band–album name, release date, genre tags. No score badge, no source badge, no summary, no review date.

**Files:**

- Create: `src/FavoritesPage.tsx`
- Create: `src/__tests__/FavoritesPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/FavoritesPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { FavoritesPage } from '../FavoritesPage';
import theme from '../theme';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

vi.mock('../hooks/useFavoritesList', () => ({
  useFavoritesList: vi.fn(),
}));

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({ user: { email: 'dan@test.com' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}));

import { useFavoritesList } from '../hooks/useFavoritesList';

const mockItem: FavoriteListItem = {
  id: 'rev1',
  type: 'review',
  band: 'Opeth',
  album: 'Blackwater Park',
  artworkUrl: 'https://example.com/art.jpg',
  releaseDate: '2001-03-16',
  genre: ['progressive metal', 'death metal'],
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('FavoritesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while loading', () => {
    vi.mocked(useFavoritesList).mockReturnValue({ items: [], loading: true, error: null });
    render(<FavoritesPage />, { wrapper });
    expect(
      screen.getByText(/spinner/i) ||
        document.querySelector('[class*="spinner"]') ||
        document.querySelector('span[data-testid]') ||
        // Chakra Spinner renders as a role="status" element
        screen.getByRole('status')
    ).toBeTruthy();
  });

  it('shows empty state when list is empty', () => {
    vi.mocked(useFavoritesList).mockReturnValue({ items: [], loading: false, error: null });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(/no favorites yet/i)).toBeInTheDocument();
    expect(screen.getByText(/heart an album/i)).toBeInTheDocument();
  });

  it('renders band and album for each item', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText(/Opeth/)).toBeInTheDocument();
    expect(screen.getByText(/Blackwater Park/)).toBeInTheDocument();
  });

  it('renders the formatted release date', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('16 Mar 2001')).toBeInTheDocument();
  });

  it('renders genre tags', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.getByText('progressive metal')).toBeInTheDocument();
    expect(screen.getByText('death metal')).toBeInTheDocument();
  });

  it('does NOT render a score badge', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    // Score would be text like "9/10" — not rendered on this page
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
  });

  it('does NOT render a source badge', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByText('Angry Metal Guy')).not.toBeInTheDocument();
  });

  it('renders artwork thumbnail when artworkUrl is present', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [mockItem],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
    expect(img).toHaveAttribute('alt', 'Opeth – Blackwater Park');
  });

  it('renders ♪ placeholder when artworkUrl is null', () => {
    vi.mocked(useFavoritesList).mockReturnValue({
      items: [{ ...mockItem, artworkUrl: null }],
      loading: false,
      error: null,
    });
    render(<FavoritesPage />, { wrapper });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('♪')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/FavoritesPage.test.tsx
```

Expected: FAIL — `FavoritesPage` not found.

- [ ] **Step 3: Implement FavoritesPage**

Create `src/FavoritesPage.tsx`:

```tsx
import React from 'react';
import {
  Box,
  Container,
  Flex,
  Heading,
  Image,
  Spinner,
  Tag,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Header } from './Header';
import { useFavoritesList } from './hooks/useFavoritesList';
import { formatReleaseDate } from './App';

export function FavoritesPage() {
  const { items, loading } = useFavoritesList();

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack spacing={6} align="stretch">
          <Header />
          <Heading size="lg">My Favorites</Heading>

          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner size="xl" color="accent.start" thickness="4px" speed="0.65s" />
            </Flex>
          ) : items.length === 0 ? (
            <Text textAlign="center" color="text.muted">
              No favorites yet. Heart an album from the dashboard to add it here.
            </Text>
          ) : (
            <VStack spacing={3} align="stretch">
              {items.map((item) => (
                <Flex
                  key={item.id}
                  align="center"
                  gap={4}
                  bg="surface.card"
                  borderRadius="lg"
                  p={3}
                  border="1px solid"
                  borderColor="border.default"
                >
                  <Box
                    flexShrink={0}
                    w="48px"
                    h="48px"
                    borderRadius="base"
                    overflow="hidden"
                    bg="surface.darkest"
                  >
                    {item.artworkUrl ? (
                      <Image
                        src={item.artworkUrl}
                        alt={`${item.band} – ${item.album}`}
                        w="48px"
                        h="48px"
                        objectFit="cover"
                      />
                    ) : (
                      <Flex w="100%" h="100%" align="center" justify="center">
                        <Text fontSize="lg" color="text.muted">
                          ♪
                        </Text>
                      </Flex>
                    )}
                  </Box>

                  <Box flex={1} minW={0}>
                    <Text fontWeight="semibold" noOfLines={1}>
                      {item.band} – {item.album}
                    </Text>
                    <Text fontSize="sm" color="text.dim">
                      {formatReleaseDate(item.releaseDate)}
                    </Text>
                    {item.genre.length > 0 && (
                      <Wrap spacing={1} mt={1}>
                        {item.genre.map((g) => (
                          <WrapItem key={g}>
                            <Tag
                              size="sm"
                              bg="whiteAlpha.100"
                              color="purple.300"
                              borderRadius="base"
                            >
                              {g}
                            </Tag>
                          </WrapItem>
                        ))}
                      </Wrap>
                    )}
                  </Box>
                </Flex>
              ))}
            </VStack>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/FavoritesPage.test.tsx
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/FavoritesPage.tsx src/__tests__/FavoritesPage.test.tsx
git commit -m "feat: add FavoritesPage list view component"
```

---

## Task 5: Register route and rename placeholder in main.tsx

Add `/favorites` route wrapped in `RequireAuth`. Rename the `/list/:shareId` placeholder comment to `/aoty/:shareId`.

**Files:**

- Modify: `src/main.tsx`

No dedicated test for route registration (covered by FavoritesPage and RequireAuth tests; integration-level route testing is out of scope).

- [ ] **Step 1: Update main.tsx**

Replace the existing router definition in `src/main.tsx`. Change from:

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
```

To:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import App from './App';
import { LoginPage } from './LoginPage';
import { AuthCallback } from './AuthCallback';
import { AuthProvider } from './AuthContext';
import { RequireAuth } from './RequireAuth';
import { FavoritesPage } from './FavoritesPage';
import theme from './theme';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  {
    path: '/favorites',
    element: (
      <RequireAuth>
        <FavoritesPage />
      </RequireAuth>
    ),
  },
  // { path: '/aoty/:shareId', element: <SharedList /> }  — reserved for public AOTY share view
]);
```

- [ ] **Step 2: Verify type-check passes**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: register /favorites route and rename /list placeholder to /aoty"
```

---

## Task 6: Add Favorites nav link to Header

A "Favorites" link visible only when the user is logged in, placed between the username and the Log out button.

**Files:**

- Modify: `src/Header.tsx`
- Modify: `src/__tests__/Header.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add two tests to `src/__tests__/Header.test.tsx` (append to the existing `describe('Header', ...)` block):

```tsx
it('renders a Favorites link when logged in', () => {
  vi.mocked(useAuth).mockReturnValue({
    user: { email: 'dan@example.com' } as any,
    loading: false,
  });
  render(<Header />, { wrapper });
  expect(screen.getByRole('link', { name: /favorites/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /favorites/i })).toHaveAttribute('href', '/favorites');
});

it('does NOT render a Favorites link when logged out', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
  render(<Header />, { wrapper });
  expect(screen.queryByRole('link', { name: /favorites/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to confirm the new ones fail**

```bash
npx vitest run src/__tests__/Header.test.tsx
```

Expected: 4 existing tests pass, 2 new tests fail.

- [ ] **Step 3: Update Header.tsx**

In `src/Header.tsx`, update the logged-in section of the returned JSX. Change from:

```tsx
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
```

To:

```tsx
          {user ? (
            <>
              <Text fontSize="sm" color="text.dim">
                {user.email?.split('@')[0]}
              </Text>
              <Link
                as={RouterLink}
                to="/favorites"
                fontSize="sm"
                color="accent.text"
                _hover={{ color: 'accent.start', textDecoration: 'none' }}
              >
                Favorites
              </Link>
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
```

- [ ] **Step 4: Run all Header tests to confirm they pass**

```bash
npx vitest run src/__tests__/Header.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/Header.tsx src/__tests__/Header.test.tsx
git commit -m "feat: add Favorites nav link to Header for logged-in users"
```

---

## Task 7: Full test suite and type-check

Verify nothing is broken across the full suite.

- [ ] **Step 1: Run all tests**

```bash
npm run test -- --run
```

Expected: all existing tests still pass, new tests pass.

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

Expected: no errors.

---

## Task 8: Decision document

Write the decision record capturing what was built and resolving the router import ambiguity.

**Files:**

- Create: `docs/decisions/favorites-view.md`

- [ ] **Step 1: Write the decision doc**

Create `docs/decisions/favorites-view.md`:

```markdown
# Session decisions — Favorites View (Phase 7a, June 2026)

## What was built

- **`RequireAuth`** (`src/RequireAuth.tsx`) — reusable auth-guard wrapper. Renders `null` during session hydration (avoids a flash), redirects to `/login` with `replace` when logged out, passes children through when logged in. First protected route in the app.
- **`/favorites` route** — registered in `main.tsx`, wrapped in `RequireAuth`. The commented-out `/list/:shareId` placeholder was renamed to `/aoty/:shareId` (public AOTY share view, future).
- **`useFavoritesList`** (`src/hooks/useFavoritesList.ts`) — two-query hook: `favorites.select('review_id')` (RLS-restricted to current user automatically), then `reviews.select('*').in('id', ids)`. Merged with a stubbed `fetchManualAlbums()` that returns `[]`. Items sorted by `releaseDate` descending, nulls last. Each item carries `type: 'review' | 'manual'` for future use — not rendered.
- **`FavoritesPage`** (`src/FavoritesPage.tsx`) — dense list layout (not card grid). Each row: 48px artwork thumbnail, band–album heading, formatted release date, genre tags. No score badge, no source badge, no summary, no review date.
- **Header nav link** — "Favorites" link added to `Header.tsx` inside the logged-in block, between username and Log out button.

## Router import — resolved ambiguity

CLAUDE.md said "React Router v7" without specifying the package. `auth-routing.md` said `react-router-dom`. The actual `main.tsx` import is `react-router-dom`. All new code uses `react-router-dom`. If CLAUDE.md is ever updated to name the package explicitly, it should say `react-router-dom`.

## Key decisions

### Two-query approach over Supabase JOIN

`favorites` stores only `(user_id, review_id)`. Options:

1. `.from('favorites').select('review_id, reviews(*)')` — Supabase embedded join via FK
2. Two sequential queries: select IDs, then `reviews.in('id', ids)`

Chose option 2. The embedded join requires the FK to be set up correctly on the Supabase side and produces a nested response shape that needs flattening. Two plain queries are simpler, easier to test, and the performance difference is negligible for a personal-scale list.

### Client-side merge over SQL UNION

The brief specifies client-side merge. `manual_albums` doesn't exist yet, so SQL UNION would require a dummy subquery. Client-side keeps both sources independent and easy to stub/replace.

### formatReleaseDate exported from App.tsx

`formatReleaseDate` was a private function in `App.tsx`. Rather than duplicating it or moving it to a new utils file (unnecessary churn), we added `export` to the existing declaration. This is the only change to `App.tsx` in this brief.

### list layout, not card grid

Deliberate: the favorites view is for managing a known set, not browsing for discovery. Dense single-row layout reinforces this intent. `ArtworkBlock` was not reused — it carries score badge, source badge, and heart toggle logic that don't belong here.

## What NOT to change

- `fetchManualAlbums()` in `useFavoritesList.ts` returns `[]` — it is a named stub, not a TODO. Do not remove it; replacing it with a real query is the manual_albums brief's job.
- `type: 'review' | 'manual'` is on `FavoriteListItem` intentionally. It is never rendered on this page. Do not add UI for it here.
- Do not add a remove-from-favorites action to `FavoritesPage` — this brief is read-only. The existing heart toggle on the main dashboard is the only removal path until a future brief addresses it.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/favorites-view.md
git commit -m "docs: add favorites-view decision record"
```

---

## Definition of Done Checklist

- [ ] `/favorites` route registered, protected by `RequireAuth`, redirects to `/login` when logged out
- [ ] `/list/:shareId` comment renamed to `/aoty/:shareId`
- [ ] `useFavoritesList` returns merged list from `favorites`+`reviews` join plus stubbed empty `manual_albums`
- [ ] Each item carries `type: 'review' | 'manual'` internally; not rendered anywhere
- [ ] `FavoritesPage` renders list layout showing only band, album, artwork, release date, genre
- [ ] No score badge, source badge, summary, or review date on `FavoritesPage`
- [ ] Loading state (teal spinner) and empty state message both implemented
- [ ] "Favorites" nav link in `Header.tsx`, logged-in only
- [ ] `npm run type-check` passes
- [ ] `npm run test -- --run` passes
- [ ] `docs/decisions/favorites-view.md` written
