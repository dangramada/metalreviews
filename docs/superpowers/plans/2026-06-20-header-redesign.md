# Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `Header.tsx` to add nav links (Reviews / Favorites), an account dropdown for logged-in users, and a mobile hamburger menu — replacing the current flat title + logout button layout.

**Architecture:** Single-file change to `Header.tsx` (full rewrite). Uses `useLocation()` from `react-router-dom` for active-state detection on nav links, Chakra's `Menu/MenuButton/MenuList/MenuItem` for both the desktop account dropdown and the mobile hamburger menu (two separate `Menu` instances — desktop account menu only holds "Log out"; mobile menu holds nav + account together). Both clusters live inside `!loading` to match existing flash-prevention pattern.

**Tech Stack:** React, Chakra UI (`Menu`, `MenuButton`, `MenuList`, `MenuItem`, `IconButton`, `Icon`), `@chakra-ui/icons` (HamburgerIcon), `react-icons/fa` (FaUserCircle — already installed), `react-router-dom` v7 (`useNavigate`, `useLocation`, `Link`)

**Supersedes:** Task 6 of `docs/superpowers/plans/2026-06-20-favorites-route.md` (the "Add Favorites nav link to Header" task). Do not implement that task separately — this plan replaces it with the full redesign.

**Router import note:** The actual import in `Header.tsx` and `main.tsx` is `react-router-dom`. CLAUDE.md says "react-router v7" which is ambiguous — ignore CLAUDE.md here and use `react-router-dom` throughout.

---

## File Map

| File                                | Action  | Responsibility                                           |
| ----------------------------------- | ------- | -------------------------------------------------------- |
| `src/Header.tsx`                    | Rewrite | New layout: title, desktop nav+account, mobile hamburger |
| `src/__tests__/Header.test.tsx`     | Rewrite | Updated + new tests for all new behaviors                |
| `docs/decisions/header-redesign.md` | Create  | Decision record for this brief                           |

No other files change. Auth logic, routing, App.tsx, and FavoritesPage are out of scope.

---

## Task 1: Rewrite Header.tsx with tests (TDD)

The entire component is being replaced. Write all the tests first against the new API, confirm they fail against the old implementation, then rewrite the component.

**Files:**

- Rewrite: `src/__tests__/Header.test.tsx`
- Rewrite: `src/Header.tsx`

- [ ] **Step 1: Write the full new test file**

Replace the entire contents of `src/__tests__/Header.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/__tests__/Header.test.tsx
```

Expected: Multiple failures — title test fails ("Metal Reviews Dashboard" found, not "Metal Reviews"), nav link tests fail (no Reviews/Favorites links), account menu tests fail (no MenuButton), hamburger tests fail (no hamburger button).

- [ ] **Step 3: Rewrite Header.tsx**

Replace the entire contents of `src/Header.tsx`:

```tsx
import React from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  IconButton,
  Link,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { FaUserCircle } from 'react-icons/fa';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';

export function Header() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const isReviewsActive = location.pathname === '/';
  const isFavoritesActive = location.pathname === '/favorites';

  return (
    <Flex align="center" justify="space-between" mb={6}>
      <Heading as="h1" size="xl" bgGradient="linear(to-r, accent.start, accent.end)" bgClip="text">
        Metal Reviews
      </Heading>

      {!loading && (
        <>
          {/* Desktop: nav links + account control — hidden below md breakpoint */}
          <Flex align="center" gap={6} display={{ base: 'none', md: 'flex' }}>
            <Flex align="center" gap={4}>
              <Link
                as={RouterLink}
                to="/"
                fontSize="sm"
                color={isReviewsActive ? 'accent.text' : 'text.dim'}
                textDecoration={isReviewsActive ? 'underline' : 'none'}
                _hover={{ color: 'accent.start', textDecoration: 'none' }}
              >
                Reviews
              </Link>
              <Link
                as={RouterLink}
                to="/favorites"
                fontSize="sm"
                color={isFavoritesActive ? 'accent.text' : 'text.dim'}
                textDecoration={isFavoritesActive ? 'underline' : 'none'}
                _hover={{ color: 'accent.start', textDecoration: 'none' }}
              >
                Favorites
              </Link>
            </Flex>

            {user ? (
              <Menu>
                <MenuButton
                  as={Button}
                  size="sm"
                  variant="ghost"
                  rightIcon={<Icon as={FaUserCircle} boxSize={4} color="text.dim" />}
                  color="text.dim"
                  _hover={{ color: 'text.primary', bg: 'surface.raised' }}
                >
                  {user.email?.split('@')[0]}
                </MenuButton>
                <MenuList bg="surface.card" borderColor="border.default" minW="120px">
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    onClick={handleLogout}
                  >
                    Log out
                  </MenuItem>
                </MenuList>
              </Menu>
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

          {/* Mobile: single hamburger that consolidates nav + account — hidden above md */}
          <Box display={{ base: 'block', md: 'none' }}>
            <Menu>
              <MenuButton
                as={IconButton}
                icon={<HamburgerIcon />}
                variant="ghost"
                aria-label="Open menu"
                color="text.dim"
                _hover={{ color: 'text.primary', bg: 'surface.raised' }}
              />
              <MenuList bg="surface.card" borderColor="border.default">
                <MenuItem
                  bg="surface.card"
                  color="text.primary"
                  _hover={{ bg: 'surface.raised' }}
                  onClick={() => navigate('/')}
                >
                  Reviews
                </MenuItem>
                <MenuItem
                  bg="surface.card"
                  color="text.primary"
                  _hover={{ bg: 'surface.raised' }}
                  onClick={() => navigate('/favorites')}
                >
                  Favorites
                </MenuItem>
                {user ? (
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    onClick={handleLogout}
                  >
                    Log out
                  </MenuItem>
                ) : (
                  <MenuItem
                    bg="surface.card"
                    color="text.primary"
                    _hover={{ bg: 'surface.raised' }}
                    onClick={() => navigate('/login')}
                  >
                    Log in
                  </MenuItem>
                )}
              </MenuList>
            </Menu>
          </Box>
        </>
      )}
    </Flex>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/__tests__/Header.test.tsx
```

Expected: All tests pass. If the "does NOT render an account MenuButton when logged out" test fails because the hamburger button has a different aria-label than expected, check `aria-label="Open menu"` matches exactly in the test.

- [ ] **Step 5: Commit**

```bash
git add src/Header.tsx src/__tests__/Header.test.tsx
git commit -m "feat: redesign header with nav links, account dropdown, and mobile hamburger"
```

---

## Task 2: Full suite verification

Confirm that the Header rewrite hasn't broken any other tests (App.favorites test mocks Header via AuthContext, so it should be unaffected, but verify).

- [ ] **Step 1: Run the full test suite**

```bash
npm run test -- --run
```

Expected: All tests pass. Tests that previously passed (`App.favorites`, `LoginPage`, `AuthCallback`, `ArtworkBlock`, `useFeedbackToast`, `dbMapping`, `serverAuth`, scraper tests) must still pass.

If `App.favorites.test.tsx` fails: it renders `<App />` which renders `<Header />`. The Header now calls `useLocation()` — ensure the test's `MemoryRouter` wrapper covers this. Looking at that test file's wrapper:

```tsx
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ChakraProvider>
  );
}
```

`MemoryRouter` provides `useLocation()`, so this should be fine.

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

Expected: No errors. If there are errors about `FaUserCircle` import or Chakra Menu types, verify:

- `FaUserCircle` is from `react-icons/fa` (already installed — used for `FaHeart` in `App.tsx`)
- `MenuButton`, `MenuList`, `MenuItem`, `Menu`, `IconButton`, `Icon` are all from `@chakra-ui/react`
- `HamburgerIcon` is from `@chakra-ui/icons`

---

## Task 3: Decision document

- [ ] **Step 1: Write the decision doc**

Create `docs/decisions/header-redesign.md`:

```markdown
# Session decisions — Header redesign (June 2026)

## What was built

`src/Header.tsx` was fully rewritten. Before: "Metal Reviews Dashboard" title on the left, flat email + Log out button on the right. After:

- **Title:** "Metal Reviews" (dropped "Dashboard"). Same gradient treatment.
- **Desktop nav (≥md):** Two links — Reviews (`/`) and Favorites (`/favorites`) — in a Flex cluster left of the account control. Always visible regardless of auth state (clicking Favorites while logged out hits the RequireAuth guard and redirects to `/login` — by design, not prevented at header level).
- **Desktop account control (≥md):** Logged in: `MenuButton` (email local-part + `FaUserCircle` icon) opens a `MenuList` with one `MenuItem`: "Log out". Logged out: plain "Log in" link (same as before).
- **Mobile hamburger (<md):** A single `IconButton` (`HamburgerIcon`, `aria-label="Open menu"`) opens a consolidated `MenuList` containing Reviews, Favorites, and Log out (or Log in). No visual separation between nav and account items in the mobile menu.
- **Active state:** `useLocation().pathname` compared to `/` and `/favorites`. Active link gets `color="accent.text"` (teal.300) + `textDecoration="underline"`. Inactive link gets `color="text.dim"` (gray.400).

## Key decisions

### useLocation() + conditional props vs. NavLink

React Router's `NavLink` supports an `isActive` render-prop/className function that automates active state. Chose `useLocation()` + conditional Chakra props instead because:

- The existing codebase pattern uses `Link as={RouterLink}` with explicit Chakra color/style props. Switching to `NavLink` would require CSS class injection or style functions that bypass Chakra's token system.
- Two nav links is simple enough that a manual `pathname === '/'` comparison is immediately readable.
- NavLink would require either a custom `className` function (bypassing theme tokens) or a `style` function (inline styles, harder to maintain). Neither fits the existing pattern.

### Two separate Menu components (desktop + mobile)

Desktop account dropdown holds only "Log out". Mobile hamburger holds nav + account in a single flat list. The brief explicitly calls for these to be separate — different content, different purposes. Rejected any attempt to share the desktop Menu as a reusable component for both: the content differs.

### Mobile menu items use onClick+navigate, not `as={RouterLink}`

`MenuItem as={RouterLink}` creates a collision between Chakra's `role="menuitem"` semantics and RouterLink's anchor rendering. Using `onClick={() => navigate(...)}` is unambiguous, renders a clean `<li role="menuitem">`, and Chakra's Menu handles close-on-click automatically regardless of how navigation happens.

Desktop nav links use `Link as={RouterLink}` (not MenuItem) — they are real anchor elements with `href` attributes, correct for keyboard navigation and right-click-to-open-in-new-tab.

### Favorites always visible in nav (no auth gating in header)

The brief is explicit: the Favorites link is always shown. Logged-out users who click it hit the RequireAuth guard (built in the favorites-route brief) and land on `/login`. This is correct behavior. No auth check belongs in the header for this link.

### Email local-part: `user.email?.split('@')[0]`, no truncation

Shown in full per the brief. No `maxW`, `noOfLines`, or `textOverflow` applied.

## Router import — resolved

CLAUDE.md says "react-router v7" without specifying the package. The actual import in `main.tsx` and `Header.tsx` is `react-router-dom`. All new code uses `react-router-dom`. This is the same conclusion reached in the favorites-view decision doc.

## What NOT to change

- The hamburger and desktop clusters are BOTH in the DOM simultaneously (CSS hides the appropriate one at each breakpoint). Tests run in jsdom where CSS media queries do not apply — both are testable. Do not add React state to conditionally render one vs. the other; that would cause a flash on resize and is unnecessary.
- The `handleLogout` function is identical to the previous version (`supabase.auth.signOut()` then `navigate('/')`). Do not change logout logic.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/header-redesign.md
git commit -m "docs: add header-redesign decision record"
```

---

## Definition of Done Checklist

- [ ] Title renders "Metal Reviews" (not "Metal Reviews Dashboard")
- [ ] Reviews (`/`) and Favorites (`/favorites`) nav links always present after hydration
- [ ] Active nav link visually distinct via `accent.text` color + underline; inactive via `text.dim`
- [ ] Logged-in desktop: email local-part + FaUserCircle icon as MenuButton; dropdown holds only "Log out"
- [ ] Logged-out desktop: plain "Log in" link (no dropdown)
- [ ] Mobile hamburger (`aria-label="Open menu"`) opens menu with Reviews, Favorites, and Log out (or Log in)
- [ ] No auth check on Favorites link in the header
- [ ] `npm run type-check` passes
- [ ] `npm run test -- --run` passes (all suites, not just Header)
- [ ] `docs/decisions/header-redesign.md` written
