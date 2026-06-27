// src/App.tsx
//
// The main dashboard component. Loads reviews from Supabase on mount and renders
// a dark-themed card grid with filtering, sorting, and searching.
// Routing lives in main.tsx (React Router v7). This file owns only the / route.
//
// Two things are defined here:
//   ArtworkBlock — a small self-contained component that renders one card's image
//   App          — the root component: state, data fetching, controls, and the card grid

// --- React core ---
// useEffect: runs code after the component renders (used here to load reviews.json on startup)
// useState: declares a reactive variable — when it changes, React re-renders the component
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// --- Chakra UI component library ---
// Chakra provides pre-built, themeable UI components so we don't write raw CSS.
// Each import is a building block: Box = a div, Flex = a flexbox div, etc.
import {
  Box,
  Badge,
  Button,
  Heading,
  Text,
  VStack,
  Container,
  Input,
  NativeSelect,
  SimpleGrid,
  Wrap,
  WrapItem,
  Flex,
  Spinner,
  Link,
  Image,
  Skeleton,
  Icon,
} from '@chakra-ui/react';

// Icons for the Refresh button's different states
import { LuCheck, LuRepeat, LuTriangleAlert } from 'react-icons/lu';

// Heart icons for favoriting
import { FaHeart, FaRegHeart } from 'react-icons/fa';

// Supabase client and data mapping for Phase 3 (frontend reading from Supabase)
import { supabase } from './supabaseClient';
import { fromDbRow } from './dbMapping';
import type { DbRow } from './dbMapping';
import { Header } from './Header';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { sourceBadge, scoreBadge, genreBadge, secondaryButton } from './theme';

// =============================================================================
// TYPE DEFINITION
// =============================================================================

/**
 * The shape of a single review as the frontend sees it.
 * This mirrors the MetalReview type in src/types.ts — they should stay in sync.
 * (A future refactor could import MetalReview directly instead of duplicating it.)
 *
 * Two date fields exist for different purposes:
 *   publishedAt   — ISO string used for sorting (easy to compare numerically)
 *   publishedDate — Human-readable string used for display (e.g. "14 Jun 2026")
 */
interface Review {
  id: string;
  source: string;
  band: string;
  album: string;
  genre: string[]; // Top-3 genres from MusicBrainz ([] when unknown)
  score: string; // Raw score as stored, e.g. "8.5/10"
  summary: string;
  url: string;
  publishedAt: string; // ISO date string, used for date sorting
  publishedDate: string; // Formatted display date, e.g. "14 Jun 2026"
  normalizedScore: number; // 0–100, used for score sorting
  artworkUrl: string | null;
  releaseDate: string | null;
  isDoublePositive?: boolean; // Legacy field — Double Positive feature was removed,
  // but the field is kept so old reviews.json files don't break
}

// =============================================================================
// HELPERS
// =============================================================================

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Formats a raw MusicBrainz date string for display. MB dates are partial:
//   "2024-03-15" → "15 Mar 2024"
//   "2024-03"    → "Mar 2024"
//   "2024"       → "2024"
//   null         → "—"
// Extracts the calendar year from any date string we store (partial MB dates,
// ISO timestamps, or null). Works on "2024", "2024-03", "2024-03-15", and
// "2006-01-01T00:00:00Z" alike — the first four chars are always the year.
export function getReleaseYear(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.substring(0, 4), 10);
  return isNaN(year) ? null : year;
}

export function formatReleaseDate(d: string | null): string {
  if (!d) return '—';
  const full = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) {
    const m = MONTH_ABBR[parseInt(full[2], 10) - 1] ?? full[2];
    return `${full[3]} ${m} ${full[1]}`;
  }
  const ym = d.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const m = MONTH_ABBR[parseInt(ym[2], 10) - 1] ?? ym[2];
    return `${m} ${ym[1]}`;
  }
  if (/^\d{4}$/.test(d)) return d;
  return d;
}

// =============================================================================
// ARTWORKBLOCK COMPONENT
// =============================================================================

// Extracted as a sibling function so each card gets its own isolated `loaded`
// state — tracking whether the image has finished loading — without needing
// to pass a Map or shared state down from the parent.


// CAA pre-generates fixed-size thumbnails at consistent paths: the full-res filename
// with `-{size}` inserted before the extension. 500px is sufficient for the card grid
// and meaningfully smaller than full-res (which can exceed 8 MB). The onError fallback
// in ArtworkBlock handles the rare case where a release doesn't follow this convention.
export function toThumbnailUrl(url: string, size: 250 | 500 = 500): string {
  return url.replace(/\.(jpg|jpeg|png)$/i, `-${size}.$1`);
}

export function ArtworkBlock({
  rev,
  isFavorited = false,
  onToggle = () => {},
}: {
  rev: Review;
  isFavorited?: boolean;
  onToggle?: () => void;
}) {
  // `loaded` flips to true once the browser has fully received the image data.
  const [loaded, setLoaded] = useState(false);
  // `failed` flips to true on any image load error (e.g. archive.org 500s on CAA redirects).
  // Treated identically to artworkUrl === null — shows the same placeholder.
  const [failed, setFailed] = useState(false);

  return (
    // paddingBottom="100%" on a position="relative" box is a CSS trick for a
    // square aspect ratio. The percentage is relative to the element's *width*,
    // so setting padding-bottom equal to 100% of the width makes height = width.
    // All children are position="absolute" so they fill this square exactly.
    <Box position="relative" paddingBottom="100%" bg="surface.darkest">
      {rev.artworkUrl && !failed ? (
        <>
          <Image
            src={toThumbnailUrl(rev.artworkUrl)}
            alt={`${rev.band} – ${rev.album}`}
            objectFit="cover" // Fills the box without distortion, cropping if needed
            w="100%"
            h="100%"
            position="absolute"
            top={0}
            left={0}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          {/* The skeleton shimmer sits on top of the image and fades out once loaded.
              We deliberately do NOT use Chakra's `isLoaded` prop — that would instantly
              remove the skeleton from the DOM, skipping the CSS fade transition.
              Instead we keep it in place but make it transparent via `opacity`.
              `pointerEvents="none"` prevents the invisible element from blocking clicks.
              `failed` also counts as "settled" so the shimmer doesn't animate forever
              on a broken load — the <Image> is removed from the DOM when failed=true,
              so this branch won't render, but the condition is kept explicit for clarity. */}
          {/* Fade out skeleton once image loads; pause animation to avoid infinite CPU use. */}
          <Skeleton
            position="absolute"
            top={0}
            left={0}
            w="100%"
            h="100%"
            opacity={loaded ? 0 : 1}
            transition="opacity 0.3s ease"
            pointerEvents="none"
            css={loaded ? { animation: 'none' } : undefined}
          />
        </>
      ) : (
        // No artwork URL, or image failed to load — show a placeholder with a music note icon
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
          <Text fontSize="3xl" color="text.muted">
            ♪
          </Text>
          <Text fontSize="xs" color="text.muted">
            No artwork found
          </Text>
        </Flex>
      )}

      {/* Heart toggle — top-right corner (the one open corner: source is bottom-left,
          score is bottom-right). e.stopPropagation() prevents the wrapping <Link>
          from navigating to the review URL when the heart is clicked. */}
      <Box
        as="button"
        type="button"
        aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        position="absolute"
        top={2}
        right={2}
        bg="blackAlpha.400"
        borderRadius="full"
        p={2}
        display="flex"
        alignItems="center"
        justifyContent="center"
        border="none"
        cursor="pointer"
        _hover={{ bg: 'blackAlpha.600' }}
        css={{
          '&:hover .heart-outline': { opacity: 0 },
          '&:hover .heart-filled': { opacity: 1 },
        }}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
      >
        {isFavorited ? (
          <Icon as={FaHeart} color="red.400" boxSize={5} />
        ) : (
          <Box position="relative" boxSize={5}>
            <Icon
              className="heart-outline"
              as={FaRegHeart}
              color="whiteAlpha.600"
              boxSize={5}
              position="absolute"
              top={0}
              left={0}
            />
            <Icon
              className="heart-filled"
              as={FaHeart}
              color="whiteAlpha.600"
              boxSize={5}
              position="absolute"
              top={0}
              left={0}
              opacity={0}
            />
          </Box>
        )}
      </Box>

      {/* Source badge — bottom-left corner */}
      <Badge
        {...sourceBadge}
        position="absolute"
        bottom={2}
        left={2}
        maxW="calc(100% - 70px)"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {rev.source}
      </Badge>

      {/* Score badge — bottom-right corner; only when a score exists */}
      {rev.score && rev.score !== '' && (
        <Badge
          {...scoreBadge}
          position="absolute"
          bottom={2}
          right={2}
          size="md"
          fontWeight={600}
        >
          {rev.score}
        </Badge>
      )}
    </Box>
  );
}

function App() {
  // =============================================================================
  // STATE
  // =============================================================================

  // The full list of reviews loaded from reviews.json. Filtering and sorting
  // operate on this array in-memory — no re-fetching on every search/sort change.
  const [reviews, setReviews] = useState<Review[]>([]);

  // Current value of the search input. Every keystroke re-renders and re-filters.
  const [search, setSearch] = useState('');

  // Which field to sort by: 'date' (newest first) or 'score' (highest first).
  const [sortKey, setSortKey] = useState<'date' | 'score'>('date');

  // Which source to show — 'All' passes everything through.
  const [filterSource, setFilterSource] = useState('All');

  // Minimum score filter — '' means no filter; '8' means normalizedScore >= 80.
  const [minScore, setMinScore] = useState('');

  // True while the initial reviews.json load is in flight.
  // Controls whether we show the full-page spinner or the card grid.
  const [loading, setLoading] = useState(true);

  // Tracks the Refresh button through its lifecycle:
  //   'idle'    → default, shows the refresh icon
  //   'loading' → ingest running, shows spinner, button disabled
  //   'success' → new data arrived, shows checkmark for 3s then resets
  //   'error'   → something went wrong, shows warning icon for 3s then resets
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  );

  // Auth state — user is null when logged out.
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError, showAction } = useFeedbackToast();

  // Set of review IDs the current user has favorited. Hydrated on login,
  // cleared on logout. Stored as a Set for O(1) membership checks.
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  // =============================================================================
  // REFRESH: trigger a new ingest run and poll for results
  // =============================================================================

  async function handleRefresh() {
    setRefreshState('loading');
    try {
      // POST to /api/ingest via the Vite proxy → Express server on port 3001.
      // VITE_INGEST_SECRET_TOKEN is the browser-exposed copy of the server's INGEST_SECRET_TOKEN.
      // If the var is missing the fallback '' is sent, which isAuthorized correctly rejects.
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'X-Ingest-Token': import.meta.env.VITE_INGEST_SECRET_TOKEN ?? '' },
      });

      if (res.status === 409) {
        // 409 Conflict: server returns this when an ingest is already running.
        // Show a warning and return to idle without starting the poll loop.
        showError('Ingest already running, please wait');
        setRefreshState('idle');
        return;
      }
      // 202 Accepted: the server started the ingest in the background.
      // The response arrives immediately; scraping continues server-side.
      if (res.status !== 202) throw new Error('Unexpected response');

      // Poll /api/ingest/status every 2s. The server flips ingesting → false
      // in its .finally(), so 'idle' is the definitive completion signal —
      // regardless of whether any new reviews were actually added.
      const MAX_POLL_MS = 5 * 60 * 1000; // 5-minute safety ceiling
      const startedAt = Date.now();

      const pollId = setInterval(async () => {
        try {
          // Safety timeout — if still running after 5 minutes, something went wrong server-side.
          if (Date.now() - startedAt >= MAX_POLL_MS) {
            clearInterval(pollId);
            setRefreshState('error');
            setTimeout(() => setRefreshState('idle'), 3000);
            return;
          }

          const { status } = await fetch('/api/ingest/status').then((r) => r.json());
          if (status === 'idle') {
            clearInterval(pollId);
            const { data, error } = await supabase
              .from('reviews')
              .select('*')
              .order('published_at', { ascending: false });
            if (!error && data) {
              setReviews((data as DbRow[]).map(fromDbRow));
              setRefreshState('success');
            } else {
              // Ingest succeeded but the reload failed — show error so the user knows to refresh.
              console.warn('Ingest complete but failed to reload reviews from Supabase', error);
              setRefreshState('error');
            }
            setTimeout(() => setRefreshState('idle'), 3000);
          }
        } catch {
          // Status fetch failed mid-poll — stop and show error.
          clearInterval(pollId);
          setRefreshState('error');
          setTimeout(() => setRefreshState('idle'), 3000);
        }
      }, 2000);
    } catch {
      // Initial POST to /api/ingest failed (network error, server down, etc.)
      setRefreshState('error');
      setTimeout(() => setRefreshState('idle'), 3000);
    }
  }

  // =============================================================================
  // INITIAL DATA LOAD
  // =============================================================================

  // useEffect with [] runs exactly once, after the component first appears on screen.
  // Phase 3: Query Supabase reviews table instead of reading reviews.json.
  // The Supabase client uses VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
  // from .env (frontend-safe, uses RLS if configured on the table).
  useEffect(() => {
    supabase
      .from('reviews')
      .select('*')
      .order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load reviews from Supabase', error);
        } else {
          setReviews((data as DbRow[]).map(fromDbRow));
        }
        setLoading(false);
      })
      .catch((e) => {
        console.warn('Failed to load reviews', e);
        setLoading(false);
      });
  }, []); // [] = run once on mount, never re-run

  // =============================================================================
  // FAVORITES HYDRATION
  // =============================================================================

  // Fetch the current user's favorited review IDs on login; clear on logout.
  // RLS restricts the query to the signed-in user's own rows automatically.
  useEffect(() => {
    if (!user) {
      // Intentionally resetting derived state on logout. The setState calls are
      // synchronous here because we need to clear UI state before any re-render
      // shows stale favorites. The rule fires on sync setState in effects, but
      // this is the correct pattern for clearing external-auth-derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavoritedIds(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from('favorites')
      .select('review_id')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Failed to load favorites from Supabase', error);
          return;
        }
        if (data) {
          setFavoritedIds(new Set(data.map((row) => row.review_id)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // =============================================================================
  // TOGGLE FAVORITE
  // =============================================================================

  // Persist to Supabase first; update local Set only on confirmed success.
  // On error the Set is NOT rolled back — the error toast tells the user to retry,
  // and the next hydration (on re-login) will restore the correct state.
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
      if (error) {
        showError('Could not remove favorite — try again');
        return;
      }
      setFavoritedIds((prev) => {
        const next = new Set(prev);
        next.delete(reviewId);
        return next;
      });
      showSuccess('Removed from favorites');
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: user.id, review_id: reviewId });
      if (error) {
        showError('Could not save favorite — try again');
        return;
      }
      setFavoritedIds((prev) => new Set(prev).add(reviewId));
      showSuccess('Added to favorites');
    }
  }

  // =============================================================================
  // FILTERING, SEARCHING, AND SORTING
  // =============================================================================

  // Derive source names from live data so the dropdown always matches reviews.json —
  // no hardcoding needed when a new scraper source is added.
  const sources = Array.from(new Set(reviews.map((r) => r.source)));

  // `filtered` recomputes on every render automatically — React re-renders whenever
  // state changes, so this updates the moment the user types or changes a dropdown.
  // Pipeline order: source → score → search → sort
  const filtered = reviews
    .filter((r) => (filterSource === 'All' ? true : r.source === filterSource))
    .filter((r) => (minScore === '' ? true : r.normalizedScore >= parseFloat(minScore) * 10))
    .filter((r) => {
      const term = search.toLowerCase();
      return (
        r.band.toLowerCase().includes(term) ||
        r.album.toLowerCase().includes(term) ||
        (r.genre ?? []).some((g) => g.toLowerCase().includes(term)) // genre is populated via MusicBrainz lookup
      );
    })
    .sort((a, b) => {
      if (sortKey === 'date') {
        // Convert ISO strings to millisecond timestamps for numeric comparison.
        // Subtracting b from a puts the largest (newest) value first.
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      return b.normalizedScore - a.normalizedScore; // 0–100, consistent across all sources
    });

  // =============================================================================
  // SHARED STYLE CONSTANTS
  // =============================================================================

  // Spread onto the Input and both Selects for visual consistency.
  // The Refresh button does NOT use this — Chakra v2's `variant="outline"` conflicts
  // with an explicit `bg` prop, causing the border to not contain its background.
  // The button is styled explicitly with `border="1px solid"` instead.
  // v3: NativeSelect splits root-level props (size/variant/layout) from field-level
  // visual styles (bg/color/border), so we maintain two objects. Input accepts all combined.
  const controlRootStyle = { size: 'md', variant: 'outline' } as const;
  const controlFieldStyle = {
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
    // Dark background on <option> elements (browser default is white, breaking dark theme).
    // gray.800 matches surface.card; CSS var isn't available on <option> in all browsers.
    css: { '& option': { background: 'gray.800' } },
  } as const;
  const controlStyle = { ...controlRootStyle, ...controlFieldStyle } as const;

  const cardStyle = {
    bg: 'surface.card',
    borderRadius: 'md',
    overflow: 'hidden',
    boxShadow: 'md',
    border: '1px solid',
    borderColor: 'border.default',
    transition: 'transform 0.2s',
    _hover: { transform: 'scale(1.02)' },
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />

          {/* Controls bar: wraps at tablet (md) and stacks at mobile (base).
              gap={2} replaces per-control ml={2}; no Spacer needed with wrap. */}
          <Flex flexWrap="wrap" gap={2}>
            <Input
              {...controlStyle}
              flex={{ base: '1 1 100%', lg: '2' }}
              minW={{ lg: '180px' }}
              placeholder="Search by band, album, genre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              _placeholder={{ color: 'text.dim' }}
            />
            <NativeSelect.Root
              {...controlRootStyle}
              flex={{ base: '1 1 100%', md: '1', lg: '1' }}
              minW={{ base: '100px', lg: '110px' }}
            >
              <NativeSelect.Field
                {...controlFieldStyle}
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'date' | 'score')}
              >
                <option value="date">Newest</option>
                <option value="score">Highest Score</option>
              </NativeSelect.Field>
            </NativeSelect.Root>
            {/* Source options are derived from live data — no hardcoding needed */}
            <NativeSelect.Root
              {...controlRootStyle}
              flex={{ base: '1 1 100%', md: '1', lg: '1' }}
              minW={{ base: '100px', lg: '120px' }}
            >
              <NativeSelect.Field
                {...controlFieldStyle}
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
              >
                <option value="All">All Sources</option>
                {sources.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
            <NativeSelect.Root
              {...controlRootStyle}
              flex={{ base: '1 1 100%', md: '1', lg: '1' }}
              minW={{ base: '100px', lg: '110px' }}
            >
              <NativeSelect.Field
                {...controlFieldStyle}
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
              >
                <option value="">All Scores</option>
                <option value="9">9+ / 10</option>
                <option value="8">8+ / 10</option>
                <option value="7">7+ / 10</option>
              </NativeSelect.Field>
            </NativeSelect.Root>
            {/* Button does NOT spread controlStyle — see comment above. */}
            <Button
              {...secondaryButton}
              variant="outline"
              px={4}
              flexShrink={0}
              w={{ base: '100%', md: 'auto' }}
              size="md"
              _hover={{ borderColor: 'border.hover', color: 'text.primary', bg: 'whiteAlpha.200' }}
              _active={{ bg: 'surface.raised' }}
              onClick={handleRefresh}
              disabled={refreshState === 'loading'}
            >
              {refreshState === 'loading' ? (
                <><Spinner size="xs" /> Refreshing…</>
              ) : refreshState === 'success' ? (
                <><LuCheck /> Done</>
              ) : refreshState === 'error' ? (
                <><LuTriangleAlert /> Failed</>
              ) : (
                <><LuRepeat /> Refresh</>
              )}
            </Button>
          </Flex>

          {/* Counter row: review count left-aligned + favorites-only switch right-aligned (logged-in only).
              justify="space-between" pins the count to the left and the switch to the right. */}
          {!loading && (
            <Flex align="center" justify="space-between">
              <Text fontSize="md" fontWeight="bold" color="text.dim" paddingLeft={1}>
                {filtered.length < reviews.length
                  ? `${filtered.length} of ${reviews.length} reviews`
                  : `${reviews.length} reviews`}
              </Text>
            </Flex>
          )}

          {/* Full-page spinner while reviews.json is loading; card grid once ready */}
          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner size="xl" color="accent.start" thickness="4px" speed="0.65s" />
            </Flex>
          ) : (
            // 1 column on mobile, 2 on tablet, 3 on desktop
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
              {filtered.map((rev) => (
                // Wrap the entire card in a Link so clicking anywhere opens the review.
                // _hover textDecoration="none" stops Chakra underlining the card on hover.
                <Link
                  href={rev.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={rev.id}
                  color="inherit"
                  _hover={{ textDecoration: 'none' }}
                  display="block"
                >
                  <Box {...cardStyle} h="100%">
                    <ArtworkBlock
                      rev={rev}
                      isFavorited={favoritedIds.has(rev.id)}
                      onToggle={() => toggleFavorite(rev.id)}
                    />
                    <Box p={4}>
                      <Heading size={{ base: "xl", md: "2xl"}}  mb={2}>
                        {rev.band || 'Unknown Band'} – {rev.album || 'Untitled Album'}
                      </Heading>
                      <Text fontSize="sm" color="text.dim" mb={1}>
                        Release date: {formatReleaseDate(rev.releaseDate)}
                      </Text>
                      {/* Genre tags — only rendered when genre data is available */}
                      {(rev.genre ?? []).length > 0 && (
                        <Wrap gap={1} mb={2}>
                          {(rev.genre ?? []).map((g) => (
                            <WrapItem key={g}>
                              <Badge {...genreBadge}>
                                {g}
                              </Badge>
                            </WrapItem>
                          ))}
                        </Wrap>
                      )}
                      {/* lineClamp={3} truncates long summaries with an ellipsis (v3 prop) */}
                      <Text fontSize="m" color="text.dim" lineClamp={3} mb={2}>
                        {rev.summary || 'No summary available.'}
                      </Text>
                      <Text fontSize="xs" color="text.muted" title='Review date'>
                        {rev.publishedDate}
                      </Text>
                    </Box>
                  </Box>
                </Link>
              ))}
            </SimpleGrid>
          )}

          {/* Empty state — only shown after loading with zero matching results */}
          {!loading && filtered.length === 0 && (
            <Text textAlign="center" color="text.muted">
              No reviews match your criteria.
            </Text>
          )}
        </VStack>
      </Container>
    </Box>
  );
}

export default App;
