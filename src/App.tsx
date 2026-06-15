// src/App.tsx
//
// The entire frontend lives in this one file. It's a single-page React app —
// no routing, no server-side rendering. On load it fetches reviews.json once,
// stores the full list in memory, and handles all filtering, sorting, and
// searching on the client side without any further network requests.
//
// Two things are defined here:
//   ArtworkBlock — a small self-contained component that renders one card's image
//   App          — the root component: state, data fetching, controls, and the card grid

// --- React core ---
// useEffect: runs code after the component renders (used here to load reviews.json on startup)
// useState: declares a reactive variable — when it changes, React re-renders the component
import React, { useEffect, useState } from 'react';

// --- Chakra UI component library ---
// Chakra provides pre-built, themeable UI components so we don't write raw CSS.
// Each import is a building block: Box = a div, Flex = a flexbox div, etc.
import {
  Box, // General-purpose container (renders as a <div>)
  Button,
  Heading,
  Text,
  VStack, // Vertical stack — children laid out top-to-bottom with equal spacing
  Container, // Centres content and caps its max width
  Input,
  Select,
  SimpleGrid, // Responsive grid that adjusts column count at different screen sizes
  Tag, // Small label for genre tags in card body
  Wrap, // Wrapper for flexible layout of tags
  WrapItem, // Item inside Wrap for each individual tag
  Flex, // Flexbox container — used for the controls bar and card header
  Spacer, // Pushes flex siblings apart (fills remaining space between them)
  Spinner, // Animated loading indicator
  Link, // Anchor tag with Chakra styling — wraps each card so the whole card is clickable
  Image,
  Skeleton, // Shimmer placeholder shown while an image loads
  useToast, // Hook that triggers a temporary notification pop-up
} from '@chakra-ui/react';

// Icons for the Refresh button's different states
import { CheckIcon, RepeatIcon, WarningIcon } from '@chakra-ui/icons';

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
  isDoublePositive?: boolean; // Legacy field — Double Positive feature was removed,
  // but the field is kept so old reviews.json files don't break
}

// =============================================================================
// ARTWORKBLOCK COMPONENT
// =============================================================================

// Extracted as a sibling function so each card gets its own isolated `loaded`
// state — tracking whether the image has finished loading — without needing
// to pass a Map or shared state down from the parent.
function ArtworkBlock({ rev }: { rev: Review }) {
  // `loaded` flips to true once the browser has fully received the image data.
  const [loaded, setLoaded] = useState(false);

  return (
    // paddingBottom="100%" on a position="relative" box is a CSS trick for a
    // square aspect ratio. The percentage is relative to the element's *width*,
    // so setting padding-bottom equal to 100% of the width makes height = width.
    // All children are position="absolute" so they fill this square exactly.
    <Box position="relative" paddingBottom="100%" bg="surface.darkest">
      {rev.artworkUrl ? (
        <>
          <Image
            src={rev.artworkUrl}
            alt={`${rev.band} – ${rev.album}`}
            objectFit="cover" // Fills the box without distortion, cropping if needed
            w="100%"
            h="100%"
            position="absolute"
            top={0}
            left={0}
            onLoad={() => setLoaded(true)}
          />
          {/* The skeleton shimmer sits on top of the image and fades out once loaded.
              We deliberately do NOT use Chakra's `isLoaded` prop — that would instantly
              remove the skeleton from the DOM, skipping the CSS fade transition.
              Instead we keep it in place but make it transparent via `opacity`.
              `pointerEvents="none"` prevents the invisible element from blocking clicks. */}
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
        // No artwork URL — show a placeholder with a music note icon
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

      {/* Source badge — top-left corner of the artwork square.
          Uses accent.border (teal.500) bg and accent.text (teal.300) text from theme.
          maxW prevents overflow on narrow cards. */}
      <Box
        position="absolute"
        top={2}
        left={2}
        bg="accent.border"
        color="accent.text"
        fontSize="xs"
        fontWeight="semibold"
        px={2}
        py="2px"
        borderRadius="badge"
        maxW="calc(100% - 16px)"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {rev.source}
      </Box>

      {/* Score badge — bottom-right corner of the artwork square.
          Only rendered when the review actually has a score (not all do). */}
      {rev.score && rev.score !== '' && (
        <Box
          position="absolute"
          bottom="2"
          right="2"
          bg="brand.score"
          color="brand.scoreText"
          borderRadius="badge"
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

  // Calling toast({...}) shows a temporary notification pop-up in the corner.
  const toast = useToast();

  // =============================================================================
  // REFRESH: trigger a new ingest run and poll for results
  // =============================================================================

  async function handleRefresh() {
    setRefreshState('loading');
    try {
      // POST to /api/ingest via the Vite proxy → Express server on port 3001.
      const res = await fetch('/api/ingest', { method: 'POST' });

      if (res.status === 409) {
        // 409 Conflict: server returns this when an ingest is already running.
        // Show a warning and return to idle without starting the poll loop.
        toast({
          title: 'Ingest already running, please wait',
          status: 'warning',
          duration: 4000,
          isClosable: true,
        });
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
            // Ingest is done — fetch the latest reviews.json once and reload the card grid.
            clearInterval(pollId);
            const data: Review[] = await fetch('/reviews.json').then((r) => r.json());
            setReviews(data);
            setRefreshState('success');
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
  // We fetch reviews.json from public/ — Vite serves it as a static file in dev;
  // a CDN or static host would serve it in production. No API call needed.
  useEffect(() => {
    fetch('/reviews.json')
      .then((r) => r.json())
      .then((data) => {
        setReviews(data);
        setLoading(false);
      })
      .catch((e) => {
        console.warn('Failed to load reviews', e);
        setLoading(false); // Stop the spinner even on failure
      });
  }, []); // [] = run once on mount, never re-run

  // =============================================================================
  // FILTERING, SEARCHING, AND SORTING
  // =============================================================================

  // Derive source names from live data so the dropdown always matches reviews.json —
  // no hardcoding needed when a new scraper source is added.
  const sources = Array.from(new Set(reviews.map((r) => r.source)));

  // `filtered` recomputes on every render automatically — React re-renders whenever
  // state changes, so this updates the moment the user types or changes a dropdown.
  const filtered = reviews
    .filter((r) => {
      const term = search.toLowerCase();
      return (
        r.band.toLowerCase().includes(term) ||
        r.album.toLowerCase().includes(term) ||
        (r.genre ?? []).some((g) => g.toLowerCase().includes(term)) // genre is always [] for now
      );
    })
    .filter((r) => (filterSource === 'All' ? true : r.source === filterSource))
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
  const controlStyle = {
    size: 'md',
    variant: 'outline',
    bg: 'surface.card',
    color: 'text.primary',
    borderColor: 'border.default',
  } as const; // `as const` prevents TypeScript from widening these to plain `string`

  const cardStyle = {
    bg: 'surface.card',
    borderRadius: 'card',
    overflow: 'hidden', // Required — clips the artwork image to the card's rounded corners
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
        <VStack spacing={6} align="stretch">
          {/* Page title — gradient is clipped to the text shape via bgClip="text" */}
          <Heading
            as="h1"
            size="xl"
            textAlign="center"
            bgGradient="linear(to-r, accent.start, accent.end)"
            bgClip="text"
          >
            Metal Reviews Dashboard
          </Heading>

          {/* Controls bar: search input, sort, source filter, refresh button.
              Spacer pushes the right-side controls away from the search input. */}
          <Flex>
            <Input
              {...controlStyle}
              placeholder="Search by band, album..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              _placeholder={{ color: 'text.dim' }}
            />
            <Spacer />
            {/* sx overrides the native white dropdown background on Windows —
                Chakra has no prop for this, so we drop to raw CSS via sx. */}
            <Select
              {...controlStyle}
              w="150px"
              ml={2}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as 'date' | 'score')}
              sx={{ '& option': { background: '#1a202c' } }}
            >
              <option value="date">Newest</option>
              <option value="score">Highest Score</option>
            </Select>
            {/* Source options are derived from live data — no hardcoding needed */}
            <Select
              {...controlStyle}
              w="150px"
              ml={2}
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              sx={{ '& option': { background: '#1a202c' } }}
            >
              <option value="All">All Sources</option>
              {sources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </Select>
            {/* Button does NOT spread controlStyle — see comment above.
                flexShrink={0} prevents the flex row from compressing it. */}
            <Button
              ml={2}
              px={4}
              flexShrink={0}
              bg="surface.card"
              color="gray.300"
              border="1px solid"
              borderColor="border.default"
              borderRadius="button"
              size="md"
              _hover={{ borderColor: 'border.hover', color: 'text.primary', bg: 'surface.card' }}
              _active={{ bg: 'surface.raised' }}
              onClick={handleRefresh}
              isDisabled={refreshState === 'loading'}
              leftIcon={
                refreshState === 'loading' ? (
                  <Spinner size="xs" />
                ) : refreshState === 'success' ? (
                  <CheckIcon />
                ) : refreshState === 'error' ? (
                  <WarningIcon />
                ) : (
                  <RepeatIcon />
                )
              }
            >
              {refreshState === 'loading'
                ? 'Refreshing…'
                : refreshState === 'success'
                  ? 'Done'
                  : refreshState === 'error'
                    ? 'Failed'
                    : 'Refresh'}
            </Button>
          </Flex>

          {/* Full-page spinner while reviews.json is loading; card grid once ready */}
          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner size="xl" color="accent.start" thickness="4px" speed="0.65s" />
            </Flex>
          ) : (
            // 1 column on mobile, 2 on tablet, 3 on desktop
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
              {filtered.map((rev) => (
                // Wrap the entire card in a Link so clicking anywhere opens the review.
                // isExternal adds target="_blank" + rel="noopener".
                // _hover textDecoration="none" stops Chakra underlining the card on hover.
                <Link
                  href={rev.url}
                  isExternal
                  key={rev.id}
                  _hover={{ textDecoration: 'none' }}
                  display="block"
                >
                  <Box {...cardStyle} h="100%">
                    <ArtworkBlock rev={rev} />
                    <Box p={4}>
                      <Heading size="md" mb={2}>
                        {rev.band || 'Unknown Band'} – {rev.album || 'Untitled Album'}
                      </Heading>
                      {/* Genre tags — only rendered when genre data is available */}
                      {rev.genre.length > 0 && (
                        <Wrap spacing={1} mb={1}>
                          {rev.genre.map((g) => (
                            <WrapItem key={g}>
                              <Tag
                                size="sm"
                                bg="whiteAlpha.100"
                                color="purple.300"
                                borderRadius="badge"
                              >
                                {g}
                              </Tag>
                            </WrapItem>
                          ))}
                        </Wrap>
                      )}
                      <Text fontSize="sm" color="text.dim" mb={2}>
                        {rev.publishedDate}
                      </Text>
                      {/* noOfLines={3} truncates long summaries with an ellipsis */}
                      <Text fontSize="sm" color="text.dim" noOfLines={3}>
                        {rev.summary || 'No summary available.'}
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
