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
  // Suppresses only the genre-badges line — release date and title stay. Default false (no
  // change to any existing consumer). Added for MobileRatingLayout's compact album-info zone.
  hideGenres?: boolean;
  // `top`/`bottom` override `y` independently (e.g. the review card keeps the default
  // space.5 top but tightens bottom to space.3) — both fall back to `y`, which falls back
  // to space.5. Values are Chakra's own spacing scale (numbers) rather than literal px
  // strings — this is the only place in the design system that used to invent its own px
  // values outside that scale; see design-system-audit-2026-08.md.
  padding?: { x?: string | number; y?: string | number; top?: string | number; bottom?: string | number };
  titleToDateGap?: string | number;
  dateToGenreGap?: string | number;
  // Opt-in overrides only — undefined falls back to cardTitleBand/cardTitleAlbum's own
  // fontSize (theme.ts), so existing consumers that don't pass these are unaffected. Two flat
  // props rather than a grouped object (unlike `padding`'s {x,y,top,bottom}) since band/album
  // sizes are independent values with no shared spatial axis to justify nesting — matches
  // titleToDateGap/dateToGenreGap's flat-prop precedent instead.
  bandFontSize?: string;
  albumFontSize?: string;
  // Opt-in, default false — single-line band with ellipsis overflow. Added for
  // MobileRatingLayout's compact album-info zone (stacked layout only; the inline layout
  // already truncates its whole "band – album" line via the parent Text's lineClamp={1}).
  truncateBand?: boolean;
  // Opt-in, default undefined (no clamp) — multi-line album name clamped to this many lines
  // then ellipsis. Same stacked-layout-only scope as truncateBand.
  clampAlbumLines?: number;
  // Opt-in, default false — drops the "Release date: " prefix, showing only the formatted
  // date itself. Default false so every existing consumer keeps the labeled form.
  hideReleaseDateLabel?: boolean;
}

export function AlbumMetaBlock({
  band,
  album,
  releaseDate,
  genre,
  titleLayout,
  hideGenres = false,
  padding,
  titleToDateGap = 3,
  dateToGenreGap = 2,
  bandFontSize,
  albumFontSize,
  truncateBand = false,
  clampAlbumLines,
  hideReleaseDateLabel = false,
}: AlbumMetaBlockProps) {
  const px = padding?.x ?? 4;
  const pt = padding?.top ?? padding?.y ?? 5;
  const pb = padding?.bottom ?? padding?.y ?? 5;

  // Applied as an object (not a per-prop JSX attr) so an unset override never overwrites its
  // sibling value with `undefined` — `<Heading {...cardTitleBand} fontSize={undefined}>`
  // would otherwise blow away cardTitleBand's own fontSize, since a later explicit prop wins
  // over an earlier spread even when its value is undefined.
  const bandTruncateStyle = truncateBand
    ? { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }
    : {};
  // clampAlbumLines is passed straight to Chakra's own `lineClamp` prop below, not built as a
  // raw style object here — a first attempt hand-rolled `{display: '-webkit-box',
  // WebkitLineClamp, WebkitBoxOrient, overflow, textOverflow}` and spread it onto the `Text`,
  // but Chakra v3 only moves *recognized* style props into the emitted CSS; unrecognized
  // camelCase keys like `WebkitLineClamp` fall through as inert DOM attributes, so nothing
  // actually clamped. `lineClamp` is Chakra's own built-in for this (see the inline layout's
  // `lineClamp={1}` above) and produces the equivalent CSS itself, including wrapping (not
  // truncating to one line) before the ellipsis kicks in at the given line count.

  return (
    <VStack align="stretch" gap={0} px={px} pt={pt} pb={pb}>
      {titleLayout === 'stacked' ? (
        <Box>
          <Heading
            as="h3"
            {...cardTitleBand}
            // 1.4 is the component's default line-height (was 1.1) — see the dated stage-1
            // retouch entry in docs/decisions/album-rating-page.md for why: MobileRatingLayout
            // needed more breathing room for wrapped band names, and this is a global default
            // change (all three consumers re-verified), not a per-consumer override.
            lineHeight="1.4"
            fontSize={bandFontSize ?? cardTitleBand.fontSize}
            {...bandTruncateStyle}
          >
            {band}
          </Heading>
          <Text
            {...cardTitleAlbum}
            color="text.primary"
            fontSize={albumFontSize ?? cardTitleAlbum.fontSize}
            lineClamp={clampAlbumLines}
          >
            {album}
          </Text>
        </Box>
      ) : (
        <Text lineClamp={1}>
          <Text as="span" {...cardTitleBand} lineHeight="1.4" fontSize={bandFontSize ?? cardTitleBand.fontSize}>
            {band}
          </Text>{' '}
          <Text as="span" {...cardTitleAlbum} color="text.primary" fontSize={albumFontSize ?? cardTitleAlbum.fontSize}>
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
        {hideReleaseDateLabel ? formatReleaseDate(releaseDate) : `Release date: ${formatReleaseDate(releaseDate)}`}
      </Text>
      {!hideGenres && genre.length > 0 && (
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
