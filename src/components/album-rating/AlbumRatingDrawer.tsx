import { useEffect, useState } from 'react';
import { Box, Button, Flex, Text, VStack } from '@chakra-ui/react';
import {
  DrawerRoot,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from '../ui/drawer';
import { RadioCardRoot, RadioCardItem } from '../ui/radio-card';
import { CloseButton } from '../ui/close-button';
import { LoadingIndicator } from '../../LoadingIndicator';
import { useAuth } from '../../AuthContext';
import { useCriteriaCatalog } from '../../hooks/useCriteriaCatalog';
import { supabase } from '../../supabaseClient';
import { useFeedbackToast } from '../../hooks/useFeedbackToast';
import { secondaryButton } from '../../theme';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';

const CRITERIA_COUNT = 6;

interface AlbumRatingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  albumId: string;
  band: string;
  album: string;
  // Looked up by the parent from the shared, page-level summary map — updates whenever any
  // album's rating changes (see useAlbumRatingsSummary's "lifted and shared" decision).
  ratingSummary: AlbumRatingSummary | undefined;
  // Fired after every successful per-criterion save (progressive save, not just on full
  // completion) so the parent can refetch the shared rank summary immediately.
  onRatingChange: () => void;
}

type RatingRow = { criterion_id: number; level: number };

// Direct level-picker per criterion — structurally different from the Calibration UI's
// pairwise ComparisonRow/OptionCard, so this is a new, simpler component rather than a reuse
// of those. See docs/decisions/album-rating-drawer.md, Part B.
export function AlbumRatingDrawer({
  isOpen,
  onClose,
  albumId,
  band,
  album,
  ratingSummary,
  onRatingChange,
}: AlbumRatingDrawerProps) {
  const { user } = useAuth();
  const { catalog, loading: catalogLoading } = useCriteriaCatalog();
  const { showError } = useFeedbackToast();

  // criterionId -> level. Progressive save: every entry here has already been persisted by
  // the time it lands in state (set after the upsert resolves), so closing the drawer never
  // loses a pick.
  const [ratings, setRatings] = useState<Map<number, number>>(new Map());
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [savingCriterionId, setSavingCriterionId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;

    async function loadExisting() {
      setRatingsLoading(true);
      const { data } = await supabase
        .from('album_criteria_ratings')
        .select('criterion_id, level')
        .eq('album_id', albumId);
      if (cancelled) return;
      const next = new Map<number, number>();
      for (const row of (data ?? []) as RatingRow[]) next.set(row.criterion_id, row.level);
      setRatings(next);
      setRatingsLoading(false);
    }

    loadExisting();

    return () => {
      cancelled = true;
    };
  }, [isOpen, user, albumId]);

  async function handlePick(criterionId: number, level: number) {
    if (!user) return;
    setSavingCriterionId(criterionId);
    const { error } = await supabase
      .from('album_criteria_ratings')
      .upsert(
        { user_id: user.id, album_id: albumId, criterion_id: criterionId, level },
        { onConflict: 'user_id,album_id,criterion_id' }
      );
    setSavingCriterionId(null);
    if (error) {
      showError('Could not save rating — try again');
      return;
    }
    setRatings((prev) => new Map(prev).set(criterionId, level));
    onRatingChange();
  }

  const isComplete = ratings.size === CRITERIA_COUNT;
  const loading = catalogLoading || ratingsLoading;

  return (
    <DrawerRoot
      open={isOpen}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      placement="end"
      size="md"
    >
      <DrawerContent>
        <CloseButton position="absolute" right={2} top={2} color="text.primary" onClick={onClose} />
        <DrawerHeader>
          <DrawerTitle>
            {band} – {album}
          </DrawerTitle>
        </DrawerHeader>

        <DrawerBody>
          {loading ? (
            <Flex justify="center" align="center" minH="200px">
              <LoadingIndicator />
            </Flex>
          ) : isComplete ? (
            <RatingSummaryView catalog={catalog} ratings={ratings} ratingSummary={ratingSummary} />
          ) : (
            <VStack gap={6} align="stretch">
              {catalog?.entries.map((entry) => (
                <Box key={entry.index}>
                  <Text fontWeight="semibold" mb={2}>
                    {entry.name}
                  </Text>
                  <RadioCardRoot
                    value={ratings.get(entry.index)?.toString() ?? null}
                    onValueChange={(details) => {
                      if (details.value) handlePick(entry.index, parseInt(details.value, 10));
                    }}
                    orientation="vertical"
                  >
                    <VStack gap={2} align="stretch">
                      {Object.entries(entry.levels)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([level, info]) => (
                          <RadioCardItem
                            key={level}
                            value={level}
                            label={`${level} — ${info.label}`}
                            description={info.description}
                            disabled={savingCriterionId !== null}
                          />
                        ))}
                    </VStack>
                  </RadioCardRoot>
                </Box>
              ))}
            </VStack>
          )}
        </DrawerBody>

        <DrawerFooter borderTopWidth="1px" borderColor="border.default" gap={3}>
          <Button {...secondaryButton} variant="outline" onClick={onClose}>
            Done
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}

function RatingSummaryView({
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
              <Text>{info ? `${level} — ${info.label}` : '—'}</Text>
            </Flex>
          );
        })}
      </VStack>
    </VStack>
  );
}
