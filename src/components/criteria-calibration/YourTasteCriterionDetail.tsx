// Section 3 of the "Your Taste" tab — ranked per-criterion list with expandable per-level
// breakdowns. Adapted from the throwaway /results-spike route's final (post-BarList-correction)
// implementation, now driven by real solved weights. See
// docs/decisions/criteria-calibration/criteria-calibration-results-tab-design-brief.md:
// - "Correction: BarSegment -> BarList for Section 3" for why every level is its own
//   independent row rather than a shared stacked segment, and why the real `BarList.Bar`
//   primitive was tried live and rejected (per-instance-max width domain, incompatible with the
//   one-absolute-scale requirement here) in favor of this hand-rolled version.
// - "Label-overlay pass" for the double-copy technique in BarRowLabel below.
// - "Correction: bar height/font size, exact value-column alignment" for CHEVRON_RESERVE.
import { HStack, Stack, Text, Box, Flex } from '@chakra-ui/react';
import {
  AccordionRoot,
  AccordionItem,
  AccordionItemTrigger,
  AccordionItemContent,
} from '../ui/accordion';
import {
  formatLevelPercent,
  type CriterionBreakdown,
} from '../../lib/criteria-calibration/resultsBreakdown';

// One absolute percent-to-width scale across collapsed criterion rows AND per-level rows: every
// bar renders its own real absolute percent as a literal CSS width of the SAME fixed-width
// track, so a 10%-weight criterion's row and a 10%-value level render at the identical pixel
// length anywhere on the page. Deliberately NOT extended to the fingerprint (Section 2, a
// 100%-stacked composition, not a row with its own value column) — see the brief's own scoping
// note on this.
const VALUE_COLUMN_WIDTH = '3.5rem';

const CRITERION_BAR_HEIGHT = '40px';
const CRITERION_FONT_SIZE = 'md';
const LEVEL_BAR_HEIGHT = '28px';
const LEVEL_FONT_SIZE = 'sm';

// Measured (not guessed) gap between the criterion row's value text — a sibling of the
// accordion's own expand chevron, which reserves real width after it — and a level row's, which
// has nothing there. Applied as trailing padding on the level list so both value columns' right
// edges land on the same pixel.
const CHEVRON_RESERVE = '31.2px';

function BarRowLabel({
  label,
  percent,
  height,
  fontSize,
  fontWeight,
}: {
  label: string;
  percent: number;
  height: string;
  fontSize: string;
  fontWeight?: string;
}) {
  return (
    <Box position="relative" flex="1" h={height}>
      <Box
        position="absolute"
        insetStart={0}
        top={0}
        h="full"
        bg="ink.300"
        width={`${percent}%`}
        minW="3px"
      />
      <Flex position="relative" h="full" align="center" pl={3}>
        <Text fontSize={fontSize} fontWeight={fontWeight} color="text.primary" whiteSpace="nowrap">
          {label}
        </Text>
      </Flex>
      {/* Decorative dark copy, clipped to the bar's own width — occludes the light copy above
          wherever the bar exists, letting one label read correctly over a light fill without a
          gradient/mix-blend trick. aria-hidden because the light copy above already conveys the
          full label; without this a screen reader would announce every level name twice. */}
      <Box
        aria-hidden="true"
        position="absolute"
        insetStart={0}
        top={0}
        h="full"
        width={`${percent}%`}
        minW="3px"
        overflow="hidden"
        pointerEvents="none"
      >
        <Flex h="full" align="center" pl={3}>
          <Text fontSize={fontSize} fontWeight={fontWeight} color="ink.950" whiteSpace="nowrap">
            {label}
          </Text>
        </Flex>
      </Box>
    </Box>
  );
}

function LevelRow({ label, percent }: { label: string; percent: number }) {
  return (
    <HStack gap={3} py={1} px={2} mx={-2} _hover={{ bg: 'surface.criterionHover' }}>
      <BarRowLabel
        label={label}
        percent={percent}
        height={LEVEL_BAR_HEIGHT}
        fontSize={LEVEL_FONT_SIZE}
      />
      <Text
        flexShrink={0}
        w={VALUE_COLUMN_WIDTH}
        textAlign="right"
        fontFamily="mono"
        fontSize={LEVEL_FONT_SIZE}
        color="text.primary"
      >
        {formatLevelPercent(percent)}
      </Text>
    </HStack>
  );
}

function CriterionRow({ criterion, isOpen }: { criterion: CriterionBreakdown; isOpen: boolean }) {
  return (
    <AccordionItem value={criterion.name} borderTopWidth="1px" borderColor="border.ruleStrong">
      <AccordionItemTrigger py={3} _hover={{ bg: 'surface.criterionHover' }}>
        <BarRowLabel
          label={criterion.name}
          percent={criterion.weightPercent}
          height={CRITERION_BAR_HEIGHT}
          fontSize={CRITERION_FONT_SIZE}
          fontWeight="medium"
        />
        <Text
          fontFamily="mono"
          fontSize={CRITERION_FONT_SIZE}
          w={VALUE_COLUMN_WIDTH}
          textAlign="right"
        >
          {formatLevelPercent(criterion.weightPercent)}
        </Text>
      </AccordionItemTrigger>
      <AccordionItemContent pb={4}>
        {/* Only mounted while actually open — no DOM fit-check needed here, label columns are
            never clipped by the bar's own rendered width. */}
        {isOpen && (
          <Stack gap={0} pr={CHEVRON_RESERVE}>
            {criterion.levels.map((lvl) => (
              <LevelRow key={lvl.label} label={lvl.label} percent={lvl.percent} />
            ))}
          </Stack>
        )}
      </AccordionItemContent>
    </AccordionItem>
  );
}

interface YourTasteCriterionDetailProps {
  criteria: CriterionBreakdown[];
  openValues: string[];
  onOpenValuesChange: (values: string[]) => void;
}

export function YourTasteCriterionDetail({
  criteria,
  openValues,
  onOpenValuesChange,
}: YourTasteCriterionDetailProps) {
  return (
    <AccordionRoot
      multiple
      collapsible
      variant="plain"
      value={openValues}
      onValueChange={(details) => onOpenValuesChange(details.value)}
    >
      {criteria.map((c) => (
        <CriterionRow key={c.name} criterion={c} isOpen={openValues.includes(c.name)} />
      ))}
    </AccordionRoot>
  );
}
