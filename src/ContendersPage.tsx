import { useMemo, useState } from 'react';
import { Box, Button, Container, Flex, Heading, Icon, Text, VStack } from '@chakra-ui/react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingIndicator } from './LoadingIndicator';
import { Alert } from './components/ui/alert';
import { EmptyState } from './components/ui/empty-state';
import { FavoriteListItemRow } from './FavoritesPage';
import { useContendersList } from './hooks/useContendersList';
import { confidenceLabel, useCalibrationGate } from './hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import {
  CalibrationGateDialog,
  type CalibrationGateMode,
} from './components/criteria-calibration/CalibrationGateDialog';
import { AddToContendersPicker } from './components/AddToContendersPicker';
import { SelectableRow } from './components/SelectableRow';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { secondaryButton } from './theme';

// The intermediate candidate pool between Favorites and AOTY (docs/decisions/
// aoty/aoty-hub-population.md). Scoped to Contenders only this pass — no AOTY final-list screen
// yet, see aoty-contenders-implementation.md's first dated section. Structured like
// FavoritesPage (same row component, same calibration-gate flow, duplicated rather than shared
// — see handleRate's comment below).
export function ContendersPage() {
  const { items, loading, error, refetch } = useContendersList();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedbackToast();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);

  const {
    tier: calibrationTier,
    hasWeights: hasCalibrationWeights,
    hasInsufficientData,
    loading: gateLoading,
  } = useCalibrationGate();
  const { summary: ratingSummary } = useAlbumRatingsSummary();
  const [gateMode, setGateMode] = useState<CalibrationGateMode | null>(null);
  const [pendingRateAlbumId, setPendingRateAlbumId] = useState<string | null>(null);

  // Same hard/soft gate flow as FavoritesPage.handleRate — duplicated rather than extracted
  // into a shared hook, to avoid touching that page's already-shipped, live-verified gate logic
  // for a one-off reuse.
  function handleRate(albumId: string) {
    if (gateLoading) return;
    if (!hasCalibrationWeights) {
      setPendingRateAlbumId(albumId);
      setGateMode('hard');
      return;
    }
    if (calibrationTier === 'none') {
      setPendingRateAlbumId(albumId);
      setGateMode('soft');
      return;
    }
    navigate(`/rate/${albumId}?from=contenders`);
  }

  async function handleRemove(albumId: string, label: string) {
    if (removingId || !user) return;
    setRemovingId(albumId);
    const { error: deleteError } = await supabase
      .from('contenders')
      .delete()
      .eq('user_id', user.id)
      .eq('album_id', albumId);
    setRemovingId(null);
    if (deleteError) {
      showError('Could not remove — try again');
      return;
    }
    showSuccess(`${label} removed from Contenders`);
    setSelectedIds((prev) => {
      if (!prev.has(albumId)) return prev;
      const next = new Set(prev);
      next.delete(albumId);
      return next;
    });
    refetch();
  }

  async function handleBulkRemove() {
    if (!user || selectedIds.size === 0) return;
    setBulkRemoving(true);
    const { error: deleteError } = await supabase
      .from('contenders')
      .delete()
      .eq('user_id', user.id)
      .in('album_id', Array.from(selectedIds));
    setBulkRemoving(false);
    if (deleteError) {
      showError('Could not remove — try again');
      return;
    }
    showSuccess(`${selectedIds.size} removed from Contenders`);
    setSelectedIds(new Set());
    refetch();
  }

  function toggleSelect(albumId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(albumId);
      else next.delete(albumId);
      return next;
    });
  }

  const contenderAlbumIds = useMemo(() => new Set(items.map((i) => i.albumId)), [items]);

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />

          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Heading as="h2" size="xl">
              Contenders
            </Heading>
            <Button
              {...secondaryButton}
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              + Add from Favorites
            </Button>
          </Flex>

          {/* "More prominent than Favorites' current use" (aoty/aoty-hub-population.md) — a
              full-width banner rather than a per-row corner badge. Reuses the shared `Alert`
              component and `status.info` tokens exactly as AlbumRatingPage's insufficient-data
              banner and CriteriaCalibrationPage's resume banner already do for this same
              tier === 'none' condition — not a new banner pattern. Deliberately not
              TierAccuracyBadge/its `percent` prop: that's computed from live calibration-engine
              solver state in CriteriaCalibrationPage, not something to replay here — see
              criteria-calibration-degree-tiers-and-progress.md's "What NOT to change", and
              aoty-contenders-implementation.md's banner-revision section for the fuller
              rationale. Body copy is the same "settle the score" sentence
              CalibrationGateDialog's soft mode and CriteriaCalibrationPage's resume banner
              already use for tier === 'none' — same event, same words, not a fourth variant. */}
          {!gateLoading && calibrationTier === 'none' && (
            <Alert
              status="info"
              variant="surface"
              bg="status.info.bg"
              color="status.info.text"
              title={`Score level: ${confidenceLabel(calibrationTier)}`}
            >
              A few more comparisons usually settle the score closer to what matters most to you.
            </Alert>
          )}

          {/* Bulk action bar — desktop only, same raw-CSS `@media` toggle convention as
              FavoriteListItemRow (not a Chakra responsive prop — see that component's own
              comment on why). */}
          {selectedIds.size > 0 && (
            <Box css={{ '@media (max-width: 47.9375em)': { display: 'none' } }}>
              <Flex
                align="center"
                justify="space-between"
                p={3}
                border="2px solid"
                borderColor="border.ruleStrong"
                bg="surface.raised"
              >
                <Text fontSize="sm" color="text.primary">
                  {selectedIds.size} selected
                </Text>
                <Button
                  {...secondaryButton}
                  variant="outline"
                  size="sm"
                  color="text.muted"
                  _hover={{ color: 'red.400' }}
                  loading={bulkRemoving}
                  onClick={handleBulkRemove}
                >
                  Remove
                </Button>
              </Flex>
            </Box>
          )}

          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <LoadingIndicator />
            </Flex>
          ) : error ? (
            <Text textAlign="center" color="red.400">
              Failed to load Contenders. Please try again later.
            </Text>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Icon as={Info} />}
              title="No contenders yet."
              description="Score an album, or add one from your favorites."
            />
          ) : (
            <VStack gap={3} align="stretch">
              {items.map((item) => (
                <SelectableRow
                  key={item.albumId}
                  desktopOnly
                  selected={selectedIds.has(item.albumId)}
                  onToggleSelect={(checked) => toggleSelect(item.albumId, checked)}
                  ariaLabel={`${selectedIds.has(item.albumId) ? 'Deselect' : 'Select'} ${item.band} – ${item.album}`}
                >
                  <FavoriteListItemRow
                    item={item}
                    onRemove={() => handleRemove(item.albumId, `${item.band} – ${item.album}`)}
                    removing={removingId === item.albumId}
                    removeLabel="Contenders"
                    ratingSummary={ratingSummary.get(item.albumId)}
                    onRate={() => handleRate(item.albumId)}
                    confidenceTier={calibrationTier}
                    hasInsufficientData={hasInsufficientData}
                  />
                </SelectableRow>
              ))}
            </VStack>
          )}

          <Footer />
        </VStack>
      </Container>

      <AddToContendersPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        contenderAlbumIds={contenderAlbumIds}
        onAdded={refetch}
      />

      <CalibrationGateDialog
        open={gateMode !== null}
        onOpenChange={(open) => {
          if (!open) setGateMode(null);
        }}
        mode={gateMode ?? 'hard'}
        onEvaluateAnyway={() => {
          setGateMode(null);
          if (pendingRateAlbumId) navigate(`/rate/${pendingRateAlbumId}?from=contenders`);
        }}
        onGoToCalibration={() => {
          setGateMode(null);
          navigate('/calibration?from=contenders');
        }}
      />
    </Box>
  );
}
