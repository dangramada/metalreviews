import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Icon,
  IconButton,
  Image,
  Input,
  Select,
  Spinner,
  Tag,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { FaTrash } from 'react-icons/fa';
import { Header } from './Header';
import { useFavoritesList } from './hooks/useFavoritesList';
import type { FavoriteListItem } from './hooks/useFavoritesList';
import { formatReleaseDate, getReleaseYear } from './App';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useFeedbackToast } from './hooks/useFeedbackToast';

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
        {item.artworkUrl ? (
          <Image
            src={item.artworkUrl}
            alt={`${item.band} – ${item.album}`}
            w="64px"
            h="64px"
            objectFit="cover"
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
        <Text fontWeight="semibold" noOfLines={1}>
          {item.band} – {item.album}
        </Text>
        <Text fontSize="sm" color="text.dim">
          {formatReleaseDate(item.releaseDate)}
        </Text>
        {item.genre.length > 0 && (
          <Wrap spacing={1} mt={1}>
            {item.genre.map((g) => (
              <WrapItem key={g}>
                <Tag size="sm" bg="whiteAlpha.100" color="purple.300" borderRadius="base">
                  {g}
                </Tag>
              </WrapItem>
            ))}
          </Wrap>
        )}
      </Box>

      {onRemove && (
        <IconButton
          aria-label="Remove from favorites"
          icon={<Icon as={FaTrash} />}
          size="sm"
          variant="ghost"
          color="text.muted"
          _hover={{ color: 'red.400', bg: 'whiteAlpha.100' }}
          isLoading={removing}
          onClick={onRemove}
          flexShrink={0}
        />
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
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset all state when the drawer is closed
  useEffect(() => {
    if (!isOpen) {
      setBand('');
      setAlbum('');
      setLookedUpBand('');
      setLookedUpAlbum('');
      setLookupResult(null);
      setManualReleaseDate('');
    }
  }, [isOpen]);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    setLookupLoading(true);
    setLookupResult(null);
    setManualReleaseDate('');
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
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="md">
      <DrawerOverlay />
      <DrawerContent bg="surface.card" color="text.primary">
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" borderColor="border.default">
          Add album to favorites
        </DrawerHeader>

        <DrawerBody>
          <form onSubmit={handleLookup}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>Band</FormLabel>
                <Input
                  value={band}
                  onChange={(e) => setBand(e.target.value)}
                  placeholder="e.g. Opeth"
                  bg="surface.page"
                  borderColor="border.default"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Album</FormLabel>
                <Input
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="e.g. Blackwater Park"
                  bg="surface.page"
                  borderColor="border.default"
                />
              </FormControl>
              <Button
                type="submit"
                isLoading={lookupLoading}
                isDisabled={!band.trim() || !album.trim()}
                colorScheme="purple"
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

              <Box border="1px solid" borderColor="border.default" borderRadius="lg" p={4} bg="gray.900">
                {yearMismatch && (
                  <Box mb={3} p={3} bg="orange.900" borderRadius="md" fontSize="sm" color="orange.200">
                    Heads up — this looks like a {lookupYear} release; you&apos;re adding to{' '}
                    {selectedYear}.
                  </Box>
                )}

                <FavoriteListItemRow item={previewItem} />

                {lookupResult.releaseDate === null && (
                  <FormControl mt={4} isRequired>
                    <FormLabel>Release date</FormLabel>
                    <Input
                      value={manualReleaseDate}
                      onChange={(e) => setManualReleaseDate(e.target.value)}
                      placeholder="e.g. 2024, 2024-03, or 2024-03-15"
                      bg="surface.page"
                      borderColor="border.default"
                    />
                    <FormHelperText color="text.muted">
                      MusicBrainz couldn&apos;t find one please enter it yourself.
                    </FormHelperText>
                  </FormControl>
                )}
              </Box>
            </Box>
          )}
        </DrawerBody>

        {previewItem && (
          <DrawerFooter borderTopWidth="1px" borderColor="border.default" gap={3}>
            <Button
              variant="outline"
              borderColor="border.default"
              color="text.primary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              isLoading={saving}
              isDisabled={lookupResult?.releaseDate === null && !manualReleaseDate.trim()}
              onClick={handleConfirm}
            >
              Confirm
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
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
        ? await supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('review_id', item.id)
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
        <VStack spacing={6} align="stretch">
          <Header />

          {/* Controls row: heading + year dropdown (left) | Add album button (right) */}
          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Flex align="center" gap={3}>
              <Heading as="h2" size="md">My Favorites</Heading>
              <Select
                size="sm"
                w="auto"
                minW="120px"
                bg="surface.card"
                borderColor="border.default"
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
              </Select>
            </Flex>
            <Button size="sm" colorScheme="purple" onClick={() => setDrawerOpen(true)}>
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
            <VStack spacing={3} align="stretch">
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
