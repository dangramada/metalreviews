import { useMemo, useState } from 'react';
import { Box, Button, Flex, Text, VStack } from '@chakra-ui/react';
import { CloseButton } from './ui/close-button';
import { Checkbox } from './ui/checkbox';
import {
  DrawerRoot,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from './ui/drawer';
import { LoadingIndicator, LoadingIndicatorBars } from '../LoadingIndicator';
import { FavoriteListItemRow } from '../FavoritesPage';
import { useFavoritesList } from '../hooks/useFavoritesList';
import { useAuth } from '../AuthContext';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { supabase } from '../supabaseClient';
import { primaryButton, secondaryButton } from '../theme';

// The "bulk picker" flagged in docs/decisions/aoty-hub-population.md — distinct from
// AddAlbumDrawer (external MusicBrainz lookup/new-album insert): this only selects among the
// user's *existing* Favorites and writes `contenders` join rows, no album lookup at all.
//
// Rows always render via FavoriteListItemRow's previewMode (forces its mobile tree, no
// footer — same reason AddAlbumDrawer's own preview uses it: a Drawer is always narrower than
// the desktop breakpoint). Selection is this component's own checkbox, not
// FavoriteListItemRow's `selectable` prop — that prop drives ContendersPage's real desktop
// rows specifically; previewMode already forces the mobile tree here, where `selectable`
// would never render anyway.
interface AddToContendersPickerProps {
  isOpen: boolean;
  onClose: () => void;
  contenderAlbumIds: Set<string>;
  onAdded: () => void;
}

export function AddToContendersPicker({
  isOpen,
  onClose,
  contenderAlbumIds,
  onAdded,
}: AddToContendersPickerProps) {
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedbackToast();
  const { items: favoriteItems, loading } = useFavoritesList();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(
    () => favoriteItems.filter((item) => !contenderAlbumIds.has(item.albumId)),
    [favoriteItems, contenderAlbumIds]
  );

  // Reset selection on close (Cancel, backdrop dismiss, or a successful Add all route through
  // this) rather than in an effect keyed on isOpen — setState directly in an effect body is a
  // react-hooks/set-state-in-effect lint error, and there's no need for one: clearing on the
  // way out leaves the same empty state for the next time the drawer opens.
  function handleClose() {
    setSelected(new Set());
    onClose();
  }

  function toggle(albumId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(albumId);
      else next.delete(albumId);
      return next;
    });
  }

  async function handleAdd() {
    if (!user || selected.size === 0) return;
    setSaving(true);
    const rows = Array.from(selected).map((albumId) => ({ user_id: user.id, album_id: albumId }));
    const { error } = await supabase.from('contenders').insert(rows);
    setSaving(false);
    if (error) {
      showError('Could not add to Contenders — try again');
      return;
    }
    showSuccess(`Added ${selected.size} ${selected.size === 1 ? 'album' : 'albums'} to Contenders`);
    onAdded();
    handleClose();
  }

  return (
    <DrawerRoot
      open={isOpen}
      onOpenChange={({ open }) => {
        if (!open) handleClose();
      }}
      placement="end"
      size="md"
    >
      <DrawerContent>
        <CloseButton
          position="absolute"
          right={2}
          top={2}
          color="text.primary"
          onClick={handleClose}
        />
        <DrawerHeader>
          <DrawerTitle>Add from Favorites</DrawerTitle>
        </DrawerHeader>

        <DrawerBody>
          {loading ? (
            <Flex justify="center" py={8}>
              <LoadingIndicator />
            </Flex>
          ) : candidates.length === 0 ? (
            <Text color="text.muted">
              All your favorites are already in Contenders — or you don&apos;t have any yet.
            </Text>
          ) : (
            <VStack gap={3} align="stretch">
              {candidates.map((item) => (
                <Flex key={item.albumId} align="center" gap={3}>
                  <Checkbox
                    checked={selected.has(item.albumId)}
                    onCheckedChange={(details) => toggle(item.albumId, !!details.checked)}
                    // See FavoritesPage.tsx's identical checkbox usage for why this is
                    // inputProps, not a bare aria-label prop.
                    inputProps={{
                      'aria-label': `${selected.has(item.albumId) ? 'Deselect' : 'Select'} ${item.band} – ${item.album}`,
                    }}
                  />
                  <Box flex={1} minW={0}>
                    <FavoriteListItemRow item={item} previewMode />
                  </Box>
                </Flex>
              ))}
            </VStack>
          )}
        </DrawerBody>

        <DrawerFooter borderTopWidth="1px" borderColor="border.default" gap={3}>
          <Button {...secondaryButton} variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            {...primaryButton}
            loading={saving}
            spinner={<LoadingIndicatorBars />}
            aria-label={saving ? 'Loading' : undefined}
            disabled={selected.size === 0}
            onClick={handleAdd}
          >
            Add{selected.size > 0 ? ` ${selected.size}` : ''} to Contenders
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}
