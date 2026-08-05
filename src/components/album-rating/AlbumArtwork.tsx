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
  // "auto" fills the parent's width and holds a 1:1 aspect ratio instead of a fixed px square —
  // used by DesktopRatingLayout's Tier 2 (768-1023px) row, where Section 1's width itself is
  // fluid (shared grid track with Section 3), so a fixed px size would either overflow or leave
  // a gap depending on viewport width.
  size: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const isAuto = size === 'auto';
  const boxSize = isAuto ? { w: '100%', h: 'auto', aspectRatio: '1' } : { w: size, h: size };
  return (
    <Box flexShrink={0} {...boxSize} borderRadius="base" overflow="hidden" bg="surface.darkest">
      {artworkUrl && !imgFailed ? (
        <Image
          src={toThumbnailUrl(artworkUrl, 500)}
          alt={`${band} – ${album}`}
          w="100%"
          h="100%"
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
