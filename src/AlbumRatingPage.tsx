import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Box, Container, Flex, Text, VStack } from '@chakra-ui/react';
import { PageBreadcrumb } from './components/ui/breadcrumb';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingIndicator } from './LoadingIndicator';
import { useAuth } from './AuthContext';
import { useCriteriaCatalog } from './hooks/useCriteriaCatalog';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import { supabase } from './supabaseClient';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { FIXED_CRITERION_ORDER } from './lib/album-rating/criterionOrder';
import { DesktopRatingLayout } from './components/album-rating/DesktopRatingLayout';
import { MobileRatingLayout } from './components/album-rating/MobileRatingLayout';
import type { CriterionLevelWeight } from './components/album-rating/RatingRadarChart';

type RatingRow = { criterion_id: number; level: number };
type WeightRow = { criterion_id: number; level: number; value: number };
type AlbumRow = {
  id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  release_date: string | null;
  genre: string[] | null;
};

// Reached from FavoritesPage's rate control today (?from=favorites); the future Ranked
// Albums/AOTY hub will link here too (?from=aoty). That route doesn't exist yet, so the
// `aoty` case falls back to /favorites for now — flagged here rather than guessed at, per
// the brief. Update this map once the real AOTY route lands. `sourceLabel` feeds the
// PageBreadcrumb's shorter, arrow-free source name — the standalone "← Back to X" link this
// used to also provide was MobileRatingLayout's own header link, removed in the mobile
// stage-1 restructure (docs/decisions/album-rating-page.md) now that the breadcrumb above
// both layouts covers that navigation.
function resolveBackDestination(from: string | null): { href: string; sourceLabel: string } {
  if (from === 'aoty') {
    // TODO: point at the real Ranked Albums/AOTY hub route once it exists.
    return { href: '/favorites', sourceLabel: 'AOTY' };
  }
  return { href: '/favorites', sourceLabel: 'Favorites' };
}

export function AlbumRatingPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { catalog, loading: catalogLoading } = useCriteriaCatalog();
  const { summary: ratingSummary, refetch: refetchRatingSummary } = useAlbumRatingsSummary();
  const { showError } = useFeedbackToast();

  const [albumInfo, setAlbumInfo] = useState<AlbumRow | null>(null);
  const [albumLoading, setAlbumLoading] = useState(true);
  const [ratings, setRatings] = useState<Map<number, number>>(new Map());
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [weights, setWeights] = useState<CriterionLevelWeight[]>([]);
  // Desktop-only display selection (MobileRatingLayout tracks its own detail-screen state).
  // Defaults to the first criterion in fixed order so Section 2 never opens on an empty
  // placeholder — this is purely which criterion's levels are *shown*, not a saved rating; see
  // docs/decisions/album-rating-page.md's dated entry on the desktop redesign.
  const [selectedCriterionId, setSelectedCriterionId] = useState<number>(FIXED_CRITERION_ORDER[0]);
  const [savingCriterionId, setSavingCriterionId] = useState<number | null>(null);

  const { href: backHref, sourceLabel } = resolveBackDestination(searchParams.get('from'));

  useEffect(() => {
    if (!albumId) return;
    let cancelled = false;

    async function loadAlbum() {
      setAlbumLoading(true);
      const { data } = await supabase
        .from('albums')
        .select('id, band, album, artwork_url, release_date, genre')
        .eq('id', albumId)
        .maybeSingle();
      if (cancelled) return;
      setAlbumInfo((data as AlbumRow | null) ?? null);
      setAlbumLoading(false);
    }

    loadAlbum();
    return () => {
      cancelled = true;
    };
  }, [albumId]);

  useEffect(() => {
    if (!albumId || !user) return;
    let cancelled = false;

    async function loadRatingsAndWeights() {
      setRatingsLoading(true);
      const [{ data: ratingRows }, { data: weightRows }] = await Promise.all([
        supabase.from('album_criteria_ratings').select('criterion_id, level').eq('album_id', albumId),
        supabase.from('user_criterion_weights').select('criterion_id, level, value'),
      ]);
      if (cancelled) return;
      const next = new Map<number, number>();
      for (const row of (ratingRows ?? []) as RatingRow[]) next.set(row.criterion_id, row.level);
      setRatings(next);
      // RatingRadarChart/CriterionLevelWeight use camelCase (criterionId) — the row itself is
      // snake_case straight off Supabase. Found via live verification: without this mapping,
      // the desktop tooltip's weight lookup key (`${criterionId}:${level}`) never matches and
      // silently shows "—" for every point, no thrown error.
      setWeights(
        ((weightRows ?? []) as WeightRow[]).map((w) => ({
          criterionId: w.criterion_id,
          level: w.level,
          value: w.value,
        }))
      );
      setRatingsLoading(false);
    }

    loadRatingsAndWeights();
    return () => {
      cancelled = true;
    };
  }, [albumId, user]);

  async function handlePick(criterionId: number, level: number) {
    if (!user || !albumId) return;
    setSavingCriterionId(criterionId);
    const { error } = await supabase
      .from('album_criteria_ratings')
      .upsert(
        { user_id: user.id, album_id: albumId, criterion_id: criterionId, level },
        { onConflict: 'user_id,album_id,criterion_id' }
      );
    setSavingCriterionId(null);
    if (error) {
      showError('Could not save rating — try again');
      return;
    }
    setRatings((prev) => new Map(prev).set(criterionId, level));
    refetchRatingSummary();
  }

  const loading = catalogLoading || albumLoading || ratingsLoading;

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />

          {loading ? (
            <Flex justify="center" align="center" minH="300px">
              <LoadingIndicator />
            </Flex>
          ) : !albumInfo ? (
            <Text textAlign="center" color="text.muted">
              Album not found.
            </Text>
          ) : (
            <>
              <Box>
                <PageBreadcrumb items={[{ label: sourceLabel, to: backHref }, { label: 'Album Evaluation' }]} />
              </Box>
              {/* Band/album title used to render here as a shared heading above both layouts —
                  moved into DesktopRatingLayout's card per the retouch pass (2026-08-05 dated
                  entry, docs/decisions/album-rating-page.md). MobileRatingLayout renders its
                  own separate compact title internally, unaffected by this move — it also
                  removes what was a pre-existing duplicate title on mobile. */}

              {/* Desktop (>= md): 3 simultaneous columns. Hidden via CSS class, not Chakra's
                  responsive `display` prop — the latter renders display:none in jsdom too and
                  breaks role-based test queries (same gotcha documented in Header.tsx). */}
              <Box css={{ '@media (max-width: 47.9375em)': { display: 'none' } }}>
                <DesktopRatingLayout
                  artworkUrl={albumInfo.artwork_url}
                  band={albumInfo.band}
                  album={albumInfo.album}
                  releaseDate={albumInfo.release_date}
                  genre={albumInfo.genre ?? []}
                  catalog={catalog}
                  order={FIXED_CRITERION_ORDER}
                  ratings={ratings}
                  weights={weights}
                  selectedCriterionId={selectedCriterionId}
                  onSelectCriterion={setSelectedCriterionId}
                  onPick={handlePick}
                  savingCriterionId={savingCriterionId}
                  ratingSummary={ratingSummary.get(albumInfo.id)}
                />
              </Box>

              {/* Mobile (< md): 2 sequential screens. */}
              <Box css={{ '@media (min-width: 48em)': { display: 'none' } }}>
                <MobileRatingLayout
                  artworkUrl={albumInfo.artwork_url}
                  band={albumInfo.band}
                  album={albumInfo.album}
                  releaseDate={albumInfo.release_date}
                  genre={albumInfo.genre ?? []}
                  catalog={catalog}
                  order={FIXED_CRITERION_ORDER}
                  ratings={ratings}
                  weights={weights}
                  ratingSummary={ratingSummary.get(albumInfo.id)}
                  onPick={handlePick}
                  savingCriterionId={savingCriterionId}
                />
              </Box>
            </>
          )}

          <Footer />
        </VStack>
      </Container>
    </Box>
  );
}
