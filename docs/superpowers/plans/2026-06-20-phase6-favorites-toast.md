# Phase 6: Favorites + Toast Convention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `useFeedbackToast` hook and per-user favorites (heart toggle + filter switch) to the Metal Reviews Dashboard.

**Architecture:** `useFeedbackToast` wraps Chakra's `useToast` into three named methods used everywhere. `ArtworkBlock` gains two props (`isFavorited`, `onToggle`) and a heart icon. All favorites state lives in `App.tsx` — a `Set<string>` hydrated from Supabase on login, cleared on logout — alongside a `toggleFavorite` function. The counter row becomes a flex row: review count on the left, favorites switch on the right (logged-in only).

**Tech Stack:** React 18, TypeScript, Chakra UI v2, Supabase JS client, `react-icons/fa`, Vitest + @testing-library/react

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/hooks/useFeedbackToast.tsx` | Three-method toast wrapper |
| Create | `src/__tests__/useFeedbackToast.test.tsx` | Unit tests for the hook |
| Create | `src/__tests__/ArtworkBlock.test.tsx` | Unit tests for heart icon |
| Create | `src/__tests__/App.favorites.test.tsx` | Integration tests for toggle + filter |
| Modify | `src/App.tsx` | All favorites logic, counter row, 409 migration |
| Modify | `CLAUDE.md` | Toast convention section |

---

## Task 1: Create the `favorites` table in Supabase

**Files:** No code — manual SQL only.

- [ ] **Step 1: Run this SQL in the Supabase dashboard SQL Editor** (Project → SQL Editor → New query)

```sql
create table favorites (
  user_id    uuid         references auth.users(id) not null,
  review_id  text         references reviews(id)    not null,
  created_at timestamptz  default now(),
  primary key (user_id, review_id)
);

alter table favorites enable row level security;

create policy "Users manage their own favorites"
on favorites for all
to authenticated
using  (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

- [ ] **Step 2: Verify** — in Supabase Table Editor, the `favorites` table should appear with `user_id`, `review_id`, `created_at` columns and RLS enabled (padlock icon).

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: create favorites table and RLS policy in Supabase"
```

---

## Task 2: `useFeedbackToast` hook

**Files:**
- Create: `src/hooks/useFeedbackToast.tsx`
- Create: `src/__tests__/useFeedbackToast.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
// src/__tests__/useFeedbackToast.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import theme from '../theme';
import { useFeedbackToast } from '../hooks/useFeedbackToast';

const mockToast = vi.fn();

vi.mock('@chakra-ui/react', async () => {
  const actual = await vi.importActual<typeof import('@chakra-ui/react')>('@chakra-ui/react');
  return { ...actual, useToast: () => mockToast };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}

describe('useFeedbackToast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('showSuccess calls toast with success status and 3000ms duration', () => {
    const { result } = renderHook(() => useFeedbackToast(), { wrapper });
    result.current.showSuccess('Added to favorites');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Added to favorites',
      status: 'success',
      duration: 3000,
      isClosable: true,
      position: 'bottom-right',
    }));
  });

  it('showError calls toast with error status and 4000ms duration', () => {
    const { result } = renderHook(() => useFeedbackToast(), { wrapper });
    result.current.showError('Could not save — try again');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Could not save — try again',
      status: 'error',
      duration: 4000,
      isClosable: true,
      position: 'bottom-right',
    }));
  });

  it('showAction calls toast with null duration and a render prop', () => {
    const { result } = renderHook(() => useFeedbackToast(), { wrapper });
    result.current.showAction('Log in to save favorites', {
      label: 'Log in',
      onClick: vi.fn(),
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      duration: null,
      isClosable: true,
      position: 'bottom-right',
      render: expect.any(Function),
    }));
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```
npx vitest run src/__tests__/useFeedbackToast.test.tsx
```

Expected: FAIL — "Cannot find module '../hooks/useFeedbackToast'"

- [ ] **Step 3: Create `src/hooks/` and the hook file**

Create directory `src/hooks/` then create:

```tsx
// src/hooks/useFeedbackToast.tsx
import React from 'react';
import { useToast, Box, Button } from '@chakra-ui/react';

export function useFeedbackToast() {
  const toast = useToast();

  function showSuccess(message: string) {
    toast({
      title: message,
      status: 'success',
      duration: 3000,
      isClosable: true,
      position: 'bottom-right',
    });
  }

  function showError(message: string) {
    toast({
      title: message,
      status: 'error',
      duration: 4000,
      isClosable: true,
      position: 'bottom-right',
    });
  }

  function showAction(message: string, action: { label: string; onClick: () => void }) {
    toast({
      position: 'bottom-right',
      duration: null,
      isClosable: true,
      render: ({ onClose }) => (
        <Box
          bg="surface.card"
          color="text.primary"
          px={4}
          py={3}
          borderRadius="md"
          boxShadow="lg"
          display="flex"
          alignItems="center"
          gap={3}
          border="1px solid"
          borderColor="border.default"
        >
          <Box flex={1} fontSize="sm">{message}</Box>
          <Button
            size="sm"
            variant="outline"
            borderColor="border.default"
            color="text.primary"
            _hover={{ borderColor: 'border.hover' }}
            onClick={() => { action.onClick(); onClose(); }}
          >
            {action.label}
          </Button>
        </Box>
      ),
    });
  }

  return { showSuccess, showError, showAction };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run src/__tests__/useFeedbackToast.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFeedbackToast.tsx src/__tests__/useFeedbackToast.test.tsx
git commit -m "feat: add useFeedbackToast hook with showSuccess, showError, showAction"
```

---

## Task 3: Install `react-icons` and add heart icon to `ArtworkBlock`

**Files:**
- Modify: `src/App.tsx` — export `ArtworkBlock`, add two new props, add heart button
- Create: `src/__tests__/ArtworkBlock.test.tsx`

- [ ] **Step 1: Create the ArtworkBlock test file**

```tsx
// src/__tests__/ArtworkBlock.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import theme from '../theme';
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
  AuthProvider: ({ children }: any) => children,
}));

// App.tsx will import useFeedbackToast after Task 4 — pre-mock it so it doesn't break these tests
vi.mock('../hooks/useFeedbackToast', () => ({
  useFeedbackToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showAction: vi.fn(),
  }),
}));

const mockReview = {
  id: 'rev1',
  source: 'Angry Metal Guy',
  band: 'Opeth',
  album: 'Blackwater Park',
  genre: ['progressive metal'],
  score: '9/10',
  summary: 'A classic.',
  url: 'https://example.com',
  publishedAt: '2006-01-01T00:00:00Z',
  publishedDate: '1 Jan 2006',
  normalizedScore: 90,
  artworkUrl: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}

describe('ArtworkBlock', () => {
  it('renders an "Add to favorites" button when not favorited', () => {
    render(
      <ArtworkBlock rev={mockReview} isFavorited={false} onToggle={vi.fn()} />,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  });

  it('renders a "Remove from favorites" button when favorited', () => {
    render(
      <ArtworkBlock rev={mockReview} isFavorited={true} onToggle={vi.fn()} />,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });

  it('calls onToggle when the heart button is clicked', () => {
    const onToggle = vi.fn();
    render(
      <ArtworkBlock rev={mockReview} isFavorited={false} onToggle={onToggle} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```
npx vitest run src/__tests__/ArtworkBlock.test.tsx
```

Expected: FAIL — `ArtworkBlock` is not a named export / missing props

- [ ] **Step 3: Install react-icons**

```
npm install react-icons
```

- [ ] **Step 4: Update `ArtworkBlock` in `src/App.tsx`**

Add `Icon` to the Chakra import list (already has `Image`, `Skeleton` — add `Icon` alongside them):

```tsx
import {
  Box, Button, Heading, Text, VStack, Container, Input, Select,
  SimpleGrid, Tag, Wrap, WrapItem, Flex, Spinner, Link, Image,
  Skeleton, Icon, FormControl, FormLabel, Switch,
} from '@chakra-ui/react';
```

Add the react-icons import after the existing `@chakra-ui/icons` import:

```tsx
import { FaHeart, FaRegHeart } from 'react-icons/fa';
```

Replace the existing `function ArtworkBlock` (unexported, no new props) with this exported version:

```tsx
export function ArtworkBlock({
  rev,
  isFavorited,
  onToggle,
}: {
  rev: Review;
  isFavorited: boolean;
  onToggle: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Box position="relative" paddingBottom="100%" bg="surface.darkest">
      {rev.artworkUrl ? (
        <>
          <Image
            src={rev.artworkUrl}
            alt={`${rev.band} – ${rev.album}`}
            objectFit="cover"
            w="100%"
            h="100%"
            position="absolute"
            top={0}
            left={0}
            onLoad={() => setLoaded(true)}
          />
          <Skeleton
            position="absolute"
            top={0}
            left={0}
            w="100%"
            h="100%"
            opacity={loaded ? 0 : 1}
            transition="opacity 0.3s ease"
            pointerEvents="none"
          />
        </>
      ) : (
        <Flex
          position="absolute"
          top={0}
          left={0}
          w="100%"
          h="100%"
          direction="column"
          align="center"
          justify="center"
        >
          <Text fontSize="3xl" color="text.muted">♪</Text>
          <Text fontSize="xs" color="text.muted">No artwork found</Text>
        </Flex>
      )}

      {/* Heart toggle — top-right corner (the one open corner: source is bottom-left,
          score is bottom-right). e.stopPropagation() prevents the wrapping <Link>
          from navigating to the review URL when the heart is clicked. */}
      <Box
        as="button"
        aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        position="absolute"
        top={2}
        right={2}
        bg="blackAlpha.400"
        borderRadius="full"
        p={1}
        display="flex"
        alignItems="center"
        justifyContent="center"
        border="none"
        cursor="pointer"
        _hover={{ bg: 'blackAlpha.600' }}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
      >
        <Icon
          as={isFavorited ? FaHeart : FaRegHeart}
          color={isFavorited ? 'red.400' : 'whiteAlpha.700'}
          boxSize={4}
        />
      </Box>

      {/* Source badge — bottom-left corner */}
      <Box
        position="absolute"
        bottom={2}
        left={2}
        bg="surface.raised"
        color="text.dim"
        fontSize="xs"
        fontWeight="semibold"
        px={2}
        py="2px"
        borderRadius="base"
        maxW="calc(100% - 70px)"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {rev.source}
      </Box>

      {/* Score badge — bottom-right corner */}
      {rev.score && rev.score !== '' && (
        <Box
          position="absolute"
          bottom="2"
          right="2"
          bg="brand.score"
          color="brand.scoreText"
          borderRadius="base"
          px={2}
          py={1}
          fontSize="xs"
          fontWeight="bold"
        >
          {rev.score}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Run ArtworkBlock tests to confirm they pass**

```
npx vitest run src/__tests__/ArtworkBlock.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/__tests__/ArtworkBlock.test.tsx package.json package-lock.json
git commit -m "feat: add heart icon to ArtworkBlock with isFavorited/onToggle props"
```

---

## Task 4: Favorites state, hydration, and `toggleFavorite` in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Create: `src/__tests__/App.favorites.test.tsx`

- [ ] **Step 1: Create the integration test file**

```tsx
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
    await waitFor(() => screen.getByText('Opeth'));
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(mockShowAction).toHaveBeenCalledWith(
      'Log in to save favorites',
      expect.objectContaining({ label: 'Log in' })
    );
  });

  it('hides the favorites switch when logged out', async () => {
    render(<App />, { wrapper });
    await waitFor(() => screen.getByText('Opeth'));
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
    await waitFor(() => screen.getByText('Opeth'));
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
    await waitFor(() => screen.getByText('Metallica'));
    expect(screen.getByText('Opeth')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/favorites only/i));

    await waitFor(() =>
      expect(screen.queryByText('Metallica')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Opeth')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```
npx vitest run src/__tests__/App.favorites.test.tsx
```

Expected: FAIL — App has no `useAuth`, no `favoritedIds`, no `toggleFavorite`

- [ ] **Step 3: Update imports in `src/App.tsx`**

Remove `useToast` from the Chakra import. Add `FormControl`, `FormLabel`, `Switch`, `Icon` to the Chakra import (you already added `Icon` in Task 3 — confirm it's there):

```tsx
import {
  Box, Button, Heading, Text, VStack, Container, Input, Select,
  SimpleGrid, Tag, Wrap, WrapItem, Flex, Spinner, Link, Image,
  Skeleton, Icon, FormControl, FormLabel, Switch,
} from '@chakra-ui/react';
```

Add new imports after the existing `import { Header }` line:

```tsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
```

- [ ] **Step 4: Replace state declarations inside `App()`**

Remove the existing `const toast = useToast();` line. Add after the existing `useState` declarations:

```tsx
const { user } = useAuth();
const navigate = useNavigate();
const { showSuccess, showError, showAction } = useFeedbackToast();
const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
```

- [ ] **Step 5: Add favorites hydration effect**

Add this `useEffect` immediately after the existing reviews-loading `useEffect`:

```tsx
// Fetch the current user's favorited review IDs on login; clear on logout.
// RLS restricts the query to the signed-in user's own rows automatically.
useEffect(() => {
  if (!user) {
    setFavoritedIds(new Set());
    setShowFavoritesOnly(false);
    return;
  }
  supabase
    .from('favorites')
    .select('review_id')
    .then(({ data, error }: { data: { review_id: string }[] | null; error: any }) => {
      if (!error && data) {
        setFavoritedIds(new Set(data.map((row) => row.review_id)));
      }
    });
}, [user]);
```

- [ ] **Step 6: Add `toggleFavorite` function**

Add this function after the two `useEffect` blocks:

```tsx
async function toggleFavorite(reviewId: string) {
  if (!user) {
    showAction('Log in to save favorites', {
      label: 'Log in',
      onClick: () => navigate('/login'),
    });
    return;
  }
  const isFavorited = favoritedIds.has(reviewId);
  if (isFavorited) {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('review_id', reviewId);
    if (error) { showError('Could not remove favorite — try again'); return; }
    setFavoritedIds((prev) => { const next = new Set(prev); next.delete(reviewId); return next; });
    showSuccess('Removed from favorites');
  } else {
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: user.id, review_id: reviewId });
    if (error) { showError('Could not save favorite — try again'); return; }
    setFavoritedIds((prev) => new Set(prev).add(reviewId));
    showSuccess('Added to favorites');
  }
}
```

- [ ] **Step 7: Update `<ArtworkBlock>` usage in the card grid**

Find `<ArtworkBlock rev={rev} />` in the `filtered.map()` and replace it with:

```tsx
<ArtworkBlock
  rev={rev}
  isFavorited={favoritedIds.has(rev.id)}
  onToggle={() => toggleFavorite(rev.id)}
/>
```

- [ ] **Step 8: Run the integration tests**

```
npx vitest run src/__tests__/App.favorites.test.tsx
```

Expected: PASS (8 tests)

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/__tests__/App.favorites.test.tsx
git commit -m "feat: add favorites state, hydration, and toggleFavorite to App"
```

---

## Task 5: Counter row layout + favorites filter switch

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add favorites filter step to the `filtered` pipeline**

Find the `.sort(...)` at the end of the `filtered` chain. Insert one new `.filter()` step before it:

```tsx
const filtered = reviews
  .filter((r) => (filterSource === 'All' ? true : r.source === filterSource))
  .filter((r) => (minScore === '' ? true : r.normalizedScore >= parseFloat(minScore) * 10))
  .filter((r) => (showFavoritesOnly ? favoritedIds.has(r.id) : true))
  .filter((r) => {
    const term = search.toLowerCase();
    return (
      r.band.toLowerCase().includes(term) ||
      r.album.toLowerCase().includes(term) ||
      (r.genre ?? []).some((g) => g.toLowerCase().includes(term))
    );
  })
  .sort((a, b) => {
    if (sortKey === 'date') {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    }
    return b.normalizedScore - a.normalizedScore;
  });
```

- [ ] **Step 2: Replace the review counter `<Text>` with a flex row**

Find this block (inside `{!loading && (...)}`):

```tsx
<Text fontSize="md" fontWeight="bold"  color="text.dim" mt={0} paddingLeft={1} >
  {filtered.length < reviews.length
    ? `${filtered.length} of ${reviews.length} reviews`
    : `${reviews.length} reviews`}
</Text>
```

Replace with:

```tsx
<Flex align="center" justify="space-between">
  <Text fontSize="md" fontWeight="bold" color="text.dim" paddingLeft={1}>
    {filtered.length < reviews.length
      ? `${filtered.length} of ${reviews.length} reviews`
      : `${reviews.length} reviews`}
  </Text>
  {user && (
    <FormControl display="flex" alignItems="center" gap={2} w="auto">
      <FormLabel
        htmlFor="favorites-toggle"
        mb={0}
        fontSize="sm"
        color="text.dim"
        cursor="pointer"
        whiteSpace="nowrap"
      >
        Favorites only
      </FormLabel>
      <Switch
        id="favorites-toggle"
        isChecked={showFavoritesOnly}
        onChange={(e) => setShowFavoritesOnly(e.target.checked)}
        colorScheme="teal"
      />
    </FormControl>
  )}
</Flex>
```

- [ ] **Step 3: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass (the integration tests in App.favorites.test.tsx already cover switch visibility and filter behavior).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add favorites filter switch to counter row"
```

---

## Task 6: Migrate the 409 toast to `useFeedbackToast`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the inline 409 toast call in `handleRefresh`**

Find this block inside `handleRefresh`:

```tsx
toast({
  title: 'Ingest already running, please wait',
  status: 'warning',
  duration: 4000,
  isClosable: true,
});
```

Replace with:

```tsx
showError('Ingest already running, please wait');
```

- [ ] **Step 2: Verify `useToast` is gone from `src/App.tsx`**

```
npx grep -n "useToast" src/App.tsx
```

Expected: no output.

- [ ] **Step 3: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: migrate 409 toast in handleRefresh to useFeedbackToast"
```

---

## Task 7: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the toast convention section**

In `CLAUDE.md`, add a new top-level section after `## Score normalization` and before `## Adding a new scraper source`:

```markdown
## Toast feedback convention

Every CRUD action (create/update/delete) shows a toast via `useFeedbackToast()` from `src/hooks/useFeedbackToast.tsx`.

- `showSuccess(message)` — green, 3 s
- `showError(message)` — red, 4 s
- `showAction(message, { label, onClick })` — neutral, persistent; used for logged-out attempts at gated actions (shows a button in the toast body, no hard redirect)

`useFeedbackToast` is the **only** `useToast` call site in the codebase. Do not call `useToast` directly.

See `docs/decisions/favorites.md` for full Phase 6 rationale (written after implementation).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document toast feedback convention in CLAUDE.md"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify single toast call site**

```
grep -rn "useToast" src/
```

Expected: exactly one match — inside `src/hooks/useFeedbackToast.tsx`.
