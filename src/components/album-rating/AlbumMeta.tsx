// Release date + genre badges, extracted from the review card's inline markup in App.tsx so
// both the review card and AlbumRatingPage render this identically. Pure display refactor —
// same formatReleaseDate/genreBadge, same structure, no visual change at the original call site.
import { Text, Wrap, WrapItem, Badge } from '@chakra-ui/react';
import { formatReleaseDate } from '../../App';
import { genreBadge } from '../../theme';

export function AlbumMeta({ releaseDate, genre }: { releaseDate: string | null; genre: string[] }) {
  return (
    <>
      <Text
        fontFamily="mono"
        fontSize="11px"
        letterSpacing="0.08em"
        textTransform="uppercase"
        color="text.muted"
        mb={1}
      >
        Release date: {formatReleaseDate(releaseDate)}
      </Text>
      {genre.length > 0 && (
        <Wrap gap={1} mb={2}>
          {genre.map((g) => (
            <WrapItem key={g}>
              <Badge {...genreBadge}>{g}</Badge>
            </WrapItem>
          ))}
        </Wrap>
      )}
    </>
  );
}
