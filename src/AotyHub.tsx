import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Container, Flex, Heading, Icon, Tabs, Text, VStack } from '@chakra-ui/react';
import { Info } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingIndicator, LoadingIndicatorBars } from './LoadingIndicator';
import { TierNoneBanner } from './components/TierNoneBanner';
import { EmptyState } from './components/ui/empty-state';
import { FavoriteListItemRow } from './FavoritesPage';
import { useContendersList } from './hooks/useContendersList';
import { useAotyList } from './hooks/useAotyList';
import { useReadinessKnown } from './hooks/useReadinessKnown';
import { useYearScope, scopeOf } from './hooks/useYearScope';
import { ReleaseDateDialog } from './components/ReleaseDateDialog';
import { formatReleaseDate, getReleaseYear } from './App';
import { YearScopeSelect } from './components/YearScopeSelect';
import { scopeLabel } from './lib/aoty/yearScope';
import { buildAotyView, type AotyRow } from './lib/aoty/aotyView';
import type { AddedToast } from './components/AddToContendersPicker';
import { usePendingIds } from './hooks/usePendingIds';
import { useCalibrationGate } from './hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import {
  CalibrationGateDialog,
  type CalibrationGateMode,
} from './components/criteria-calibration/CalibrationGateDialog';
import { AddToContendersPicker } from './components/AddToContendersPicker';
import { SelectableRow } from './components/SelectableRow';
import { ContendersBulkBar } from './components/ContendersBulkBar';
import type { FavoriteListItem } from './hooks/useFavoritesList';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { secondaryButton } from './theme';
import { findRowControl, focusRowOrHeading } from './utils/focusRow';

const EMPTY_IDS: Set<string> = new Set();

export type HubScreen = 'aoty' | 'contenders';

// The AOTY hub: two tabs on /aoty, AOTY (the final list) and Contenders (the pool it is picked from),
// chosen by `?view=aoty|contenders` (default aoty; anything else falls back to it). The tab bar and
// framed panel follow the Criteria Calibration page. One component owns all the data and write
// state, so pending writes and dialogs survive a tab switch; the selection does not (it is keyed to
// the tab and year scope). `/aoty/contenders` redirects here (see AotyContendersRedirect). Behaviour of each list is documented in
// docs/decisions/aoty/aoty-list-implementation.md and aoty-contenders-implementation.md.
export function AotyHub({ screen: forcedScreen }: { screen?: HubScreen }) {
  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const screen: HubScreen = forcedScreen ?? (viewParam === 'contenders' ? 'contenders' : 'aoty');
  const showContenders = screen === 'contenders';

  // `replace`, not push, and the other params (year, from) are kept: switching tabs is not a page.
  function setView(next: HubScreen) {
    // The keyed selection below already ignores another tab's ids; dropping the record as well
    // means coming back to the same tab does not bring the old selection back.
    setSelection({ key: '', ids: EMPTY_IDS });
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('view', next);
        return p;
      },
      { replace: true }
    );
  }

  const {
    items: allItems,
    loading: contendersLoading,
    error: contendersError,
    refetch,
    addLocal: addContendersLocal,
    setReleaseDateLocal,
  } = useContendersList();
  const {
    items: aotyItems,
    aotyIds,
    idsLoading: aotyIdsLoading,
    error: aotyError,
    refetch: refetchAoty,
    addLocal: addAotyLocal,
    removeLocal: removeAotyLocal,
  } = useAotyList({ pool: allItems, poolLoading: contendersLoading, poolError: contendersError });
  const { pending, run } = usePendingIds();
  const { user } = useAuth();
  const { showSuccess, showError, showAction } = useFeedbackToast();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  // The undated contender whose release-date dialog is open.
  // Kept after closing so the dialog can finish its exit and hand focus back to the row's button.
  const [dateTarget, setDateTarget] = useState<FavoriteListItem | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  // Set when a save moves the row out of view: focus goes to the next row only after the dialog
  // has finished closing, or the dialog's own focus restore would override it.
  const dateExitFocus = useRef<{ nextId: string | null } | null>(null);
  const bulkBusy = bulkAdding || bulkRemoving;

  const {
    tier: calibrationTier,
    hasWeights: hasCalibrationWeights,
    hasInsufficientData,
    loading: gateLoading,
  } = useCalibrationGate();
  // An album lives in one place: once selected for AOTY it leaves Contenders (AOTY is a subset of
  // the pool, so the picker below still gets the unfiltered set). A failed AOTY ids read leaves
  // aotyIds empty, i.e. every contender shows; re-selecting one is a harmless idempotent upsert.
  const items = useMemo(() => allItems.filter((i) => !aotyIds.has(i.albumId)), [allItems, aotyIds]);
  // The pinned year scope narrows what is shown in both lists; `items` stays unscoped so the focus
  // handoff below only fires once a row has really left the list, not on a scope switch.
  const {
    scope,
    setYear: setScopeYear,
    options,
    inScope,
  } = useYearScope({
    pool: allItems,
    aotyIds,
    ready: !contendersLoading && !aotyIdsLoading,
  });
  const scopedItems = useMemo(() => items.filter(inScope), [items, inScope]);
  // The selection is stored with the tab and year scope it was made in, and ignored under any
  // other key: rows of another tab or scope are not on screen, so it must not stay live. Keyed
  // state rather than an effect that clears it, so no render ever shows a stale selection.
  const selectionKey = `${screen}|${String(scope)}`;
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({
    key: selectionKey,
    ids: EMPTY_IDS,
  });
  const selectedIds = selection.key === selectionKey ? selection.ids : EMPTY_IDS;
  // A user-driven year change drops the record for the same reason as setView.
  function setYear(next: Parameters<typeof setScopeYear>[0]) {
    setSelection({ key: '', ids: EMPTY_IDS });
    setScopeYear(next);
  }
  function setSelectedIds(next: Set<string> | ((prev: Set<string>) => Set<string>)) {
    setSelection((cur) => {
      const prev = cur.key === selectionKey ? cur.ids : EMPTY_IDS;
      return { key: selectionKey, ids: typeof next === 'function' ? next(prev) : next };
    });
  }
  // What the user can actually see checked. `selectedIds` is only ever written by the checkboxes
  // and the clears below, so an id whose row has left the list (promoted through its own button,
  // dated into another year, removed elsewhere) would otherwise stay in it: inflating the count and,
  // worse, being deleted by bulk Remove, which cascades to its AOTY row. Derived, not pruned, so a
  // refetch that briefly empties the list cannot drop a valid selection.
  const effectiveSelectedIds = useMemo(
    () => new Set(scopedItems.filter((i) => selectedIds.has(i.albumId)).map((i) => i.albumId)),
    [scopedItems, selectedIds]
  );
  // Wait for the AOTY ids too (not the full AOTY list), or its members flash in Contenders.
  const loading = contendersLoading || aotyIdsLoading;
  // Where focus goes when the row it was on has left and no other row remains: the active tab.
  const tablistRef = useRef<HTMLDivElement>(null);
  const activeTab = () =>
    tablistRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null;
  const pendingFocus = useRef<{ removedIds: string[]; nextId: string | null } | null>(null);
  // Watches what is on screen, not the whole list: a row can leave the view without leaving the
  // list (dating an album moves it to another year scope).
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p || p.removedIds.some((id) => scopedItems.some((i) => i.albumId === id))) return;
    pendingFocus.current = null;
    focusRowOrHeading(p.nextId, activeTab());
  }, [scopedItems]);
  const {
    summary: ratingSummary,
    criterionOrder,
    refetch: refetchRatings,
    loading: ratingsLoading,
  } = useAlbumRatingsSummary();
  // Whether "is this album ready to select?" (and the AOTY ranks) can be known yet. Until both
  // the ratings summary and the calibration gate have settled, an empty summary and the default
  // tier 'none' would read as "not ready" and send a ready album to the gate or the rating page,
  // and AOTY would list its members unranked and then re-sort. A failed fetch settles too (the
  // hooks end `loading` either way).
  const { known, busyVisible, notePress } = useReadinessKnown(
    gateLoading || ratingsLoading,
    user?.id ?? null
  );
  const unknownBusy = !known && busyVisible;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The release date dialog's button label, decided once when readiness becomes known and then
  // fixed for that dialog instance (a refresh underneath must not change what Save does).
  const [latched, setLatched] = useState<{ albumId: string; ready: boolean } | null>(null);
  const [gateMode, setGateMode] = useState<CalibrationGateMode | null>(null);
  // The dialogs belong to the Contenders tab. A tab change that did not come from this page (the
  // browser's Back, a link) unmounts them, so their open state must not wait for the tab to return.
  const [dialogScreen, setDialogScreen] = useState(screen);
  if (dialogScreen !== screen) {
    setDialogScreen(screen);
    setDateOpen(false);
    setGateMode(null);
  }
  const [pendingRateAlbumId, setPendingRateAlbumId] = useState<string | null>(null);

  // ─── AOTY ──────────────────────────────────────────────────────────────────
  // No score to rank with: tier 'none' means the model isn't calibrated yet, and insufficient
  // data means the persisted tier describes a session that no longer exists.
  const scoresAvailable =
    hasCalibrationWeights && calibrationTier !== 'none' && !hasInsufficientData;
  // Built for both tabs: the AOTY tab's count needs it while Contenders is showing.
  const aotyView = useMemo(
    () => buildAotyView(aotyItems, ratingSummary, criterionOrder, scoresAvailable, getReleaseYear),
    [aotyItems, ratingSummary, criterionOrder, scoresAvailable]
  );
  const aotyRows: AotyRow[] =
    scope === null ? [] : scope === 'none' ? aotyView.noYear : (aotyView.byYear.get(scope) ?? []);
  const aotyPendingFocus = useRef<{ removedId: string; nextId: string | null } | null>(null);
  // Focus goes to the next row (else the active tab) once the moved row has left the list.
  useEffect(() => {
    const p = aotyPendingFocus.current;
    if (!p || aotyItems.some((i) => i.albumId === p.removedId)) return;
    aotyPendingFocus.current = null;
    focusRowOrHeading(p.nextId, activeTab());
  }, [aotyItems]);

  function handleBackToContenders(albumId: string) {
    if (!user) return;
    return run([albumId], async () => {
      // Membership row only; the album is still a contender and reappears there.
      const { error: deleteError } = await supabase
        .from('aoty')
        .delete()
        .eq('user_id', user.id)
        .eq('album_id', albumId);
      if (deleteError) {
        showError('Could not move back to Contenders. Try again.');
        return;
      }
      const at = aotyRows.findIndex((r) => r.item.albumId === albumId);
      aotyPendingFocus.current = {
        removedId: albumId,
        nextId: aotyRows[at + 1]?.item.albumId ?? null,
      };
      showSuccess('Moved back to Contenders');
      // Row leaves now, from the write result; the refetch only reconciles.
      removeAotyLocal([albumId]);
      refetchAoty();
    });
  }

  // ─── Contenders ────────────────────────────────────────────────────────────
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

  // "Select for AOTY" is enabled for every row; the click either adds the album or, when it isn't
  // ready (not fully rated, tier 'none', stale data), hands off to the existing gate flow via
  // handleRate — same path as Evaluate. An undated album opens the release date dialog instead
  // (see the button's onClick).
  function isReadyForAoty(albumId: string) {
    return ratingSummary.has(albumId) && calibrationTier !== 'none' && !hasInsufficientData;
  }

  if (dateOpen && dateTarget && known && latched?.albumId !== dateTarget.albumId) {
    setLatched({ albumId: dateTarget.albumId, ready: isReadyForAoty(dateTarget.albumId) });
  }

  async function addToAoty(albums: FavoriteListItem[]) {
    if (!user || albums.length === 0) return false;
    // Upsert + ignoreDuplicates so a double click or a second tab is not a 23505 failure.
    let insertError: unknown;
    try {
      ({ error: insertError } = await supabase.from('aoty').upsert(
        albums.map((a) => ({ user_id: user.id, album_id: a.albumId })),
        { onConflict: 'user_id,album_id', ignoreDuplicates: true }
      ));
    } catch (e) {
      console.warn('Failed to add to AOTY', e);
      insertError = e;
    }
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
    // Readiness not known yet: do nothing (no gate, no navigation); the row shows it is busy.
    if (!known) {
      notePress();
      return;
    }
    if (!isReadyForAoty(item.albumId)) {
      handleRate(item.albumId);
      return;
    }
    return run([item.albumId], async () => {
      // Focus goes to the next row (else the heading) once the row has actually left the list.
      const at = scopedItems.findIndex((i) => i.albumId === item.albumId);
      pendingFocus.current = {
        removedIds: [item.albumId],
        nextId: scopedItems[at + 1]?.albumId ?? null,
      };
      // addToAoty reports its own failures (including a throw) and returns false.
      if (await addToAoty([item])) showSuccess('Added to AOTY');
      else pendingFocus.current = null;
    });
  }

  // Reads the stored date back. Used when the RPC returned nothing usable (the pre-v2 function
  // returns void), so a missing return is never taken as success.
  async function fetchStoredReleaseDate(albumId: string): Promise<string | null> {
    const { data, error: readError } = await supabase
      .from('albums')
      .select('release_date')
      .eq('id', albumId)
      .maybeSingle();
    return readError
      ? null
      : ((data as { release_date: string | null } | null)?.release_date ?? null);
  }

  // An undated album has no year to list it under, so "Select for AOTY" asks for the date first
  // (same hand-off shape as the not-yet-rated case, which goes to the rating gate).
  function openDateDialog(item: FavoriteListItem) {
    setLatched(null);
    setDateTarget(item);
    setDateOpen(true);
  }

  // The RPC fills a NULL date only and returns whatever is stored afterwards, so the result can
  // be someone else's earlier date; that is shown, never overwritten.
  function handleSaveReleaseDate(item: FavoriteListItem, value: string, selectAfter: boolean) {
    return run([item.albumId], async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('fill_missing_release_date', {
          p_album_id: item.albumId,
          p_release_date: value,
        });
        if (rpcError) {
          showError('Could not save release date. Try again.');
          return;
        }
        const stored =
          typeof data === 'string' && data !== ''
            ? data
            : await fetchStoredReleaseDate(item.albumId);
        if (stored === null) {
          showError('Could not confirm the release date. Try again.');
          return;
        }

        const leaves = scopeOf(stored) !== scope;
        if (leaves) {
          const at = scopedItems.findIndex((i) => i.albumId === item.albumId);
          dateExitFocus.current = { nextId: scopedItems[at + 1]?.albumId ?? null };
        }
        setDateOpen(false);
        setReleaseDateLocal(item.albumId, stored);
        refetch();
        // Its rank is computed within its release year, so the summary has to be recomputed.
        refetchRatings();

        const label = `${item.band} – ${item.album}`;
        const already = stored !== value;
        // The click was "Select for AOTY", so finish it when the album is ready to be selected.
        // Not ready (not fully rated, score level not settled): only the date is saved, and the
        // row's next "Select for AOTY" click goes to the rating gate as for any dated album. A
        // failed selection shows its own error; the date stays saved either way.
        if (selectAfter && (await addToAoty([{ ...item, releaseDate: stored }]))) {
          showSuccess(
            already
              ? `${label} already has the release date ${formatReleaseDate(stored)}. Added to AOTY with that date.`
              : `Saved ${formatReleaseDate(stored)} and added ${label} to AOTY.`
          );
          return;
        }
        const message = !already
          ? `Saved ${formatReleaseDate(stored)} for ${label}.`
          : `${label} already has the release date ${formatReleaseDate(stored)}. Nothing was changed.`;
        const year = getReleaseYear(stored);
        if (leaves && year !== null)
          showAction(message, { label: `View ${year}`, onClick: () => setYear(year) });
        else showSuccess(message);
      } catch (e) {
        // A throw (as opposed to an error result) must not leave the dialog waiting or the
        // control busy; run() clears the pending flag.
        console.warn('Failed to save release date', e);
        showError('Could not save release date. Try again.');
      }
    });
  }

  async function handleBulkSelectForAoty() {
    if (bulkBusy) return;
    // Readiness not known yet: ignore the press, keep the selection, show the bar as busy.
    if (!known) {
      notePress();
      return;
    }
    const chosen = scopedItems.filter((i) => effectiveSelectedIds.has(i.albumId));
    const ready = chosen.filter((i) => isReadyForAoty(i.albumId) && i.releaseDate);
    const skipped = chosen.length - ready.length;
    const skippedText = `${skipped} skipped: not fully rated, no release date, or score level not settled.`;
    // Nothing to add: say why and keep the selection so it can be corrected.
    if (ready.length === 0) {
      showError(skippedText);
      return;
    }
    setBulkAdding(true);
    let ok: boolean | undefined;
    try {
      ok = await run(
        ready.map((i) => i.albumId),
        async () => {
          // The bar stays, so focus goes to the first row that remains (else the heading).
          const readyIds = new Set(ready.map((i) => i.albumId));
          pendingFocus.current = {
            removedIds: [...readyIds],
            nextId: scopedItems.find((i) => !readyIds.has(i.albumId))?.albumId ?? null,
          };
          const added = await addToAoty(ready);
          if (!added) pendingFocus.current = null;
          return added;
        }
      );
    } catch (e) {
      console.warn('Failed to add to AOTY', e);
      pendingFocus.current = null;
      showError('Could not add to AOTY — try again');
      ok = false;
    } finally {
      if (mounted.current) setBulkAdding(false);
    }
    // undefined: an album was already pending, nothing was written.
    if (ok === false || ok === undefined) return;
    showSuccess(`${ready.length} added to AOTY.` + (skipped > 0 ? ` ${skippedText}` : ''));
    setSelectedIds(new Set());
  }

  function handleRemove(albumId: string, label: string) {
    if (!user) return;
    return run([albumId], async () => {
      setRemovingId(albumId);
      try {
        const { error: deleteError } = await supabase
          .from('contenders')
          .delete()
          .eq('user_id', user.id)
          .eq('album_id', albumId);
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
      } catch (e) {
        console.warn('Failed to remove from Contenders', e);
        showError('Could not remove — try again');
      } finally {
        if (mounted.current) setRemovingId(null);
      }
    });
  }

  async function handleBulkRemove() {
    if (!user || effectiveSelectedIds.size === 0 || bulkBusy) return;
    const ids = Array.from(effectiveSelectedIds);
    setBulkRemoving(true);
    let result: boolean | undefined;
    try {
      result = await run(ids, async () => {
        try {
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
        } catch (e) {
          console.warn('Failed to remove from Contenders', e);
          showError('Could not remove — try again');
          return false;
        }
      });
    } finally {
      if (mounted.current) setBulkRemoving(false);
    }
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

  // Runs before the picker's success toast: the albums join the pool first, so a "View <year>"
  // click lands on a scope that already contains them.
  function handleAdded(added: FavoriteListItem[]): AddedToast | undefined {
    addContendersLocal(added);
    refetch();
    if (scope === null) return undefined;
    const outside = added.filter((a) => !inScope(a));
    if (outside.length === 0) return undefined;
    const scopes = new Set(outside.map((a) => scopeOf(a.releaseDate)));
    const only = scopes.size === 1 ? [...scopes][0] : null;
    return {
      suffix: ` ${outside.length} ${outside.length === 1 ? 'is' : 'are'} outside ${scope === 'none' ? 'the no-year view' : scope}.`,
      action:
        typeof only === 'number'
          ? { label: `View ${only}`, onClick: () => setYear(only) }
          : undefined,
    };
  }

  const contenderAlbumIds = useMemo(() => new Set(allItems.map((i) => i.albumId)), [allItems]);

  const inScopeCount = allItems.filter(inScope).length;
  const emptyTitle =
    allItems.length === 0
      ? 'No contenders yet.'
      : scope === null
        ? 'All your contenders are in AOTY.'
        : inScopeCount === 0
          ? scope === 'none'
            ? 'No contenders without a release year.'
            : `No contenders in ${scope}.`
          : scope === 'none'
            ? 'All your contenders without a release year are in AOTY.'
            : `All your ${scopeLabel(scope)} contenders are in AOTY.`;

  const errorState = (text: string) => (
    <Text textAlign="center" color="red.400">
      {text}
    </Text>
  );
  const loadingState = (
    <Flex justify="center" align="center" minH="200px">
      <LoadingIndicator />
    </Flex>
  );

  // ─── Lists ─────────────────────────────────────────────────────────────────
  const renderAotyRow = ({ item, rank }: AotyRow) => (
    <FavoriteListItemRow
      key={item.albumId}
      item={item}
      rank={rank}
      scoreLabel="Your Score"
      hideGenres
      onBackToContenders={() => handleBackToContenders(item.albumId)}
      backPending={pending.has(item.albumId)}
      ratingSummary={ratingSummary.get(item.albumId)}
      confidenceTier={calibrationTier}
      hasInsufficientData={hasInsufficientData}
    />
  );

  const goToContenders = (
    <Button {...secondaryButton} variant="outline" size="sm" onClick={() => setView('contenders')}>
      Go to Contenders
    </Button>
  );

  const aotyBody = () =>
    // Waits for readiness too: before the ratings summary lands every member is unranked.
    loading || !known ? (
      loadingState
    ) : aotyError ? (
      errorState('Failed to load AOTY. Please try again later.')
    ) : aotyItems.length === 0 ? (
      <EmptyState
        icon={<Icon as={Info} />}
        title="No AOTY picks yet."
        description={
          allItems.length === 0
            ? 'Add albums to Contenders first, then choose from them here.'
            : 'Choose albums from the Contenders tab.'
        }
      >
        {goToContenders}
      </EmptyState>
    ) : aotyRows.length === 0 ? (
      <EmptyState
        icon={<Icon as={Info} />}
        title={
          scope === 'none'
            ? 'No AOTY picks without a release year.'
            : `No AOTY picks in ${scope === null ? 'this year' : scopeLabel(scope)}.`
        }
        description="Choose albums from the Contenders tab."
      >
        {goToContenders}
      </EmptyState>
    ) : (
      <VStack gap={3} align="stretch">
        {aotyRows.map((r) => renderAotyRow(r))}
      </VStack>
    );

  const renderContenderRow = (item: FavoriteListItem) => (
    <SelectableRow
      key={item.albumId}
      desktopOnly
      disabled={bulkBusy && effectiveSelectedIds.has(item.albumId)}
      selected={effectiveSelectedIds.has(item.albumId)}
      onToggleSelect={(checked) => toggleSelect(item.albumId, checked)}
      ariaLabel={`${effectiveSelectedIds.has(item.albumId) ? 'Deselect' : 'Select'} ${item.band} – ${item.album}`}
    >
      <FavoriteListItemRow
        item={item}
        onRemove={() => handleRemove(item.albumId, `${item.band} – ${item.album}`)}
        removing={removingId === item.albumId}
        removeLabel="Contenders"
        hideGenres
        scoreLabel="Your Score"
        note={item.releaseDate ? undefined : 'No release date yet.'}
        extraActions={({ noteId }) => {
          // Pending write or readiness still unknown: busy without `disabled`, so
          // keyboard focus stays on the button; the click handlers ignore presses.
          const busy = pending.has(item.albumId) || unknownBusy;
          return (
            <Button
              {...secondaryButton}
              variant="outline"
              size="sm"
              data-primary-for={item.albumId}
              aria-label={`Select ${item.band} – ${item.album} for AOTY`}
              aria-describedby={noteId}
              aria-busy={busy || undefined}
              aria-disabled={busy || undefined}
              css={busy ? { opacity: 0.6, cursor: 'progress' } : undefined}
              onClick={() => {
                if (item.releaseDate) handleSelectForAoty(item);
                else openDateDialog(item);
              }}
            >
              {pending.has(item.albumId) && <LoadingIndicatorBars />}
              Select for AOTY
            </Button>
          );
        }}
        ratingSummary={ratingSummary.get(item.albumId)}
        onRate={() => handleRate(item.albumId)}
        confidenceTier={calibrationTier}
        hasInsufficientData={hasInsufficientData}
      />
    </SelectableRow>
  );

  const contendersBody = () =>
    loading ? (
      loadingState
    ) : contendersError ? (
      errorState('Failed to load Contenders. Please try again later.')
    ) : scopedItems.length === 0 ? (
      <EmptyState
        icon={<Icon as={Info} />}
        title={emptyTitle}
        description="Score an album, or add one from your favorites."
      />
    ) : (
      <VStack gap={3} align="stretch">
        {scopedItems.map((item) => renderContenderRow(item))}
      </VStack>
    );

  const bulkBar = (
    <ContendersBulkBar
      selectedCount={effectiveSelectedIds.size}
      adding={bulkAdding}
      removing={bulkRemoving}
      busy={bulkBusy}
      unknownBusy={unknownBusy}
      onSelectForAoty={handleBulkSelectForAoty}
      onRemove={handleBulkRemove}
    />
  );

  // "More prominent than Favorites' current use" (aoty/aoty-hub-population.md) — a full-width
  // banner rather than a per-row corner badge. Reuses the shared `Alert` component and
  // `status.info` tokens exactly as AlbumRatingPage's insufficient-data banner and
  // CriteriaCalibrationPage's resume banner already do for this same tier === 'none' condition.
  // Deliberately not TierAccuracyBadge/its `percent` prop: that's computed from live
  // calibration-engine solver state in CriteriaCalibrationPage, not something to replay here — see
  // criteria-calibration-degree-tiers-and-progress.md's "What NOT to change", and
  // aoty-contenders-implementation.md's banner-revision section.
  const banner =
    !gateLoading && calibrationTier === 'none' ? <TierNoneBanner from={screen} /> : null;

  const yearSelect = <YearScopeSelect options={options} value={scope} onChange={setYear} />;
  const addFromFavorites = (
    <Button {...secondaryButton} variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
      + Add from Favorites
    </Button>
  );

  const dialogs = showContenders && (
    <>
      {dateTarget && (
        <ReleaseDateDialog
          key={dateTarget.albumId}
          open={dateOpen}
          onOpenChange={setDateOpen}
          albumLabel={`${dateTarget.band} – ${dateTarget.album}`}
          saving={pending.has(dateTarget.albumId)}
          readiness={
            !known || latched?.albumId !== dateTarget.albumId
              ? 'unknown'
              : latched.ready
                ? 'ready'
                : 'not-ready'
          }
          finalFocusEl={() => findRowControl(dateTarget.albumId)}
          onExitComplete={() => {
            const exit = dateExitFocus.current;
            dateExitFocus.current = null;
            if (exit) focusRowOrHeading(exit.nextId, activeTab());
          }}
          onSave={(value) => {
            if (!known || latched?.albumId !== dateTarget.albumId) return;
            handleSaveReleaseDate(dateTarget, value, latched.ready);
          }}
        />
      )}

      <AddToContendersPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        contenderAlbumIds={contenderAlbumIds}
        onAdded={handleAdded}
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
    </>
  );

  // Tab labels carry the scoped counts; no number while a list is still loading or failed.
  const aotyCount = loading || aotyError ? null : aotyRows.length;
  const contendersCount = loading || contendersError ? null : scopedItems.length;
  const tabLabel = (name: string, count: number | null) =>
    count === null ? name : `${name} ${count}`;

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />

          {banner}

          {/* The tab bar sits directly on the panel (the outline variant's active tab joins the
              panel's top border), so nothing may render between them, as on the calibration page. */}
          <Box>
            <Heading as="h2" srOnly>
              {screen === 'aoty' ? 'AOTY' : 'Contenders'}
            </Heading>
            <Tabs.Root
              variant="outline"
              size="lg"
              value={screen}
              onValueChange={({ value }) => setView(value as HubScreen)}
            >
              <Flex align="flex-end" justify="space-between" gap={4} wrap="nowrap">
                <Tabs.List ref={tablistRef} aria-label="AOTY sections">
                  <Tabs.Trigger value="aoty">{tabLabel('AOTY', aotyCount)}</Tabs.Trigger>
                  <Tabs.Trigger value="contenders">
                    {tabLabel('Contenders', contendersCount)}
                  </Tabs.Trigger>
                </Tabs.List>
                <Box pb={2}>{yearSelect}</Box>
              </Flex>
              {/* Only the active tab's content is mounted. Below md the frame keeps just its top
                  border and no side padding: a framed panel would leave a 299px row at 375px, too
                  narrow for the row's footer to stay on one line (343px fits). */}
              <Tabs.Content
                value={screen}
                bg="surface.tabPanel"
                borderStyle="solid"
                borderColor="border.ruleStrong"
                borderWidth={{ base: '2px 0 0', md: '2px' }}
                borderRadius="none"
                px={{ base: 0, md: 8 }}
                pt={{ base: 4, md: 8 }}
                pb={{ base: 4, md: 8 }}
                minH={{ base: 'auto', md: '640px' }}
              >
                {screen === 'aoty' ? (
                  aotyBody()
                ) : (
                  <VStack gap={3} align="stretch">
                    <Flex justify="flex-end">{addFromFavorites}</Flex>
                    {bulkBar}
                    {contendersBody()}
                  </VStack>
                )}
              </Tabs.Content>
            </Tabs.Root>
          </Box>

          <Footer />
        </VStack>
      </Container>
      {dialogs}
    </Box>
  );
}
