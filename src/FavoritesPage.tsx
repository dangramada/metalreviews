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
  Spinner,
  Text,
  VStack,
  Wrap,
  WrapItem,
  parseDate,
} from '@chakra-ui/react';
import { CloseButton } from './components/ui/close-button';
import { DrawerRoot, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from './components/ui/drawer';
import { DialogRoot, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from './components/ui/dialog';
import { Field } from './components/ui/field';
import { FaTrash } from 'react-icons/fa';
import { LuCalendar, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { Header } from './Header';
import { useFavoritesList } from './hooks/useFavoritesList';
import type { FavoriteListItem } from './hooks/useFavoritesList';
import { formatReleaseDate, getReleaseYear, toThumbnailUrl } from './App';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';
import { genreBadge, primaryButton, secondaryButton } from './theme';

// ─── Shared list-item row ─────────────────────────────────────────────────────
// Used in both the favorites list and the AddAlbumDrawer preview.

export function FavoriteListItemRow({
  item,
  onRemove,
  removing = false,
}: {
  item: FavoriteListItem;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <Flex
      align="center"
      gap={4}
      bg="surface.card"
      borderRadius="lg"
      p={3}
      border="1px solid"
      borderColor="border.default"
    >
      <Box
        flexShrink={0}
        w="64px"
        h="64px"
        borderRadius="base"
        overflow="hidden"
        bg="surface.darkest"
      >
        {item.artworkUrl && !imgFailed ? (
          <Image
            src={toThumbnailUrl(item.artworkUrl, 250)}
            alt={`${item.band} – ${item.album}`}
            w="64px"
            h="64px"
            objectFit="cover"
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
        {item.genre.length > 0 && (
          <Wrap gap={1} mt={1}>
            {item.genre.map((g) => (
              <WrapItem key={g}>
                <Badge {...genreBadge}>
                  {g}
                </Badge>
              </WrapItem>
            ))}
          </Wrap>
        )}
      </Box>

      {onRemove && (
        <IconButton
          aria-label="Remove from favorites"
          size="sm"
          variant="ghost"
          color="text.muted"
          _hover={{ color: 'red.400', bg: 'whiteAlpha.100' }}
          loading={removing}
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
}

interface AddAlbumDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedYear: number | 'all';
  // Called with the inserted album's release year so the parent can switch the filter
  onInsertSuccess: (year: number | null) => void;
}

function AddAlbumDrawer({ isOpen, onClose, selectedYear, onInsertSuccess }: AddAlbumDrawerProps) {
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedbackToast();

  const [band, setBand] = useState('');
  const [album, setAlbum] = useState('');
  // Captured at lookup time so Confirm uses the values that were actually searched
  const [lookedUpBand, setLookedUpBand] = useState('');
  const [lookedUpAlbum, setLookedUpAlbum] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
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
    setManualReleaseDate(''); setPickerOpen(false);
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
    setManualReleaseDate(''); setPickerOpen(false);
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
      setLookedUpBand(toTitleCase(band));
      setLookedUpAlbum(toTitleCase(album));
      setLookupResult(data);
    } catch (err) {
      console.warn('Manual album lookup failed', err);
      showError('Could not look up album — try again');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleConfirm() {
    if (!lookupResult || !user) return;
    setSaving(true);
    // User-supplied date is used only if MB returned nothing
    const finalReleaseDate = lookupResult.releaseDate ?? (manualReleaseDate.trim() || null);
    const { error } = await supabase.from('manual_albums').insert({
      user_id: user.id,
      band: lookedUpBand,
      album: lookedUpAlbum,
      artwork_url: lookupResult.artworkUrl,
      genre: lookupResult.genre,
      release_date: finalReleaseDate,
    });
    setSaving(false);
    if (error) {
      showError('Could not save album — try again');
      return;
    }
    showSuccess(`${lookedUpBand} – ${lookedUpAlbum} added to favorites`);
    if (user) clearDraft(user.id);
    // Pass the album's actual release year so the parent can switch the filter to show it
    onInsertSuccess(getReleaseYear(finalReleaseDate));
    onClose();
  }

  // Soft mismatch notice: only when a specific year is selected and MB resolved a different year
  const lookupYear = lookupResult ? getReleaseYear(lookupResult.releaseDate) : null;
  const yearMismatch = selectedYear !== 'all' && lookupYear !== null && lookupYear !== selectedYear;

  // Preview item shape — mirrors FavoriteListItem so FavoriteListItemRow can render it directly
  const previewItem: FavoriteListItem | null = lookupResult
    ? {
        id: '__preview__',
        type: 'manual',
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
      <DrawerRoot open={isOpen} onOpenChange={({ open }) => { if (!open) onClose(); }} placement="end" size="md">
        <DrawerContent>
          {/* Custom close button so we can gate it with the discard-confirm dialog.
            Overlay click and Esc use the Drawer's built-in onClose (no prompt needed
            — they don't discard the draft). */}
          <CloseButton position="absolute" right={2} top={2} color="text.primary" onClick={handleRequestClose} />
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
                    borderColor="border.default"
                  />
                </Field>
                <Field required label="Album">
                  <Input
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    placeholder="e.g. Blackwater Park"
                    bg="surface.page"
                    borderColor="border.default"
                  />
                </Field>
                <Button
                  {...primaryButton}
                  type="submit"
                  loading={lookupLoading}
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

                  {lookupResult.releaseDate === null && (
                    <DatePickerRoot
                      size="xl"
                      mt={4}
                      open={pickerOpen}
                      onOpenChange={({ open }) => setPickerOpen(open)}
                      // Only seed the picker when the text field holds a valid full date
                      value={/^\d{4}-\d{2}-\d{2}$/.test(manualReleaseDate) ? [parseDate(manualReleaseDate)] : []}
                      onValueChange={(details) => {
                        const iso = details.value[0]?.toString();
                        if (iso) { setManualReleaseDate(iso); setPickerOpen(false); }
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
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'inherit', display: 'flex', alignItems: 'center' }}
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
                            borderColor="border.default"
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
              <Button
                {...secondaryButton}
                variant="outline"
                onClick={handleRequestClose}
              >
                Cancel
              </Button>
              <Button
                {...primaryButton}
                loading={saving}
                disabled={lookupResult?.releaseDate === null && !manualReleaseDate.trim()}
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
        onOpenChange={({ open }) => { if (!open) handleCancelDiscard(); }}
        role="alertdialog"
        initialFocusEl={() => keepEditingRef.current}
      >
        <DialogContent bg="surface.card" color="text.primary" borderColor="border.default">
          <DialogHeader>
            <DialogTitle fontWeight="semibold">Discard this album?</DialogTitle>
          </DialogHeader>
          <DialogBody>Your band and album name will be lost.</DialogBody>
          <DialogFooter gap={3}>
            <Button {...secondaryButton} variant="solid" ref={keepEditingRef} onClick={handleCancelDiscard}>
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
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(item: FavoriteListItem) {
    if (removingId || !user) return;
    setRemovingId(item.id);

    const { error: deleteError } =
      item.type === 'review'
        ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('review_id', item.id)
        : await supabase.from('manual_albums').delete().eq('id', item.id);

    setRemovingId(null);

    if (deleteError) {
      showError('Could not remove — try again');
      return;
    }
    showSuccess(`${item.band} – ${item.album} removed from favorites`);
    refetch();
  }

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
              <Heading as="h2" size="md">
                My Favorites
              </Heading>
              <NativeSelect.Root size="sm" w="auto" minW="120px">
                <NativeSelect.Field
                  bg="surface.card"
                  borderColor="border.default"
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
            <Button {...secondaryButton} variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
              + Add album
            </Button>
          </Flex>

          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner role="status" size="xl" color="accent.start" thickness="4px" speed="0.65s" />
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
                  key={item.id}
                  item={item}
                  onRemove={() => handleRemove(item)}
                  removing={removingId === item.id}
                />
              ))}
            </VStack>
          )}
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
      />
    </Box>
  );
}
