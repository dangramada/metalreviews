// Same artwork display pattern used by FavoriteListItemRow (src/FavoritesPage.tsx) and the
// dashboard card (src/App.tsx) — fixed square, toThumbnailUrl, "♪" fallback glyph on error.
// Factored out here only to avoid duplicating the identical markup across the desktop and
// mobile rating layouts; not a new visual design.
import { useState } from 'react';
import { Box, Flex, Image, Text } from '@chakra-ui/react';
import { toThumbnailUrl } from '../../App';

export function AlbumArtwork({
  artworkUrl,
  band,
  album,
  size,
}: {
  artworkUrl: string | null;
  band: string;
  album: string;
  size: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <Box flexShrink={0} w={size} h={size} borderRadius="base" overflow="hidden" bg="surface.darkest">
      {artworkUrl && !imgFailed ? (
        <Image
          src={toThumbnailUrl(artworkUrl, 500)}
          alt={`${band} – ${album}`}
          w={size}
          h={size}
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
  );
}
