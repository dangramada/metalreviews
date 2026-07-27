import { RadioCard, Text } from '@chakra-ui/react';
import { CriterionLevelList } from './CriterionLevelList';
import type { CriterionData } from './CriterionRow';

interface TradeoffCardProps {
  value: string;
  title: string;
  criteria: CriterionData[];
}

// Card A / Card B. Built on the base RadioCard.Item primitive directly (not the
// label/description RadioCardItem convenience wrapper in ui/radio-card.tsx) because
// the content here is a full CriterionLevelList, not a single label+description pair.
// Zero-radius comes for free from the theme's zeroed radii tokens — no override needed.
export function TradeoffCard({ value, title, criteria }: TradeoffCardProps) {
  return (
    <RadioCard.Item value={value} flex="1">
      <RadioCard.ItemHiddenInput />
      <RadioCard.ItemControl
        flexDirection="column"
        alignItems="stretch"
        gap={4}
        p={6}
        bg="surface.card"
        borderColor="border.default"
        _checked={{ borderColor: 'accent.border', bg: 'surface.raised' }}
      >
        <Text
          fontFamily="mono"
          textTransform="uppercase"
          letterSpacing="0.08em"
          fontSize="xs"
          color="text.muted"
        >
          {title}
        </Text>
        <RadioCard.ItemContent>
          <CriterionLevelList criteria={criteria} />
        </RadioCard.ItemContent>
        <RadioCard.ItemIndicator />
      </RadioCard.ItemControl>
    </RadioCard.Item>
  );
}
