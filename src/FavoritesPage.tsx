import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Container,
  DatePickerContent,
  DatePickerDayTable,
  DatePickerHeader,
  DatePickerMonthTable,
  DatePickerNextTrigger,
  DatePickerPrevTrigger,
  DatePickerRangeText,
  DatePickerRoot,
  DatePickerTrigger,
  DatePickerView,
  DatePickerViewTrigger,
  DatePickerYearTable,
  Flex,
  Heading,
  Icon,
  IconButton,
  Image,
  Input,
  InputGroup,
  NativeSelect,
  Text,
  VStack,
  Wrap,
  WrapItem,
  parseDate,
} from '@chakra-ui/react';
import { CloseButton } from './components/ui/close-button';
import {
  DrawerRoot,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from './components/ui/drawer';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from './components/ui/dialog';
import { Field } from './components/ui/field';
import { FaSlidersH, FaTrash } from 'react-icons/fa';
import { LuCalendar, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { Header } from './Header';
import { Footer } from './Footer';
import { LoadingIndicator, LoadingIndicatorBars } from './LoadingIndicator';
import { useFavoritesList } from './hooks/useFavoritesList';
import type { FavoriteListItem } from './hooks/useFavoritesList';
import { useCalibrationGate } from './hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from './hooks/useAlbumRatingsSummary';
import type { AlbumRatingSummary } from './hooks/useAlbumRatingsSummary';
import { AlbumRatingDrawer } from './components/album-rating/AlbumRatingDrawer';
import { formatReleaseDate, getReleaseYear, toThumbnailUrl } from './App';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { genreBadge, primaryButton, rankBadge, secondaryButton } from './theme';
import { computeNormKey } from '../scripts/normalizeKey';
import { useNavigate } from 'react-router-dom';

// ─── Shared list-item row ─────────────────────────────────────────────────────
// Used in both the favorites list and the AddAlbumDrawer preview.

export function FavoriteListItemRow({
  item,
  onRemove,
  removing = false,
  ratingSummary,
  onRate,
}: {
  item: FavoriteListItem;
  onRemove?: () => void;
  removing?: boolean;
  // Present only when this album is fully rated (all 6 criteria) — see
  // useAlbumRatingsSummary. Undefined for previews (AddAlbumDrawer) and unrated albums.
  ratingSummary?: AlbumRatingSummary;
  // Opens the rating drawer (behind the calibration gate) for this item. Omitted in the
  // AddAlbumDrawer preview context, where rating doesn't apply yet.
  onRate?: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <Flex
      align="center"
      gap={4}
      bg="surface.card"
      borderRadius="lg"
      p={3}
      border="2px solid"
      borderColor="border.ruleStrong"
      // Same border-width/hover language as the reviews-grid card (pass 9), but this row
      // has no score to link the hover colour to — see docs/decisions/slant-take-design-system.md's
      // pass 9 entry: favorites items carry no score data by design (useFavoritesList.ts),
      // so the hover here is a plain colour change, not the score-conditional bone/ember split.
      _hover={{ borderColor: 'border.hover' }}
      css={{ '&:hover img': { transform: 'scale(1.06)' } }}
    >
      <Box
        flexShrink={0}
        w="96px"
        h="96px"
        borderRadius="base"
        overflow="hidden"
        bg="surface.darkest"
      >
        {item.artworkUrl && !imgFailed ? (
          <Image
            src={toThumbnailUrl(item.artworkUrl, 250)}
            alt={`${item.band} – ${item.album}`}
            w="96px"
            h="96px"
            objectFit="cover"
            transition="transform 0.3s"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Flex w="100%" h="100%" align="center" justify="center">
            <Text fontSize="lg" color="text.muted">
              ♪
            </Text>
          </Flex>
        )}
      </Box>

      <Box flex={1} minW={0}>
        <Text fontWeight="semibold" lineClamp={1}>
          {item.band} – {item.album}
        </Text>
        <Text fontSize="sm" color="text.dim">
          {formatReleaseDate(item.releaseDate)}
        </Text>
        {(item.genre.length > 0 || ratingSummary) && (
          <Wrap gap={1} mt={1}>
            {ratingSummary && (
              <WrapItem>
                <Badge {...rankBadge}>#{ratingSummary.rank}</Badge>
              </WrapItem>
            )}
            {item.genre.map((g) => (
              <WrapItem key={g}>
                <Badge {...genreBadge}>{g}</Badge>
              </WrapItem>
            ))}
          </Wrap>
        )}
      </Box>

      {onRate && (
        <IconButton
          aria-label={ratingSummary ? 'Edit rating' : 'Rate this album'}
          size="sm"
          variant="ghost"
          color="text.muted"
          _hover={{ color: 'accent.text', bg: 'whiteAlpha.100' }}
          onClick={onRate}
          flexShrink={0}
        >
          <Icon as={FaSlidersH} />
        </IconButton>
      )}

      {onRemove && (
        <IconButton
          aria-label={removing ? 'Loading' : 'Remove from favorites'}
          size="sm"
          variant="ghost"
          color="text.muted"
          _hover={{ color: 'red.400', bg: 'whiteAlpha.100' }}
          loading={removing}
          spinner={<LoadingIndicatorBars />}
          onClick={onRemove}
          flexShrink={0}
        >
          <Icon as={FaTrash} />
        </IconButton>
      )}
    </Flex>
  );
}

// Capitalises the first letter of each word; leaves subsequent letters as typed
// so abbreviations like "AC/DC" survive. Handles leading/trailing whitespace
// and collapses repeated internal spaces.
function toTitleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ─── Draft persistence helpers ────────────────────────────────────────────────
// Scoped per-user to avoid cross-account leakage in shared browsers.

function draftKey(userId: string) {
  return `manualAlbumDraft:${userId}`;
}
function saveDraft(userId: string, band: string, album: string) {
  if (!band && !album) {
    clearDraft(userId);
    return;
  }
  localStorage.setItem(draftKey(userId), JSON.stringify({ band, album }));
}
function loadDraft(userId: string): { band: string; album: string } | null {
  const raw = localStorage.getItem(draftKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { band: string; album: string };
  } catch {
    return null; // corrupted entry — treat as no draft
  }
}
function clearDraft(userId: string) {
  localStorage.removeItem(draftKey(userId));
}

// ─── Add Album Drawer ─────────────────────────────────────────────────────────

interface LookupResult {
  artworkUrl: string | null;
  genre: string[];
  releaseDate: string | null;
  releaseGroupId: string | null;
}

// An existing `albums` row found to already represent the looked-up band+album — either by
// MusicBrainz release-group id (checked first, matching resolveAlbumIdentity's dual-key order
// in scripts/ingest.ts) or by norm_key fallback. When set, Confirm favorites this album instead
// of creating a duplicate — see docs/decisions/album-identity-decisions.md §5 Layer 1.
interface AlbumMatch {
  albumId: string;
  band: string;
  album: string;
  artworkUrl: string | null;
  genre: string[];
  releaseDate: string | null;
}

type AlbumMatchRow = {
  id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  genre: string[] | null;
  release_date: string | null;
};

function toAlbumMatch(row: AlbumMatchRow): AlbumMatch {
  return {
    albumId: row.id,
    band: row.band,
    album: row.album,
    artworkUrl: row.artwork_url,
    genre: row.genre ?? [],
    releaseDate: row.release_date,
  };
}

// Checks for an existing album before a manual add is allowed to create a new row.
// Mirrors resolveAlbumIdentity's matching order (scripts/ingest.ts): mb_release_group_id
// first (the strong key — collapses editions/formats norm_key structurally can't), then
// norm_key as the fallback only when no release-group id matched.
// Exported for direct unit testing (see src/__tests__/findExistingAlbum.test.ts) — not part
// of the page's public API otherwise.
export async function findExistingAlbum(
  releaseGroupId: string | null,
  band: string,
  album: string
): Promise<AlbumMatch | null> {
  const ALBUM_MATCH_SELECT = 'id, band, album, artwork_url, genre, release_date';

  if (releaseGroupId) {
    const { data } = await supabase
      .from('albums')
      .select(ALBUM_MATCH_SELECT)
      .eq('mb_release_group_id', releaseGroupId)
      .maybeSingle();
    if (data) return toAlbumMatch(data as AlbumMatchRow);
  }

  const normKey = computeNormKey(band, album);
  const { data } = await supabase
    .from('albums')
    .select(ALBUM_MATCH_SELECT)
    .eq('norm_key', normKey)
    .maybeSingle();
  return data ? toAlbumMatch(data as AlbumMatchRow) : null;
}

interface AddAlbumDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedYear: number | 'all';
  // Called with the inserted album's release year so the parent can switch the filter
  onInsertSuccess: (year: number | null) => void;
  // Album ids the current user has already favorited (from useFavoritesList's live-loaded
  // items, which RLS already scopes to this user). Used to tell "album exists but isn't
  // favorited yet" apart from "album exists and is already favorited" when
  // findExistingAlbum() finds a match — see docs/decisions/album-identity-visibility-and-duplicate-fix.md.
  favoritedAlbumIds: Set<string>;
}

function AddAlbumDrawer({
  isOpen,
  onClose,
  selectedYear,
  onInsertSuccess,
  favoritedAlbumIds,
}: AddAlbumDrawerProps) {
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedbackToast();

  const [band, setBand] = useState('');
  const [album, setAlbum] = useState('');
  // Captured at lookup time so Confirm uses the values that were actually searched
  const [lookedUpBand, setLookedUpBand] = useState('');
  const [lookedUpAlbum, setLookedUpAlbum] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  // Set when the lookup matches an already-existing albums row (see findExistingAlbum).
  // Confirm favorites this album instead of inserting a new one.
  const [existingMatch, setExistingMatch] = useState<AlbumMatch | null>(null);
  // Shown only when MB returns no release date; lets the user supply one manually
  const [manualReleaseDate, setManualReleaseDate] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  // On open: restore draft if one exists; on close: reset non-draft state only.
  useEffect(() => {
    if (!isOpen) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (user) {
      const draft = loadDraft(user.id);
      if (draft) {
        setBand(draft.band);
        setAlbum(draft.album);
      } else {
        setBand('');
        setAlbum('');
      }
    }
    setLookedUpBand('');
    setLookedUpAlbum('');
    setLookupResult(null);
    setExistingMatch(null);
    setManualReleaseDate('');
    setPickerOpen(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, user]);

  // Persist band/album to localStorage whenever they change
  useEffect(() => {
    if (!user || !isOpen) return;
    saveDraft(user.id, band, album);
  }, [band, album, user, isOpen]);

  // Called by Cancel button and close icon — shows discard confirm when there's text.
  function handleRequestClose() {
    if (!band.trim() && !album.trim()) {
      onClose();
      return;
    }
    setShowDiscardConfirm(true);
  }

  function handleConfirmDiscard() {
    if (user) clearDraft(user.id);
    setShowDiscardConfirm(false);
    onClose();
  }

  function handleCancelDiscard() {
    setShowDiscardConfirm(false);
  }

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    setLookupLoading(true);
    setLookupResult(null);
    setExistingMatch(null);
    setManualReleaseDate('');
    setPickerOpen(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/manual-album-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ band: band.trim(), album: album.trim() }),
      });
      if (!res.ok) throw new Error(`Lookup returned ${res.status}`);
      const data = (await res.json()) as LookupResult;
      const titleCasedBand = toTitleCase(band);
      const titleCasedAlbum = toTitleCase(album);
      setLookedUpBand(titleCasedBand);
      setLookedUpAlbum(titleCasedAlbum);
      setLookupResult(data);
      const match = await findExistingAlbum(data.releaseGroupId, titleCasedBand, titleCasedAlbum);
      setExistingMatch(match);
    } catch (err) {
      console.warn('Manual album lookup failed', err);
      showError('Could not look up album — try again');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleConfirm() {
    if (!lookupResult || !user) return;

    // Album already exists AND this user has already favorited it — nothing to write.
    // Treat as a no-op rather than silently inserting a duplicate `favorites` row (there's
    // no unique constraint on (user_id, album_id) — see supabase/favorites-drop-review-id.sql).
    if (existingMatch && favoritedAlbumIds.has(existingMatch.albumId)) {
      showSuccess(`${existingMatch.band} – ${existingMatch.album} is already in your favorites`);
      clearDraft(user.id);
      onClose();
      return;
    }

    setSaving(true);

    let albumId: string;
    let finalReleaseDate: string | null;

    if (existingMatch) {
      // Album exists but this user hasn't favorited it yet — favorite the existing album,
      // don't create a duplicate `albums` row.
      albumId = existingMatch.albumId;
      finalReleaseDate = existingMatch.releaseDate;
    } else {
      // User-supplied date is used only if MB returned nothing
      finalReleaseDate = lookupResult.releaseDate ?? (manualReleaseDate.trim() || null);
      const { data: inserted, error: albumError } = await supabase
        .from('albums')
        .insert({
          band: lookedUpBand,
          album: lookedUpAlbum,
          mb_release_group_id: lookupResult.releaseGroupId,
          norm_key: computeNormKey(lookedUpBand, lookedUpAlbum),
          artwork_url: lookupResult.artworkUrl,
          genre: lookupResult.genre,
          release_date: finalReleaseDate,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (albumError || !inserted) {
        setSaving(false);
        showError('Could not save album — try again');
        return;
      }
      albumId = inserted.id;
    }

    const { error: favError } = await supabase
      .from('favorites')
      .insert({ user_id: user.id, album_id: albumId });
    setSaving(false);
    if (favError) {
      showError('Could not save album — try again');
      return;
    }
    showSuccess(`${lookedUpBand} – ${lookedUpAlbum} added to favorites`);
    if (user) clearDraft(user.id);
    // Pass the album's actual release year so the parent can switch the filter to show it
    onInsertSuccess(getReleaseYear(finalReleaseDate));
    onClose();
  }

  // Soft mismatch notice: only when a specific year is selected and the resolved year (existing
  // match's stored date, or a fresh MB lookup) differs from it.
  const lookupYear = existingMatch
    ? getReleaseYear(existingMatch.releaseDate)
    : lookupResult
      ? getReleaseYear(lookupResult.releaseDate)
      : null;
  const yearMismatch = selectedYear !== 'all' && lookupYear !== null && lookupYear !== selectedYear;

  // Preview item shape — mirrors FavoriteListItem so FavoriteListItemRow can render it directly.
  // When existingMatch is set, show the already-stored album's real data (its canonical
  // band/album/artwork may differ slightly from this fresh lookup) rather than the fresh lookup.
  const previewItem: FavoriteListItem | null = lookupResult
    ? existingMatch
      ? {
          albumId: existingMatch.albumId,
          band: existingMatch.band,
          album: existingMatch.album,
          artworkUrl: existingMatch.artworkUrl,
          releaseDate: existingMatch.releaseDate,
          genre: existingMatch.genre,
          publishedAt: null,
        }
      : {
          albumId: '__preview__',
          band: lookedUpBand,
          album: lookedUpAlbum,
          artworkUrl: lookupResult.artworkUrl,
          releaseDate: lookupResult.releaseDate ?? (manualReleaseDate.trim() || null),
          genre: lookupResult.genre,
          publishedAt: null,
        }
    : null;

  return (
    <>
      <DrawerRoot
        open={isOpen}
        onOpenChange={({ open }) => {
          if (!open) onClose();
        }}
        placement="end"
        size="md"
      >
        <DrawerContent>
          {/* Custom close button so we can gate it with the discard-confirm dialog.
            Overlay click and Esc use the Drawer's built-in onClose (no prompt needed
            — they don't discard the draft). */}
          <CloseButton
            position="absolute"
            right={2}
            top={2}
            color="text.primary"
            onClick={handleRequestClose}
          />
          <DrawerHeader>
            <DrawerTitle>Add album to favorites</DrawerTitle>
          </DrawerHeader>

          <DrawerBody>
            <form onSubmit={handleLookup}>
              <VStack gap={4} align="stretch">
                <Field required label="Band">
                  <Input
                    value={band}
                    onChange={(e) => setBand(e.target.value)}
                    placeholder="e.g. Opeth"
                    bg="surface.page"
                    border="2px solid"
                    borderColor="border.ruleStrong"
                  />
                </Field>
                <Field required label="Album">
                  <Input
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    placeholder="e.g. Blackwater Park"
                    bg="surface.page"
                    border="2px solid"
                    borderColor="border.ruleStrong"
                  />
                </Field>
                <Button
                  {...primaryButton}
                  type="submit"
                  loading={lookupLoading}
                  spinner={<LoadingIndicatorBars />}
                  aria-label={lookupLoading ? 'Loading' : undefined}
                  disabled={!band.trim() || !album.trim()}
                >
                  Look up
                </Button>
              </VStack>
            </form>

            {previewItem && (
              <Box mt={6}>
                <Text
                  fontWeight="semibold"
                  mb={3}
                  fontSize="sm"
                  color="text.dim"
                  textTransform="uppercase"
                  letterSpacing="wide"
                >
                  Preview
                </Text>

                <Box
                  border="1px solid"
                  borderColor="border.default"
                  borderRadius="lg"
                  p={4}
                  bg="gray.900"
                >
                  {existingMatch && favoritedAlbumIds.has(existingMatch.albumId) && (
                    <Box
                      mb={3}
                      p={3}
                      bg="blue.900"
                      borderRadius="md"
                      fontSize="sm"
                      color="blue.200"
                    >
                      Already in your favorites
                    </Box>
                  )}

                  {yearMismatch && (
                    <Box
                      mb={3}
                      p={3}
                      bg="orange.900"
                      borderRadius="md"
                      fontSize="sm"
                      color="orange.200"
                    >
                      Heads up — this looks like a {lookupYear} release; you&apos;re adding to{' '}
                      {selectedYear}.
                    </Box>
                  )}

                  <FavoriteListItemRow item={previewItem} />

                  {!existingMatch && lookupResult.releaseDate === null && (
                    <DatePickerRoot
                      size="xl"
                      mt={4}
                      open={pickerOpen}
                      onOpenChange={({ open }) => setPickerOpen(open)}
                      // Only seed the picker when the text field holds a valid full date
                      value={
                        /^\d{4}-\d{2}-\d{2}$/.test(manualReleaseDate)
                          ? [parseDate(manualReleaseDate)]
                          : []
                      }
                      onValueChange={(details) => {
                        const iso = details.value[0]?.toString();
                        if (iso) {
                          setManualReleaseDate(iso);
                          setPickerOpen(false);
                        }
                      }}
                    >
                      <Field
                        required
                        label="Release date"
                        helperText="MusicBrainz couldn't find one — please enter it yourself."
                      >
                        <InputGroup
                          width="full"
                          endElement={
                            <DatePickerTrigger
                              aria-label="Pick a date"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                color: 'inherit',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <LuCalendar />
                            </DatePickerTrigger>
                          }
                        >
                          <Input
                            value={manualReleaseDate}
                            onChange={(e) => setManualReleaseDate(e.target.value)}
                            placeholder="e.g. 2024, 2024-03, or 2024-03-15"
                            bg="surface.page"
                            border="2px solid"
                            borderColor="border.ruleStrong"
                          />
                        </InputGroup>
                      </Field>
                      {/* Inline calendar — no positioner; avoids Floating UI portal/coordinate issues inside a Drawer */}
                      <DatePickerContent mt={2}>
                        <DatePickerView view="day">
                          <DatePickerHeader>
                            <DatePickerPrevTrigger asChild>
                              <IconButton variant="ghost" size="sm" aria-label="Previous month">
                                <LuChevronLeft />
                              </IconButton>
                            </DatePickerPrevTrigger>
                            <DatePickerViewTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <DatePickerRangeText />
                              </Button>
                            </DatePickerViewTrigger>
                            <DatePickerNextTrigger asChild>
                              <IconButton variant="ghost" size="sm" aria-label="Next month">
                                <LuChevronRight />
                              </IconButton>
                            </DatePickerNextTrigger>
                          </DatePickerHeader>
                          <DatePickerDayTable />
                        </DatePickerView>
                        <DatePickerView view="month">
                          <DatePickerHeader>
                            <DatePickerPrevTrigger asChild>
                              <IconButton variant="ghost" size="sm" aria-label="Previous year">
                                <LuChevronLeft />
                              </IconButton>
                            </DatePickerPrevTrigger>
                            <DatePickerViewTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <DatePickerRangeText />
                              </Button>
                            </DatePickerViewTrigger>
                            <DatePickerNextTrigger asChild>
                              <IconButton variant="ghost" size="sm" aria-label="Next year">
                                <LuChevronRight />
                              </IconButton>
                            </DatePickerNextTrigger>
                          </DatePickerHeader>
                          <DatePickerMonthTable />
                        </DatePickerView>
                        <DatePickerView view="year">
                          <DatePickerHeader>
                            <DatePickerPrevTrigger asChild>
                              <IconButton variant="ghost" size="sm" aria-label="Previous decade">
                                <LuChevronLeft />
                              </IconButton>
                            </DatePickerPrevTrigger>
                            <DatePickerViewTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <DatePickerRangeText />
                              </Button>
                            </DatePickerViewTrigger>
                            <DatePickerNextTrigger asChild>
                              <IconButton variant="ghost" size="sm" aria-label="Next decade">
                                <LuChevronRight />
                              </IconButton>
                            </DatePickerNextTrigger>
                          </DatePickerHeader>
                          <DatePickerYearTable />
                        </DatePickerView>
                      </DatePickerContent>
                    </DatePickerRoot>
                  )}
                </Box>
              </Box>
            )}
          </DrawerBody>

          {previewItem && (
            <DrawerFooter borderTopWidth="1px" borderColor="border.default" gap={3}>
              <Button {...secondaryButton} variant="outline" onClick={handleRequestClose}>
                Cancel
              </Button>
              <Button
                {...primaryButton}
                loading={saving}
                spinner={<LoadingIndicatorBars />}
                aria-label={saving ? 'Loading' : undefined}
                disabled={
                  !existingMatch && lookupResult?.releaseDate === null && !manualReleaseDate.trim()
                }
                onClick={handleConfirm}
              >
                Confirm
              </Button>
            </DrawerFooter>
          )}
        </DrawerContent>
      </DrawerRoot>

      <DialogRoot
        open={showDiscardConfirm}
        onOpenChange={({ open }) => {
          if (!open) handleCancelDiscard();
        }}
        role="alertdialog"
        initialFocusEl={() => keepEditingRef.current}
      >
        <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
          <DialogHeader>
            <DialogTitle fontWeight="semibold">Discard this album?</DialogTitle>
          </DialogHeader>
          <DialogBody>Your band and album name will be lost.</DialogBody>
          <DialogFooter gap={3}>
            <Button
              {...secondaryButton}
              variant="solid"
              ref={keepEditingRef}
              onClick={handleCancelDiscard}
            >
              Keep editing
            </Button>
            <Button colorPalette="red" onClick={handleConfirmDiscard}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

// ─── FavoritesPage ────────────────────────────────────────────────────────────

export function FavoritesPage() {
  const { items, loading, error, refetch } = useFavoritesList();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedbackToast();
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Criteria Calibration part 6: gate + rating drawer + score/rank display.
  const { passed: gatePassed, loading: gateLoading } = useCalibrationGate();
  const { summary: ratingSummary, refetch: refetchRatingSummary } = useAlbumRatingsSummary();
  const [ratingItem, setRatingItem] = useState<FavoriteListItem | null>(null);
  const [gateBlockedOpen, setGateBlockedOpen] = useState(false);

  function handleRate(item: FavoriteListItem) {
    if (gateLoading) return;
    if (!gatePassed) {
      setGateBlockedOpen(true);
      return;
    }
    setRatingItem(item);
  }

  async function handleRemove(item: FavoriteListItem) {
    if (removingId || !user) return;
    setRemovingId(item.albumId);

    // Only the favorites row is deleted — the underlying albums row (reviewed or
    // manually-added) is never removed by unfavoriting it.
    const { error: deleteError } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('album_id', item.albumId);

    setRemovingId(null);

    if (deleteError) {
      showError('Could not remove — try again');
      return;
    }
    showSuccess(`${item.band} – ${item.album} removed from favorites`);
    refetch();
  }

  // Album ids this user has already favorited — passed to AddAlbumDrawer so it can tell
  // "album exists but not yet favorited" apart from "album exists and already favorited".
  const favoritedAlbumIds = useMemo(() => new Set(items.map((item) => item.albumId)), [items]);

  // Distinct years derived from items (review items fall back to publishedAt when releaseDate is null)
  const distinctYears = useMemo(() => {
    const years = new Set<number>();
    items.forEach((item) => {
      const y = getReleaseYear(item.releaseDate ?? item.publishedAt);
      if (y !== null) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [items]);

  // Items filtered to the selected year; "All years" shows everything
  const filteredItems = useMemo(() => {
    if (selectedYear === 'all') return items;
    return items.filter((item) => {
      const y = getReleaseYear(item.releaseDate ?? item.publishedAt);
      return y === selectedYear;
    });
  }, [items, selectedYear]);

  // Always include the current calendar year in the dropdown even if no items exist for it yet
  const currentYear = new Date().getFullYear();
  const yearOptions = distinctYears.includes(currentYear)
    ? distinctYears
    : [currentYear, ...distinctYears];

  return (
    <Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
      <Container maxW="container.xl">
        <VStack gap={6} align="stretch">
          <Header />

          {/* Controls row: heading + year dropdown (left) | Add album button (right) */}
          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Flex align="center" gap={3}>
              <Heading as="h2" size="xl">
                My Favorites
              </Heading>
              <NativeSelect.Root size="sm" w="auto" minW="120px">
                <NativeSelect.Field
                  bg="surface.card"
                  border="2px solid"
                  borderColor="border.ruleStrong"
                  css={{ '& option': { background: 'gray.800' } }}
                  value={selectedYear}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedYear(v === 'all' ? 'all' : parseInt(v, 10));
                  }}
                >
                  <option value="all">All years</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </NativeSelect.Field>
              </NativeSelect.Root>
            </Flex>
            <Button
              {...secondaryButton}
              variant="outline"
              size="sm"
              onClick={() => setDrawerOpen(true)}
            >
              + Add album
            </Button>
          </Flex>

          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <LoadingIndicator />
            </Flex>
          ) : error ? (
            <Text textAlign="center" color="red.400">
              Failed to load favorites. Please try again later.
            </Text>
          ) : filteredItems.length === 0 ? (
            <Text textAlign="center" color="text.muted">
              {selectedYear === 'all'
                ? 'No favorites yet. Heart an album from the dashboard to add it here.'
                : `No favorites for ${selectedYear} yet.`}
            </Text>
          ) : (
            <VStack gap={3} align="stretch">
              {filteredItems.map((item) => (
                <FavoriteListItemRow
                  key={item.albumId}
                  item={item}
                  onRemove={() => handleRemove(item)}
                  removing={removingId === item.albumId}
                  ratingSummary={ratingSummary.get(item.albumId)}
                  onRate={() => handleRate(item)}
                />
              ))}
            </VStack>
          )}

          <Footer />
        </VStack>
      </Container>

      <AddAlbumDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selectedYear={selectedYear}
        onInsertSuccess={(year) => {
          refetch();
          // Switch the year filter so the newly added item is immediately visible
          if (year !== null) setSelectedYear(year);
        }}
        favoritedAlbumIds={favoritedAlbumIds}
      />

      {ratingItem && (
        <AlbumRatingDrawer
          isOpen={!!ratingItem}
          onClose={() => setRatingItem(null)}
          albumId={ratingItem.albumId}
          band={ratingItem.band}
          album={ratingItem.album}
          ratingSummary={ratingSummary.get(ratingItem.albumId)}
          onRatingChange={refetchRatingSummary}
        />
      )}

      <DialogRoot open={gateBlockedOpen} onOpenChange={({ open }) => setGateBlockedOpen(open)}>
        <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
          <DialogHeader>
            <DialogTitle fontWeight="semibold">Calibrate your criteria first</DialogTitle>
          </DialogHeader>
          <DialogBody>
            Rating albums uses your personal criteria weights, which aren&apos;t set up yet. Answer
            a few comparison questions to get started.
          </DialogBody>
          <DialogFooter gap={3}>
            <Button {...secondaryButton} variant="solid" onClick={() => setGateBlockedOpen(false)}>
              Not now
            </Button>
            <Button
              {...primaryButton}
              onClick={() => {
                setGateBlockedOpen(false);
                navigate('/criteria-calibration');
              }}
            >
              Go to calibration
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Box>
  );
}
