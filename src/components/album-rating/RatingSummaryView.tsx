// Extracted, unchanged in content, from the old AlbumRatingDrawer's confirmation view (see
// docs/decisions/album-rating-drawer.md) so both this page's dialog and any future entry
// point can render it without duplicating markup. The brief's DoD explicitly says not to
// touch this view's content — only where/how it's triggered from changes.
import { Flex, Text, VStack } from '@chakra-ui/react';
import type { useCriteriaCatalog } from '../../hooks/useCriteriaCatalog';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';

export function RatingSummaryView({
  catalog,
  ratings,
  ratingSummary,
}: {
  catalog: ReturnType<typeof useCriteriaCatalog>['catalog'];
  ratings: Map<number, number>;
  ratingSummary: AlbumRatingSummary | undefined;
}) {
  return (
    <VStack gap={4} align="stretch">
      {ratingSummary && (
        <Flex
          justify="space-between"
          bg="surface.card"
          p={4}
          border="2px solid"
          borderColor="border.ruleStrong"
        >
          <Text fontWeight="semibold">Score</Text>
          {/* Clamped to 100 — solver.ts's per-value point estimates are independently
              solved range midpoints (see LevelValue), so their sum isn't guaranteed to
              equal the claimed best-level normalization (verified live: one real account's
              level-5 values summed to 1.308, not 1). Ranking is unaffected since it only
              compares raw sums within a year, but the displayed percentage must not exceed
              100 — see docs/decisions/album-rating-drawer.md. */}
          <Text fontWeight="bold">{Math.min(100, Math.round(ratingSummary.score * 100))}%</Text>
        </Flex>
      )}
      {ratingSummary && (
        <Flex
          justify="space-between"
          bg="surface.card"
          p={4}
          border="2px solid"
          borderColor="border.ruleStrong"
        >
          <Text fontWeight="semibold">Rank (this year)</Text>
          <Text fontWeight="bold">#{ratingSummary.rank}</Text>
        </Flex>
      )}
      <VStack gap={2} align="stretch">
        {catalog?.entries.map((entry) => {
          const level = ratings.get(entry.index);
          const info = level !== undefined ? entry.levels[level] : undefined;
          return (
            <Flex key={entry.index} justify="space-between" fontSize="sm">
              <Text color="text.dim">{entry.name}</Text>
              <Text>
                {info ? (
                  <>
                    {level} — <Text as="span" textTransform="uppercase">{info.label}</Text>
                  </>
                ) : (
                  '—'
                )}
              </Text>
            </Flex>
          );
        })}
      </VStack>
    </VStack>
  );
}
