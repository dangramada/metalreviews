import { useMemo, useState } from 'react';
import { Box, Button, Container, Flex, Heading, Icon, Text, VStack } from '@chakra-ui/react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingIndicator } from './LoadingIndicator';
import { TierNoneBanner } from './components/TierNoneBanner';
import { EmptyState } from './components/ui/empty-state';
import { FavoriteListItemRow } from './FavoritesPage';
import { useAotyList } from './hooks/useAotyList';
import { useCalibrationGate } from './hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import { buildAotyView, type AotyRow } from './lib/aoty/aotyView';
import { getReleaseYear } from './App';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { primaryButton, secondaryButton } from './theme';

// The AOTY list: membership is stored (`aoty` table), everything shown is derived. Year comes
// from albums.release_date, order/rank from the user's current weights (compareAotyOrder).
// See docs/decisions/aoty/aoty-list-implementation.md.
export function AotyPage() {
  const { items, loading, error, refetch } = useAotyList();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError } = useFeedbackToast();
  const { summary, criterionOrder } = useAlbumRatingsSummary();
  const { tier, hasInsufficientData, hasWeights, loading: gateLoading } = useCalibrationGate();
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // No score to rank with: tier 'none' means the model isn't calibrated yet, and insufficient
  // data means the persisted tier describes a session that no longer exists.
  const scoresAvailable = hasWeights && tier !== 'none' && !hasInsufficientData;
  const view = useMemo(
    () => buildAotyView(items, summary, criterionOrder, scoresAvailable, getReleaseYear),
    [items, summary, criterionOrder, scoresAvailable]
  );

  // Latest year with selections unless the user picked one that still exists.
  const year = pickedYear !== null && view.byYear.has(pickedYear) ? pickedYear : view.years[0];
  const rows: AotyRow[] = year === undefined ? [] : (view.byYear.get(year) ?? []);

  async function handleRemove(albumId: string, name: string) {
    if (removingId || !user) return;
    setRemovingId(albumId);
    // Membership row only; the album stays in Contenders.
    const { error: deleteError } = await supabase
      .from('aoty')
      .delete()
      .eq('user_id', user.id)
      .eq('album_id', albumId);
    setRemovingId(null);
    if (deleteError) {
      showError('Could not remove — try again');
      return;
    }
    showSuccess(`${name} removed from AOTY`);
    refetch();
  }

  const renderRow = ({ item, rank }: AotyRow) => (
    <FavoriteListItemRow
      key={item.albumId}
      item={item}
      rank={rank}
      onRemove={() => handleRemove(item.albumId, `${item.band} – ${item.album}`)}
      removing={removingId === item.albumId}
      removeLabel="AOTY"
      ratingSummary={summary.get(item.albumId)}
      confidenceTier={tier}
      hasInsufficientData={hasInsufficientData}
    />
  );

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />

          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Heading as="h2" size="xl">
              AOTY
            </Heading>
            <Button
              {...secondaryButton}
              variant="outline"
              size="sm"
              onClick={() => navigate('/aoty/contenders')}
            >
              Contenders →
            </Button>
          </Flex>

          {/* Same banner as ContendersPage (component, tier condition and copy): reuses the shared
              `Alert` and `status.info` tokens for tier === 'none'. No TierAccuracyBadge here; see
              aoty-list-implementation.md's reversal section. */}
          {!gateLoading && tier === 'none' && <TierNoneBanner from="aoty" />}

          {view.years.length > 1 && (
            <Flex gap={2} wrap="wrap" role="group" aria-label="Year">
              {view.years.map((y) => (
                <Button
                  key={y}
                  {...(y === year ? primaryButton : secondaryButton)}
                  variant={y === year ? 'solid' : 'outline'}
                  size="sm"
                  aria-pressed={y === year}
                  onClick={() => setPickedYear(y)}
                >
                  {y}
                </Button>
              ))}
            </Flex>
          )}

          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <LoadingIndicator />
            </Flex>
          ) : error ? (
            <Text textAlign="center" color="red.400">
              Failed to load AOTY. Please try again later.
            </Text>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Icon as={Info} />}
              title="No AOTY picks yet."
              description="Pick from your Contenders."
            />
          ) : (
            <VStack gap={3} align="stretch">
              {rows.map(renderRow)}
              {view.noYear.length > 0 && (
                <>
                  <Heading as="h3" size="md" pt={4}>
                    No release year
                  </Heading>
                  {view.noYear.map(renderRow)}
                </>
              )}
            </VStack>
          )}

          <Footer />
        </VStack>
      </Container>
    </Box>
  );
}
