// Radar chart for the Album Rating Page (see docs/decisions/album-rating-page.md).
//
// @chakra-ui/charts does NOT export a ready-made `RadarChart` component (checked its type
// declarations directly — only `bar-list`/`bar-segment`/`chart` primitives exist). The real
// pattern is: `useChart()` resolves theme tokens (e.g. 'accent.border') to actual CSS colors,
// and you compose Recharts' own RadarChart/PolarGrid/Radar inside `Chart.Root`. The brief's
// "RadarChart (@chakra-ui/charts)" phrasing assumed a turnkey component; this is the corrected
// composition that achieves the same result.
import { useEffect, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { Chart, useChart } from '@chakra-ui/charts';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';

export interface CriterionLevelWeight {
  criterionId: number;
  level: number;
  value: number;
}

interface RadarPoint {
  criterion: string;
  level: number;
  criterionId: number;
  levelLabel: string;
  // Weight shown as % of this criterion's own max achievable weight, not the raw fraction —
  // raw weights aren't comparable across criteria (each criterion's LP is solved
  // independently, see docs/decisions/album-rating-drawer.md's normalization finding), so a
  // bare number like "0.18" gave no sense of whether that's a strong or weak pick.
  weightPercentLabel: string;
}

// Radar chart axis labels only — full names stay everywhere else in the UI (Section 2's
// criteria list, tooltips, etc). Grammatically-truncated per-name lookup rather than generic
// slicing, so the shortened forms read as deliberate abbreviations, not mid-word cutoffs.
// Keys match `criteria.name` exactly as seeded in supabase/criteria.sql — note "Emotional
// impact" is sentence case there (only the first word capitalized), not "Emotional Impact";
// a title-case key would silently never match and this criterion would never abbreviate.
const CRITERION_ABBREVIATIONS: Record<string, string> = {
  'Emotional impact': 'Emotion',
  Performance: 'Perform.',
  Production: 'Prod.',
  Songwriting: 'Writing',
  Innovation: 'Innov.',
  Coherence: 'Coher.',
};

function abbreviateCriterionLabel(name: string): string {
  return CRITERION_ABBREVIATIONS[name] ?? name;
}

interface RatingRadarChartProps {
  catalog: CriteriaCatalog | null;
  ratings: Map<number, number>;
  // Fixed display order (criterion ids) — see FIXED_CRITERION_ORDER in AlbumRatingPage.tsx.
  order: number[];
  // Real per-(criterion, level) weight values from user_criterion_weights, same source
  // scoreAndRank.ts's computeScore reads. Only needed for the desktop tooltip; omitted
  // entirely on the small mobile chart (no interaction there).
  weights?: CriterionLevelWeight[];
  size?: 'full' | 'small';
}

export function RatingRadarChart({
  catalog,
  ratings,
  order,
  weights,
  size = 'full',
}: RatingRadarChartProps) {
  const weightMap = new Map<string, number>();
  const maxWeightByCriterion = new Map<number, number>();
  for (const w of weights ?? []) {
    weightMap.set(`${w.criterionId}:${w.level}`, w.value);
    const currentMax = maxWeightByCriterion.get(w.criterionId) ?? 0;
    if (w.value > currentMax) maxWeightByCriterion.set(w.criterionId, w.value);
  }

  const data: RadarPoint[] = order.map((id) => {
    const entry = catalog?.entries[id];
    const level = ratings.get(id) ?? 0;
    const levelInfo = level > 0 ? entry?.levels[level] : undefined;
    const weight = weightMap.get(`${id}:${level}`);
    const maxWeight = maxWeightByCriterion.get(id);
    const weightPercentLabel =
      weight !== undefined && maxWeight ? `${Math.round((weight / maxWeight) * 100)}% of criterion max` : '—';
    return {
      criterion: entry?.name ?? '',
      level,
      criterionId: id,
      levelLabel: levelInfo?.label ?? 'Not rated',
      weightPercentLabel,
    };
  });

  const chart = useChart<RadarPoint>({
    data,
    series: [{ name: 'level', color: 'accent.border' }],
  });

  const isSmall = size === 'small';
  // Resolved once here (useChart's color() needs the hook's own context).
  const criterionTickColor = chart.color('sand.300');

  // Labels abbreviate only inside a fixed 1024-1250px *viewport* window — the range where
  // Tier 1's Section 3 is narrow enough that full criterion names clip past the card's edge.
  // window.innerWidth directly (not matchMedia's string parsing, not em units) for an exact,
  // easy-to-verify match against the 1024/1250 boundary.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024 && window.innerWidth <= 1250
  );

  useEffect(() => {
    if (isSmall) return;
    const checkWidth = () => setIsNarrow(window.innerWidth >= 1024 && window.innerWidth <= 1250);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, [isSmall]);

  return (
    // Fixed 260px square replaced with a fluid 100%-width box holding aspectRatio 1 (full size
    // only — the small mobile preview icon stays a fixed 40px, unaffected) — see
    // docs/decisions/album-rating-page.md's dated entry: the previous fixed boxSize was the
    // actual reason the chart looked stuck at one size and left-aligned inside Section 3's
    // wider column, even though ResponsiveContainer below was already filling 100% of it —
    // 100% of a box that itself never changed size. RadarChart's own outerRadius (below) was
    // already percentage-based by default, so it started scaling correctly the moment its
    // container did.
    <Chart.Root chart={chart} w={isSmall ? '40px' : '100%'} aspectRatio={isSmall ? undefined : '1'} h={isSmall ? '40px' : undefined}>
      {/* RadarChart has `responsive: false` and no default width/height (checked recharts'
          own PolarChart.js defaults directly) — without this wrapper it silently renders a
          0x0 SVG, no console error. Confirmed by the radar-chart spike: Chart.Root's Box alone
          does not supply pixel dimensions to the chart. */}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart
          data={chart.data}
          // outerRadius/margin are a fixed, deliberately generous look (60%/20px uniform) —
          // shrinking these to make room for full labels was tried and rejected: it made the
          // chart visibly smaller everywhere, not just where clipping actually happens. Label
          // abbreviation (tickFormatter below) is what handles the narrow band instead.
          outerRadius="60%"
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <PolarGrid stroke="none" style={{ fill: chart.color('ember.solid'), fillOpacity: 0.1 }} />
          {/* Persistent labels re-enabled (a past pass removed them "per feedback" — this
              brief asked them back). `entry?.name` is the full criterion name; tickFormatter
              abbreviates it (see abbreviateCriterionLabel above) only inside the 1024-1250px
              viewport band where it would otherwise clip — full names outside that band.
              Skipped entirely on the small mobile preview (isSmall): the 40px icon has no room
              for labels and this brief doesn't touch mobile.

              Color set via `style`, not the `fill` prop: @chakra-ui/charts' own baseCss injects
              `.recharts-polar-angle-axis-tick-value { fill: var(--chakra-colors-fg-muted) }` as
              a real scoped stylesheet rule (confirmed by inspecting `document.styleSheets`
              directly) — that beats a plain SVG `fill` presentation attribute regardless of
              what color is passed there, which is why `fill: criterionTickColor` alone silently
              never took effect. Inline `style` outranks the external rule. */}
          <PolarAngleAxis
            dataKey={chart.key('criterion')}
            tick={isSmall ? false : { fontSize: 10, style: { fill: criterionTickColor } }}
            tickFormatter={isNarrow ? abbreviateCriterionLabel : undefined}
          />
          {/* Explicit `ticks` — without it, Recharts' default "nice number" tick algorithm
              picks an uneven set for domain [0,5] (confirmed live: only 0/2/4/5, no ring at
              1 or 3), so grid rings don't land one-per-level. Forcing 1-5 gives one ring per
              level and fixes the "3rd level ring missing" report. */}
          <PolarRadiusAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={false} axisLine={false} />
          <Radar
            dataKey={chart.key('level')}
            stroke={chart.color('accent.border')}
            fill={chart.color('accent.border')}
            fillOpacity={0.2}
            isAnimationActive={true}
            // Duration only, no `animationEasing` override — confirmed live that Recharts'
            // default easing looks right here despite the site's usual ease-out convention
            // elsewhere; ease-out looked wrong in practice on this specific animation.
            animationDuration={250}
          />
          {!isSmall && (
            <Tooltip
              content={
                <Chart.Tooltip
                  hideLabel
                  hideIndicator
                  // ChartTooltipProps.render is called with the raw data point (this chart's
                  // RadarPoint), not a Recharts payload wrapper — confirmed by reading
                  // chart.cjs's implementation directly (`render(item.payload)`), not assumed
                  // from the .d.ts alone.
                  render={(point) => {
                    const p = point as unknown as RadarPoint;
                    return (
                      <Box>
                        <Text fontWeight="semibold">{p.criterion}</Text>
                        <Text color="text.dim">{p.levelLabel}</Text>
                        <Text color="accent.text" fontFamily="mono" fontSize="xs">
                          {p.weightPercentLabel}
                        </Text>
                      </Box>
                    );
                  }}
                />
              }
            />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>
    </Chart.Root>
  );
}
