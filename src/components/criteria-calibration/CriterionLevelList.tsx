import { Fragment } from 'react';
import { VStack, Separator } from '@chakra-ui/react';
import { CriterionRow, type CriterionData } from './CriterionRow';

interface CriterionLevelListProps {
  criteria: CriterionData[];
}

// 1-6 CriterionRows per card (spec), separated by a thin rule rather than gaps
// alone — keeps rows legible when a card has all 6.
export function CriterionLevelList({ criteria }: CriterionLevelListProps) {
  return (
    <VStack gap={4} align="stretch">
      {criteria.map((criterion, i) => (
        <Fragment key={criterion.label}>
          {i > 0 && <Separator borderColor="border.rule" />}
          <CriterionRow criterion={criterion} />
        </Fragment>
      ))}
    </VStack>
  );
}
