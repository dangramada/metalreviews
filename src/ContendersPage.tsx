import { useMemo, useState } from 'react';
import { Box, Button, Container, Flex, Heading, Icon, Text, VStack } from '@chakra-ui/react';
import { LuOctagonAlert } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingIndicator } from './LoadingIndicator';
import { FavoriteListItemRow } from './FavoritesPage';
import { useContendersList } from './hooks/useContendersList';
import { confidenceLabel, useCalibrationGate } from './hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import {
  CalibrationGateDialog,
  type CalibrationGateMode,
} from './components/criteria-calibration/CalibrationGateDialog';
import { AddToContendersPicker } from './components/AddToContendersPicker';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { secondaryButton } from './theme';

// Contenders' own low-confidence copy — not FavoritesPage's private INSUFFICIENT_DATA_BADGE_TEXT
// (unexported), but the same "what to do" tone rule.
const INSUFFICIENT_DATA_TEXT = 'No score yet. Answer a round of comparisons in calibration.';

// The intermediate candidate pool between Favorites and AOTY (docs/decisions/
// aoty-hub-population.md). Scoped to Contenders only this pass — no AOTY final-list screen yet,
// see that doc's 2026-09-28 correction. Structured like FavoritesPage (same row component, same
// calibration-gate flow, duplicated rather than shared — see handleRate's comment below).
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

          {/* "More prominent than Favorites' current use" (aoty-hub-population.md) — a
              full-width banner rather than a per-row corner badge. Deliberately not
              TierAccuracyBadge/its `percent` prop: that's computed from live calibration-engine
              solver state in CriteriaCalibrationPage, not something to replay for a simple gate
              banner — see criteria-calibration-degree-tiers-and-progress.md's "What NOT to
              change". This reuses the same tier/hasInsufficientData signal Favorites' own
              confidenceWarningBadge already keys off. */}
          {!gateLoading && (calibrationTier === 'none' || hasInsufficientData) && (
            <Flex
              align="center"
              gap={3}
              p={4}
              border="2px solid"
              borderColor="border.ruleStrong"
              bg="surface.card"
            >
              <Icon as={LuOctagonAlert} boxSize={5} color="text.muted" flexShrink={0} />
              <Text fontSize="sm" color="text.muted">
                {hasInsufficientData
                  ? INSUFFICIENT_DATA_TEXT
                  : `Score level: ${confidenceLabel(calibrationTier)}. Scores here may shift as you keep calibrating.`}
              </Text>
            </Flex>
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
            <Text textAlign="center" color="text.muted">
              No contenders yet. Score an album, or add one from your favorites.
            </Text>
          ) : (
            <VStack gap={3} align="stretch">
              {items.map((item) => (
                <FavoriteListItemRow
                  key={item.albumId}
                  item={item}
                  onRemove={() => handleRemove(item.albumId, `${item.band} – ${item.album}`)}
                  removing={removingId === item.albumId}
                  removeLabel="Contenders"
                  ratingSummary={ratingSummary.get(item.albumId)}
                  onRate={() => handleRate(item.albumId)}
                  confidenceTier={calibrationTier}
                  hasInsufficientData={hasInsufficientData}
                  selectable
                  selected={selectedIds.has(item.albumId)}
                  onToggleSelect={(checked) => toggleSelect(item.albumId, checked)}
                />
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
