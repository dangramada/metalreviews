// Section 2 of the "Your Taste" tab — the single horizontal proportional bar. Adapted from the
// throwaway /results-spike route's TasteFingerprint() (deleted once this landed), now driven by
// real solved weights instead of hand-picked numbers. See
// docs/decisions/criteria-calibration/criteria-calibration-results-tab-design-brief.md for the
// full spike history this reproduces (zero-radius/token compatibility, the inline-label cutoff,
// the legend swatch contrast fix below).
import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import { BarSegment, useChart } from '@chakra-ui/charts';
import {
  formatLevelPercent,
  type CriterionBreakdown,
} from '../../lib/criteria-calibration/resultsBreakdown';

// Brightest ember for the top-ranked criterion, darkest ember-brown for the last. Criteria are
// already sorted descending by weight, so index doubles as rank. This is the only place ember
// appears on the page (brief §Fingerprint).
const EMBER_GRADIENT = [
  'ember.500',
  'ember.600',
  'ember.700',
  'ember.800',
  'ember.900',
  'ember.950',
];

// Editorial cutoff for embedding a criterion's name directly on its segment vs. leaving the
// segment bare with only the percent shown below and the name in the legend instead. A concrete
// number, not a reverse-engineered fit of any one example's own proportions.
const FINGERPRINT_INLINE_LABEL_MIN_PERCENT = 20;

interface YourTasteFingerprintProps {
  criteria: CriterionBreakdown[];
}

export function YourTasteFingerprint({ criteria }: YourTasteFingerprintProps) {
  const chart = useChart({
    data: criteria.map((c, i) => ({
      name: c.name,
      value: c.weightPercent,
      color: EMBER_GRADIENT[i % EMBER_GRADIENT.length],
    })),
  });

  const legendCriteria = criteria.filter(
    (c) => c.weightPercent < FINGERPRINT_INLINE_LABEL_MIN_PERCENT
  );

  return (
    <Box>
      <BarSegment.Root chart={chart} barSize="14">
        <BarSegment.Content>
          <Flex pos="relative" gap="1px">
            {criteria.map((c, i) => (
              <Box
                key={c.name}
                flex={c.weightPercent}
                h="14"
                bg={EMBER_GRADIENT[i % EMBER_GRADIENT.length]}
                display="flex"
                alignItems="flex-end"
                p={2}
                minW={0}
                overflow="hidden"
              >
                {c.weightPercent >= FINGERPRINT_INLINE_LABEL_MIN_PERCENT && (
                  <Text fontSize="xs" fontWeight="medium" color="accent.ink" lineClamp={1}>
                    {c.name}
                  </Text>
                )}
              </Box>
            ))}
          </Flex>
        </BarSegment.Content>
      </BarSegment.Root>
      {/* Percent always visible below every segment regardless of an on-segment name — never
          hover-only, per the brief (no hover on mobile). */}
      <Flex gap="1px" mt={2}>
        {criteria.map((c) => (
          <Text
            key={c.name}
            flex={c.weightPercent}
            minW={0}
            overflow="hidden"
            fontSize="xs"
            fontFamily="mono"
            color="text.dim"
          >
            {formatLevelPercent(c.weightPercent)}
          </Text>
        ))}
      </Flex>
      {/* Legend for criteria without room for an on-segment name — restricted to exactly those,
          so already-labeled criteria aren't repeated. Every swatch gets a uniform 1px neutral
          border regardless of its own fill color: ember.900/950 measured under WCAG's 3:1
          minimum for non-text UI (1.95:1 / 1.33:1 against surface.page) as plain fills, and this
          fixes that without changing any swatch's color, which must keep matching its
          fingerprint segment exactly. */}
      {legendCriteria.length > 0 && (
        <Flex gap={4} wrap="wrap" mt={3}>
          {legendCriteria.map((c) => {
            const i = criteria.indexOf(c);
            return (
              <HStack key={c.name} gap={1.5}>
                <Box
                  boxSize="10px"
                  bg={EMBER_GRADIENT[i % EMBER_GRADIENT.length]}
                  borderWidth="1px"
                  borderColor="border.ruleStrong"
                  flexShrink={0}
                />
                <Text fontSize="xs" color="text.dim">
                  {c.name}
                </Text>
              </HStack>
            );
          })}
        </Flex>
      )}
    </Box>
  );
}
