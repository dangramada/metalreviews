// Radar chart for the Album Rating Page (see docs/decisions/album-rating-page.md).
//
// @chakra-ui/charts does NOT export a ready-made `RadarChart` component (checked its type
// declarations directly — only `bar-list`/`bar-segment`/`chart` primitives exist). The real
// pattern is: `useChart()` resolves theme tokens (e.g. 'accent.border') to actual CSS colors,
// and you compose Recharts' own RadarChart/PolarGrid/Radar inside `Chart.Root`. The brief's
// "RadarChart (@chakra-ui/charts)" phrasing assumed a turnkey component; this is the corrected
// composition that achieves the same result.
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

  return (
    <Chart.Root chart={chart} boxSize={isSmall ? '40px' : '260px'}>
      {/* RadarChart has `responsive: false` and no default width/height (checked recharts'
          own PolarChart.js defaults directly) — without this wrapper it silently renders a
          0x0 SVG, no console error. Confirmed by the radar-chart spike: Chart.Root's Box alone
          does not supply pixel dimensions to the chart. */}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart data={chart.data}>
          <PolarGrid stroke="none" style={{ fill: chart.color('ember.solid'), fillOpacity: 0.1 }} />
          {/* Axis labels removed per feedback — tick={false} still keeps PolarAngleAxis's
              angular positioning (required for the categorical dataKey to lay out points
              around the circle), it just hides the criterion-name text. */}
          <PolarAngleAxis dataKey={chart.key('criterion')} tick={false} />
          {/* Explicit `ticks` — without it, Recharts' default "nice number" tick algorithm
              picks an uneven set for domain [0,5] (confirmed live: only 0/2/4/5, no ring at
              1 or 3), so grid rings don't land one-per-level. Forcing 1-5 gives one ring per
              level and fixes the "3rd level ring missing" report. */}
          <PolarRadiusAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={false} axisLine={false} />
          <Radar
            dataKey={chart.key('level')}
            stroke={chart.color('accent.border')}
            fill={chart.color('accent.border')}
            fillOpacity={0.4}
            isAnimationActive={false}
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
