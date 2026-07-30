import { Flex } from '@chakra-ui/react';
import { OptionCard } from './OptionCard';
import { VsDivider } from './VsDivider';
import type { CriterionData } from './CriterionRow';

interface ComparisonRowProps {
  leftCriteria: CriterionData[];
  rightCriteria: CriterionData[];
  selectedSide: 'left' | 'right' | null;
  interactionDisabled: boolean;
  onSelectLeft: () => void;
  onSelectRight: () => void;
  visible: boolean;
  reducedMotion: boolean;
  fadeMs: number;
}

// Owns the opacity-only, linear fade between card pairs — deliberately abrupt/
// geometric (no ease, no slide/scale), matching the product's brutalist visual
// language. Under prefers-reduced-motion the transition is disabled entirely
// (instant swap), per the established _motionReduce-equivalent pattern.
export function ComparisonRow({
  leftCriteria,
  rightCriteria,
  selectedSide,
  interactionDisabled,
  onSelectLeft,
  onSelectRight,
  visible,
  reducedMotion,
  fadeMs,
}: ComparisonRowProps) {
  return (
    <Flex
      align="stretch"
      gap={4}
      direction={{ base: 'column', md: 'row' }}
      style={{
        opacity: visible ? 1 : 0,
        transition: reducedMotion ? 'none' : `opacity ${fadeMs}ms linear`,
      }}
    >
      <OptionCard
        criteria={leftCriteria}
        selected={selectedSide === 'left'}
        disabled={interactionDisabled}
        onSelect={onSelectLeft}
      />
      <VsDivider />
      <OptionCard
        criteria={rightCriteria}
        selected={selectedSide === 'right'}
        disabled={interactionDisabled}
        onSelect={onSelectRight}
      />
    </Flex>
  );
}
