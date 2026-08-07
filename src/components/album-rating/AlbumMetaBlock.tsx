// Title (band/album) + release date + genre tags, as one spacing-standardized unit.
// Supersedes the review card's title+AlbumMeta pair, DesktopRatingLayout's hand-duplicated
// markup, and both FavoriteListItemRow blocks' separate title+date/genre markup — see
// docs/decisions/design-system-audit-2026-08.md's Pass 4 for why those existed separately
// (AlbumMeta's own baked-in mb margins would double up with each surface's own spacing
// mechanism), and the Sub-pass B/C thread for the gap-based replacement.
//
// AlbumMeta.tsx is now unused (this component absorbs its rendering, reusing the same
// formatReleaseDate/genreBadge building blocks rather than calling it — its internal mb
// margins are exactly the conflict this component exists to remove) and has been deleted.
import { Badge, Box, Heading, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { formatReleaseDate } from '../../App';
import { genreBadge, cardTitleBand, cardTitleAlbum } from '../../theme';

interface AlbumMetaBlockProps {
  band: string;
  album: string;
  releaseDate: string | null;
  genre: string[];
  // No default — every call site states its own, so a surface's title shape is never
  // picked silently. 'inline' is FavoriteListItemRow desktop's single-line "band – album"
  // treatment (a deliberate density choice, not something this component should default to).
  titleLayout: 'stacked' | 'inline';
  // `top`/`bottom` override `y` independently (e.g. the review card keeps the default
  // space.5 top but tightens bottom to space.3) — both fall back to `y`, which falls back
  // to space.5. Values are Chakra's own spacing scale (numbers) rather than literal px
  // strings — this is the only place in the design system that used to invent its own px
  // values outside that scale; see design-system-audit-2026-08.md.
  padding?: { x?: string | number; y?: string | number; top?: string | number; bottom?: string | number };
  titleToDateGap?: string | number;
  dateToGenreGap?: string | number;
}

export function AlbumMetaBlock({
  band,
  album,
  releaseDate,
  genre,
  titleLayout,
  padding,
  titleToDateGap = 3,
  dateToGenreGap = 2,
}: AlbumMetaBlockProps) {
  const px = padding?.x ?? 4;
  const pt = padding?.top ?? padding?.y ?? 5;
  const pb = padding?.bottom ?? padding?.y ?? 5;

  return (
    <VStack align="stretch" gap={0} px={px} pt={pt} pb={pb}>
      {titleLayout === 'stacked' ? (
        <Box>
          <Heading as="h3" {...cardTitleBand} lineHeight="1.1">
            {band}
          </Heading>
          <Text {...cardTitleAlbum} color="text.primary">
            {album}
          </Text>
        </Box>
      ) : (
        <Text lineClamp={1}>
          <Text as="span" {...cardTitleBand}>
            {band}
          </Text>{' '}
          <Text as="span" {...cardTitleAlbum} color="text.primary">
            – {album}
          </Text>
        </Text>
      )}
      <Text
        fontFamily="mono"
        fontSize="11px"
        letterSpacing="0.08em"
        textTransform="uppercase"
        color="text.muted"
        mt={titleToDateGap}
      >
        Release date: {formatReleaseDate(releaseDate)}
      </Text>
      {genre.length > 0 && (
        <Wrap gap={1} mt={dateToGenreGap}>
          {genre.map((g) => (
            <WrapItem key={g}>
              <Badge {...genreBadge}>{g}</Badge>
            </WrapItem>
          ))}
        </Wrap>
      )}
    </VStack>
  );
}
