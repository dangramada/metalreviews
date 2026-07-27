import type { ReactNode } from 'react';
import { Badge } from '@chakra-ui/react';
import { genreBadge } from '../../theme';

interface CriterionBadgeProps {
  children: ReactNode;
  selected?: boolean;
}

// Reuses the existing genreBadge visual convention (bordered, small, contained)
// for the criterion name, instead of plain mono text. When the parent OptionCard
// is selected (accent.border bg), the badge's own border/text switch to
// accent.ink so it stays legible against the now-ember background — same
// convention, just recolored for contrast, not a new badge style.
export function CriterionBadge({ children, selected }: CriterionBadgeProps) {
  return (
    <Badge
      {...genreBadge}
      borderColor={selected ? 'accent.ink' : genreBadge.borderColor}
      color={selected ? 'accent.ink' : genreBadge.color}
    >
      {children}
    </Badge>
  );
}
