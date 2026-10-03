import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Container, Flex, Heading, Icon, Text, VStack } from '@chakra-ui/react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingIndicator, LoadingIndicatorBars } from './LoadingIndicator';
import { TierNoneBanner } from './components/TierNoneBanner';
import { EmptyState } from './components/ui/empty-state';
import { FavoriteListItemRow } from './FavoritesPage';
import { useContendersList } from './hooks/useContendersList';
import { useAotyList } from './hooks/useAotyList';
import { usePendingIds } from './hooks/usePendingIds';
import { useCalibrationGate } from './hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import {
  CalibrationGateDialog,
  type CalibrationGateMode,
} from './components/criteria-calibration/CalibrationGateDialog';
import { AddToContendersPicker } from './components/AddToContendersPicker';
import { SelectableRow } from './components/SelectableRow';
import type { FavoriteListItem } from './hooks/useFavoritesList';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { secondaryButton } from './theme';
import { focusRowOrHeading } from './utils/focusRow';

// The intermediate candidate pool between Favorites and AOTY (docs/decisions/
// aoty/aoty-hub-population.md). Scoped to Contenders only this pass — no AOTY final-list screen
// yet, see aoty-contenders-implementation.md's first dated section. Structured like
// FavoritesPage (same row component, same calibration-gate flow, duplicated rather than shared
// — see handleRate's comment below).
export function ContendersPage() {
  const { items: allItems, loading: contendersLoading, error, refetch } = useContendersList();
  const {
    items: aotyItems,
    loading: aotyLoading,
    refetch: refetchAoty,
    addLocal: addAotyLocal,
  } = useAotyList();
  const { pending, run } = usePendingIds();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedbackToast();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const bulkBusy = bulkAdding || bulkRemoving;

  const {
    tier: calibrationTier,
    hasWeights: hasCalibrationWeights,
    hasInsufficientData,
    loading: gateLoading,
  } = useCalibrationGate();
  const aotyIds = useMemo(() => new Set(aotyItems.map((i) => i.albumId)), [aotyItems]);
  // An album lives in one place: once selected for AOTY it leaves this list (aoty is a subset of
  // contenders, so the picker below still gets the unfiltered set). A failed AOTY fetch leaves
  // aotyIds empty, i.e. every contender shows; re-selecting one is a harmless idempotent upsert.
  const items = useMemo(() => allItems.filter((i) => !aotyIds.has(i.albumId)), [allItems, aotyIds]);
  // Wait for AOTY too, or its members flash in this list until that fetch lands.
  const loading = contendersLoading || aotyLoading;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<{ removedIds: string[]; nextId: string | null } | null>(null);
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p || p.removedIds.some((id) => items.some((i) => i.albumId === id))) return;
    pendingFocus.current = null;
    focusRowOrHeading(p.nextId, headingRef.current);
  }, [items]);
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

  async function addToAoty(albums: FavoriteListItem[]) {
    if (!user || albums.length === 0) return false;
    // Upsert + ignoreDuplicates so a double click or a second tab is not a 23505 failure.
    const { error: insertError } = await supabase.from('aoty').upsert(
      albums.map((a) => ({ user_id: user.id, album_id: a.albumId })),
      { onConflict: 'user_id,album_id', ignoreDuplicates: true }
    );
    if (insertError) {
      showError('Could not add to AOTY — try again');
      return false;
    }
    // Rows leave the list now, from the write result; the refetch only reconciles.
    const createdAt = new Date().toISOString();
    addAotyLocal(albums.map((a) => ({ ...a, createdAt })));
    refetchAoty();
    return true;
  }

  function handleSelectForAoty(item: FavoriteListItem) {
    if (!isReadyForAoty(item.albumId)) {
      handleRate(item.albumId);
      return;
    }
    return run([item.albumId], async () => {
      // Focus goes to the next row (else the heading) once the row has actually left the list.
      const at = items.findIndex((i) => i.albumId === item.albumId);
      pendingFocus.current = { removedIds: [item.albumId], nextId: items[at + 1]?.albumId ?? null };
      if (await addToAoty([item])) showSuccess('Added to AOTY');
      else pendingFocus.current = null;
    });
  }

  async function handleBulkSelectForAoty() {
    if (bulkBusy) return;
    const chosen = items.filter((i) => selectedIds.has(i.albumId));
    const ready = chosen.filter((i) => isReadyForAoty(i.albumId) && i.releaseDate);
    setBulkAdding(true);
    const ok = await run(
      ready.map((i) => i.albumId),
      async () => {
        pendingFocus.current = { removedIds: ready.map((i) => i.albumId), nextId: null };
        const added = await addToAoty(ready);
        if (!added) pendingFocus.current = null;
        return added;
      }
    );
    setBulkAdding(false);
    // undefined: an album was already pending, nothing was written.
    if (ok === false || (ok === undefined && ready.length > 0)) return;
    const skipped = chosen.length - ready.length;
    showSuccess(
      `${ready.length} added to AOTY.` +
        (skipped > 0
          ? ` ${skipped} skipped: not fully rated, no release date, or score level not settled.`
          : '')
    );
    setSelectedIds(new Set());
  }

  function handleRemove(albumId: string, label: string) {
    if (!user) return;
    return run([albumId], async () => {
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
    });
  }

  async function handleBulkRemove() {
    if (!user || selectedIds.size === 0 || bulkBusy) return;
    const ids = Array.from(selectedIds);
    setBulkRemoving(true);
    const result = await run(ids, async () => {
      const { error: deleteError } = await supabase
        .from('contenders')
        .delete()
        .eq('user_id', user.id)
        .in('album_id', ids);
      if (deleteError) {
        showError('Could not remove — try again');
        return false;
      }
      return true;
    });
    setBulkRemoving(false);
    if (!result) return;
    showSuccess(`${ids.length} removed from Contenders`);
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

  const contenderAlbumIds = useMemo(() => new Set(allItems.map((i) => i.albumId)), [allItems]);

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />

          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Heading as="h2" size="xl" ref={headingRef} tabIndex={-1}>
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
                    disabled={bulkBusy}
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
                    disabled={bulkBusy}
                    onClick={handleBulkRemove}
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
              title={
                allItems.length > 0 ? 'All your contenders are in AOTY.' : 'No contenders yet.'
              }
              description="Score an album, or add one from your favorites."
            />
          ) : (
            <VStack gap={3} align="stretch">
              {items.map((item) => (
                <SelectableRow
                  key={item.albumId}
                  desktopOnly
                  disabled={bulkBusy && selectedIds.has(item.albumId)}
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
                    note={item.releaseDate ? undefined : 'No release date yet.'}
                    extraActions={
                      <Button
                        {...secondaryButton}
                        variant="outline"
                        size="sm"
                        disabled={!item.releaseDate}
                        data-primary-for={item.albumId}
                        aria-label={`Select ${item.band} – ${item.album} for AOTY`}
                        // Busy without `disabled` so keyboard focus stays on the button; run()
                        // ignores clicks while this album's write is in flight.
                        aria-busy={pending.has(item.albumId) || undefined}
                        aria-disabled={pending.has(item.albumId) || undefined}
                        css={
                          pending.has(item.albumId)
                            ? { opacity: 0.6, cursor: 'progress' }
                            : undefined
                        }
                        onClick={() => handleSelectForAoty(item)}
                      >
                        {pending.has(item.albumId) && <LoadingIndicatorBars />}
                        Select for AOTY
                      </Button>
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
