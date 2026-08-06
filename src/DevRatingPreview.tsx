// TEMPORARY dev-only harness — remove before merging.
import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { DesktopRatingLayout } from './components/album-rating/DesktopRatingLayout';
import { FIXED_CRITERION_ORDER } from './lib/album-rating/criterionOrder';
import type { CriteriaCatalog } from './lib/criteria-calibration/criteriaCatalog';

const mockCatalog: CriteriaCatalog = {
  entries: [
    { index: 0, name: 'Innovation', levels: { 1: { label: 'Uninspired', description: 'x' }, 2: { label: 'Familiar', description: 'x' }, 3: { label: 'Some fresh ideas', description: 'x' }, 4: { label: 'Bold', description: 'x' }, 5: { label: 'Groundbreaking', description: 'x' } } },
    { index: 1, name: 'Emotional impact', levels: { 1: { label: 'Flat', description: 'x' }, 2: { label: 'Nice', description: 'x' }, 3: { label: 'Engaging', description: 'x' }, 4: { label: 'Powerful', description: 'x' }, 5: { label: 'Unforgettable', description: 'x' } } },
    { index: 2, name: 'Performance', levels: { 1: { label: 'Rough', description: 'x' }, 2: { label: 'Below Average', description: 'x' }, 3: { label: 'Average', description: 'x' }, 4: { label: 'Strong', description: 'x' }, 5: { label: 'Exceptional', description: 'x' } } },
    { index: 3, name: 'Coherence', levels: { 1: { label: 'Disjointed', description: 'x' }, 2: { label: 'Loose', description: 'x' }, 3: { label: 'Average', description: 'x' }, 4: { label: 'Strong', description: 'x' }, 5: { label: 'Unified', description: 'x' } } },
    { index: 4, name: 'Production', levels: { 1: { label: 'Weak', description: 'x' }, 2: { label: 'Below Average', description: 'x' }, 3: { label: 'Average', description: 'x' }, 4: { label: 'Strong', description: 'x' }, 5: { label: 'Exceptional', description: 'x' } } },
    { index: 5, name: 'Songwriting', levels: { 1: { label: 'Weak', description: 'x' }, 2: { label: 'Below Average', description: 'x' }, 3: { label: 'Average', description: 'x' }, 4: { label: 'Strong', description: 'x' }, 5: { label: 'Exceptional', description: 'x' } } },
  ],
  levelsPerCriterion: [5, 5, 5, 5, 5, 5],
};

export function DevRatingPreview() {
  const [selectedCriterionId, setSelectedCriterionId] = useState(FIXED_CRITERION_ORDER[0]);
  const [ratings, setRatings] = useState<Map<number, number>>(new Map([[0, 4], [1, 3], [2, 5], [3, 2]]));

  return (
    <Box bg="surface.page" minH="100vh" p="24px">
      <DesktopRatingLayout
        artworkUrl={null}
        band="Opeth"
        album="Blackwater Park"
        releaseDate="2001-03-25"
        genre={['Progressive Metal', 'Death Metal']}
        catalog={mockCatalog}
        order={FIXED_CRITERION_ORDER}
        ratings={ratings}
        weights={[]}
        selectedCriterionId={selectedCriterionId}
        onSelectCriterion={setSelectedCriterionId}
        onPick={(criterionId, level) => setRatings((prev) => new Map(prev).set(criterionId, level))}
        savingCriterionId={null}
        ratingSummary={{ rank: 3, score: 0.72 } as any}
      />
    </Box>
  );
}
