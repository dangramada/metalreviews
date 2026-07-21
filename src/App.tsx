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
  List,
} from '@chakra-ui/react';

// Heart icons for favoriting
import { FaHeart, FaRegHeart } from 'react-icons/fa';

// Supabase client and data mapping. Post-album-identity-migration, the home page reads
// `albums` joined to `reviews` (see docs/decisions/album-identity-frontend-homepage.md).
import { supabase } from './supabaseClient';
import { fromAlbumWithReviews } from './dbMapping';
import type { AlbumWithReviewsRow, AlbumCard } from './dbMapping';
import { Header } from './Header';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { sourceBadge, scoreBadge, genreBadge } from './theme';

// PostgREST embed string: fetches every `albums` row with its attached `reviews` nested as
// an array (via the reviews.album_id FK). `reviews!inner` forces an inner join, so only
// albums with at least one review come back — this is what keeps zero-review manually-added
// albums (e.g. from AddAlbumDrawer) off the public home page; `created_by` is irrelevant to
// this filter, it's purely "has reviews" (see
// docs/decisions/album-identity-visibility-and-duplicate-fix.md). /favorites still shows
// manual adds regardless of review count via its own separate query (useFavoritesList.ts) —
// not touched here. Shared by the initial load and the post-refresh reload so both stay in sync.
const ALBUMS_WITH_REVIEWS_SELECT =
  'id, band, album, artwork_url, release_date, genre, created_at, ' +
  'reviews!inner(id, source, score, normalized_score, summary, url, published_at, published_date)';

// =============================================================================
// TYPE DEFINITION
// =============================================================================

// The shape of a single card as the frontend sees it — one row per album, sourced from
// dbMapping's AlbumCard (see docs/decisions/album-identity-frontend-homepage.md). Re-exported
// locally as `Review` to minimize the diff across this file's many `rev: Review` usages; it no
// longer mirrors MetalReview (which still describes a single scraper-side review row).
type Review = AlbumCard;

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

// Formats the album's averageScore (0–100 scale) for the score badge as an "x.x" figure
// on the site's usual /10 scale — e.g. 87 -> "8.7".
export function formatAverageScore(score: number): string {
  return (score / 10).toFixed(1);
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
          score is bottom-right). Exactly-one-review cards are wrapped in an outer <Link>
          (see the card-level link below) — e.stopPropagation()/preventDefault() stop that
          Link from navigating when the heart is clicked. Zero- and multi-review cards have
          no such wrapper, so these calls are no-ops there, which is harmless. */}
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

      {/* Badges branch on review count (see docs/decisions/album-identity-frontend-homepage.md's
          bugfix note): zero reviews shows nothing; exactly one review shows the original
          single source+score badge pairing; two or more shows the wrapping multi-source
          badges + computed average. */}
      {rev.reviews.length === 1 && (
        <>
          {/* Source badge — bottom-left corner, single review's source. */}
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
            {rev.reviews[0].source}
          </Badge>
          {/* Score badge — bottom-right corner; only when a score exists */}
          {rev.reviews[0].score && rev.reviews[0].score !== '' && (
            <Badge
              {...scoreBadge}
              position="absolute"
              bottom={2}
              right={2}
              size="md"
              fontWeight={600}
            >
              {rev.reviews[0].score}
            </Badge>
          )}
        </>
      )}

      {rev.reviews.length > 1 && (
        <>
          {/* Source badges — bottom-left corner, one per attached review. Wrap/WrapItem
              (same pattern the genre-tag row below the artwork already uses) lets multiple
              badges stack onto additional lines on narrow cards instead of overflowing or
              clipping. */}
          <Wrap position="absolute" bottom={2} left={2} maxW="calc(100% - 70px)" gap={1}>
            {rev.reviews.map((r) => (
              <WrapItem key={r.source}>
                <Badge {...sourceBadge} whiteSpace="nowrap">
                  {r.source}
                </Badge>
              </WrapItem>
            ))}
          </Wrap>

          {/* Score badge — bottom-right corner; shows the average across all attached
              reviews' scores. Only when at least one review has a score to average. */}
          {rev.averageScore !== null && (
            <Badge
              {...scoreBadge}
              position="absolute"
              bottom={2}
              right={2}
              size="md"
              fontWeight={600}
            >
              {formatAverageScore(rev.averageScore)}
            </Badge>
          )}
        </>
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

  // Minimum score filter — '' means no filter; '8' means averageScore >= 80.
  const [minScore, setMinScore] = useState('');

  // True while the initial reviews.json load is in flight.
  // Controls whether we show the full-page spinner or the card grid.
  const [loading, setLoading] = useState(true);

  // Auth state — user is null when logged out.
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError, showAction } = useFeedbackToast();

  // Set of review IDs the current user has favorited. Hydrated on login,
  // cleared on logout. Stored as a Set for O(1) membership checks.
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  // =============================================================================
  // INITIAL DATA LOAD
  // =============================================================================

  // useEffect with [] runs exactly once, after the component first appears on screen.
  // Post-album-identity-migration: query `albums` joined to its `reviews` (embedded array via
  // Supabase/PostgREST FK detection) instead of the old flat `reviews` table — an album shows
  // up here even with zero attached reviews (e.g. manually added, not yet scraped).
  // The Supabase client uses VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
  // from .env (frontend-safe, uses RLS if configured on the table).
  useEffect(() => {
    supabase
      .from('albums')
      .select(ALBUMS_WITH_REVIEWS_SELECT)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load albums from Supabase', error);
        } else {
          setReviews((data as unknown as AlbumWithReviewsRow[]).map(fromAlbumWithReviews));
        }
        setLoading(false);
      })
      .catch((e) => {
        console.warn('Failed to load albums', e);
        setLoading(false);
      });
  }, []); // [] = run once on mount, never re-run

  // =============================================================================
  // FAVORITES HYDRATION
  // =============================================================================

  // Fetch the current user's favorited album IDs on login; clear on logout.
  // `favorites` is keyed by album_id post-migration (review_id column dropped — see
  // docs/decisions/album-identity-migration.md). RLS restricts the query to the
  // signed-in user's own rows automatically.
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
      .select('album_id')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Failed to load favorites from Supabase', error);
          return;
        }
        if (data) {
          setFavoritedIds(new Set(data.map((row) => row.album_id)));
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
  async function toggleFavorite(albumId: string) {
    if (!user) {
      showAction('Log in to save favorites', {
        label: 'Log in',
        onClick: () => navigate('/login'),
      });
      return;
    }
    const isFavorited = favoritedIds.has(albumId);
    if (isFavorited) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('album_id', albumId);
      if (error) {
        showError('Could not remove favorite — try again');
        return;
      }
      setFavoritedIds((prev) => {
        const next = new Set(prev);
        next.delete(albumId);
        return next;
      });
      showSuccess('Removed from favorites');
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: user.id, album_id: albumId });
      if (error) {
        showError('Could not save favorite — try again');
        return;
      }
      setFavoritedIds((prev) => new Set(prev).add(albumId));
      showSuccess('Added to favorites');
    }
  }

  // =============================================================================
  // FILTERING, SEARCHING, AND SORTING
  // =============================================================================

  // Derive source names from live data so the dropdown always matches what's loaded —
  // no hardcoding needed when a new scraper source is added. An album can now have up to
  // three attached reviews, so this flattens across all of them (previously one per album).
  const sources = Array.from(new Set(reviews.flatMap((r) => r.reviews.map((rv) => rv.source))));

  // `filtered` recomputes on every render automatically — React re-renders whenever
  // state changes, so this updates the moment the user types or changes a dropdown.
  // Pipeline order: source → score → search → sort
  const filtered = reviews
    .filter((r) =>
      filterSource === 'All' ? true : r.reviews.some((rv) => rv.source === filterSource)
    )
    .filter((r) => (minScore === '' ? true : (r.averageScore ?? 0) >= parseFloat(minScore) * 10))
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
      return (b.averageScore ?? 0) - (a.averageScore ?? 0); // 0–100, consistent across all sources
    });

  // =============================================================================
  // SHARED STYLE CONSTANTS
  // =============================================================================

  // Spread onto the Input and both Selects for visual consistency.
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
              {filtered.map((rev) => {
                // Card rendering branches on review count (see docs/decisions/
                // album-identity-frontend-homepage.md's bugfix note):
                //   0 reviews  -> album-info-only, no card-level link (manually added, not
                //                 yet scraped; ArtworkBlock shows no badges either).
                //   1 review   -> original single-review layout: summary excerpt, one
                //                 review-date line, and the whole card links out to that
                //                 review's url.
                //   2+ reviews -> multi-source layout: per-source <li> lines instead of a
                //                 summary, no card-level link (each line links out on its own).
                const singleReview = rev.reviews.length === 1 ? rev.reviews[0] : null;

                const cardBody = (
                  <Box {...cardStyle} h="100%">
                    <ArtworkBlock
                      rev={rev}
                      isFavorited={favoritedIds.has(rev.albumId)}
                      onToggle={() => toggleFavorite(rev.albumId)}
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
                      {singleReview && (
                        <>
                          {/* lineClamp={3} truncates long summaries with an ellipsis (v3 prop) */}
                          <Text fontSize="m" color="text.dim" lineClamp={3} mb={2}>
                            {singleReview.summary || 'No summary available.'}
                          </Text>
                          {singleReview.publishedDate && (
                            <Text fontSize="xs" color="text.muted" title="Review date">
                              {singleReview.publishedDate}
                            </Text>
                          )}
                        </>
                      )}
                      {rev.reviews.length > 1 && (
                        <List.Root as="ul" listStyleType="none" ml={0} mb={2}>
                          {rev.reviews.map((r) => (
                            <List.Item key={r.source} fontSize="sm" color="text.dim">
                              {r.source}: {r.score}
                              {r.publishedDate ? ` — ${r.publishedDate}` : ''}{' '}
                              {r.url && (
                                <Link
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  color="accent.start"
                                >
                                  [see review]
                                </Link>
                              )}
                            </List.Item>
                          ))}
                        </List.Root>
                      )}
                    </Box>
                  </Box>
                );

                return singleReview?.url ? (
                  // Exactly one review — the whole card links out to it, same as the
                  // pre-multi-source-display behavior. _hover textDecoration="none" stops
                  // Chakra underlining the card on hover.
                  <Link
                    href={singleReview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={rev.albumId}
                    color="inherit"
                    _hover={{ textDecoration: 'none' }}
                    display="block"
                  >
                    {cardBody}
                  </Link>
                ) : (
                  <Box key={rev.albumId} display="block">
                    {cardBody}
                  </Box>
                );
              })}
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
