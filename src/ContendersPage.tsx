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
import { useContendersList } from './hooks/useContendersList';
import { useAotyList } from './hooks/useAotyList';
import { useCalibrationGate } from './hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import {
  CalibrationGateDialog,
  type CalibrationGateMode,
} from './components/criteria-calibration/CalibrationGateDialog';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from './components/ui/dialog';
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
  const { items: aotyItems, refetch: refetchAoty } = useAotyList();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedbackToast();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [showBulkRemoveConfirm, setShowBulkRemoveConfirm] = useState(false);

  const {
    tier: calibrationTier,
    hasWeights: hasCalibrationWeights,
    hasInsufficientData,
    loading: gateLoading,
  } = useCalibrationGate();
  const aotyIds = useMemo(() => new Set(aotyItems.map((i) => i.albumId)), [aotyItems]);
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

  // "Select for AOTY" is enabled for every row that can still be selected; the click either adds
  // the album or, when it isn't ready (not fully rated, tier 'none', stale data), hands off to
  // the existing gate flow via handleRate — same path as Evaluate. Only a missing release date
  // is a real dead end (no year to list it under), so that alone is disabled.
  function isReadyForAoty(albumId: string) {
    return ratingSummary.has(albumId) && calibrationTier !== 'none' && !hasInsufficientData;
  }

  async function addToAoty(albumIds: string[]) {
    if (!user || albumIds.length === 0) return false;
    // Upsert + ignoreDuplicates so a double click or a second tab is not a 23505 failure.
    const { error: insertError } = await supabase.from('aoty').upsert(
      albumIds.map((album_id) => ({ user_id: user.id, album_id })),
      { onConflict: 'user_id,album_id', ignoreDuplicates: true }
    );
    if (insertError) {
      showError('Could not add to AOTY — try again');
      return false;
    }
    refetchAoty();
    return true;
  }

  async function handleSelectForAoty(albumId: string, label: string) {
    if (!isReadyForAoty(albumId)) {
      handleRate(albumId);
      return;
    }
    if (await addToAoty([albumId])) showSuccess(`${label} added to AOTY`);
  }

  async function handleBulkSelectForAoty() {
    const chosen = items.filter((i) => selectedIds.has(i.albumId) && !aotyIds.has(i.albumId));
    const ready = chosen.filter((i) => isReadyForAoty(i.albumId) && i.releaseDate);
    setBulkAdding(true);
    const ok = await addToAoty(ready.map((i) => i.albumId));
    setBulkAdding(false);
    if (!ok && ready.length > 0) return;
    const skipped = chosen.length - ready.length;
    showSuccess(
      `${ready.length} added to AOTY.` +
        (skipped > 0
          ? ` ${skipped} skipped: not fully rated, no release date, or score level not settled.`
          : '')
    );
    setSelectedIds(new Set());
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
    refetchAoty();
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
    refetchAoty();
  }

  function toggleSelect(albumId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(albumId);
      else next.delete(albumId);
      return next;
    });
  }

  const bulkAotyAffected = Array.from(selectedIds).filter((id) => aotyIds.has(id)).length;

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
            <Flex gap={2}>
              <Button
                {...secondaryButton}
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                + Add from Favorites
              </Button>
              <Button
                {...secondaryButton}
                variant="outline"
                size="sm"
                onClick={() => navigate('/aoty')}
              >
                AOTY →
              </Button>
            </Flex>
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
          {!gateLoading && calibrationTier === 'none' && <TierNoneBanner from="contenders" />}

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
                <Flex gap={2}>
                  <Button
                    {...secondaryButton}
                    variant="outline"
                    size="sm"
                    loading={bulkAdding}
                    onClick={handleBulkSelectForAoty}
                  >
                    Select for AOTY
                  </Button>
                  <Button
                    {...secondaryButton}
                    variant="outline"
                    size="sm"
                    color="text.muted"
                    _hover={{ color: 'red.400' }}
                    loading={bulkRemoving}
                    onClick={() =>
                      bulkAotyAffected > 0 ? setShowBulkRemoveConfirm(true) : handleBulkRemove()
                    }
                  >
                    Remove
                  </Button>
                </Flex>
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
                    scoreLabel="Your Score"
                    note={
                      aotyIds.has(item.albumId)
                        ? 'In AOTY'
                        : item.releaseDate
                          ? undefined
                          : 'No release date yet.'
                    }
                    removeNote={
                      aotyIds.has(item.albumId)
                        ? 'This also removes 1 album from your AOTY list.'
                        : undefined
                    }
                    extraActions={
                      aotyIds.has(item.albumId) ? null : (
                        <Button
                          {...secondaryButton}
                          variant="outline"
                          size="sm"
                          disabled={!item.releaseDate}
                          aria-label={`Select ${item.band} – ${item.album} for AOTY`}
                          onClick={() =>
                            handleSelectForAoty(item.albumId, `${item.band} – ${item.album}`)
                          }
                        >
                          Select for AOTY
                        </Button>
                      )
                    }
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

      <DialogRoot
        open={showBulkRemoveConfirm}
        onOpenChange={({ open }) => setShowBulkRemoveConfirm(open)}
        role="alertdialog"
      >
        <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
          <DialogHeader>
            <DialogTitle fontWeight="semibold">Remove from Contenders?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            Remove {selectedIds.size} from your Contenders? This also removes {bulkAotyAffected}{' '}
            {bulkAotyAffected === 1 ? 'album' : 'albums'} from your AOTY list.
          </DialogBody>
          <DialogFooter gap={3}>
            <Button
              {...secondaryButton}
              variant="solid"
              onClick={() => setShowBulkRemoveConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              colorPalette="red"
              onClick={() => {
                setShowBulkRemoveConfirm(false);
                handleBulkRemove();
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

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
