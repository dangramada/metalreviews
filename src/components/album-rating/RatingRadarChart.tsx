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
  // Plotted value is the real weight (0 when unrated), not the picked level's ordinal
  // position — level 1 is fixed at weight 0 for every criterion by construction of the
  // solver (see solver.ts:83, "fixed at 0, contributes nothing to the sum"), so plotting by
  // level made a real, contributing pick look identical to "no data" everywhere except
  // exactly at level 1, and made a weight-0 level-1 pick visually indistinguishable from a
  // meaningfully-contributing one. Plotting weight directly means radial position always
  // matches real score contribution — a weight-0 pick sits at the center, full stop.
  weight: number;
  criterionId: number;
  levelLabel: string;
  // Weight also shown as % of this criterion's own max achievable weight — raw weights
  // aren't comparable across criteria (each criterion's LP is solved independently, see
  // docs/decisions/album-rating-drawer.md's normalization finding), so this gives a sense of
  // "how good is this pick for this specific criterion" alongside the absolute radial size.
  weightPercentLabel: string;
}

interface RatingRadarChartProps {
  catalog: CriteriaCatalog | null;
  ratings: Map<number, number>;
  // Fixed display order (criterion ids) — see FIXED_CRITERION_ORDER in AlbumRatingPage.tsx.
  order: number[];
  // Real per-(criterion, level) weight values from user_criterion_weights, same source
  // scoreAndRank.ts's computeScore reads. Now required on both layouts — the chart plots
  // weight directly, not just level, so the small mobile chart needs it too, not only the
  // desktop tooltip.
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
  let maxWeightOverall = 0;
  for (const w of weights ?? []) {
    weightMap.set(`${w.criterionId}:${w.level}`, w.value);
    const currentMax = maxWeightByCriterion.get(w.criterionId) ?? 0;
    if (w.value > currentMax) maxWeightByCriterion.set(w.criterionId, w.value);
    if (w.value > maxWeightOverall) maxWeightOverall = w.value;
  }
  // Shared domain across every axis, anchored to this user's single highest-weight
  // (criterion, level) combination — mirrors the earlier level-based fix (ticks ending
  // exactly at the domain max, so the best possible pick reaches the true outer edge).
  // Falls back to 1 only to avoid a degenerate zero-width domain before weights load.
  const domainMax = maxWeightOverall > 0 ? maxWeightOverall : 1;

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
      weight: weight ?? 0,
      criterionId: id,
      levelLabel: levelInfo?.label ?? 'Not rated',
      weightPercentLabel,
    };
  });

  const chart = useChart<RadarPoint>({
    data,
    series: [{ name: 'weight', color: 'accent.border' }],
  });

  const isSmall = size === 'small';

  return (
    // Fluid, not a fixed pixel box, for the full size — Column 1 on desktop is itself fluid
    // (flex="1 1 0" among 3 columns), so a hardcoded small size left the chart reading as
    // small regardless of how much room its column actually had. w="100%" + aspectRatio="1"
    // lets it grow with its container, capped at maxW so it doesn't dwarf the artwork/button
    // above and below it in the same column.
    <Chart.Root chart={chart} w={isSmall ? '40px' : '100%'} maxW={isSmall ? '40px' : '360px'} aspectRatio="1">
      {/* RadarChart has `responsive: false` and no default width/height (checked recharts'
          own PolarChart.js defaults directly) — without this wrapper it silently renders a
          0x0 SVG, no console error. Confirmed by the radar-chart spike: Chart.Root's Box alone
          does not supply pixel dimensions to the chart. */}
      <ResponsiveContainer width="100%" height="100%">
        {/* outerRadius defaults to '80%' at the PolarChart level (recharts/lib/chart/PolarChart.js),
            leaving a 20% ring of unused space between the grid boundary and the plot's true
            edge — the hover cursor guide line still extends to that true edge, so it visibly
            overshot the grid, and the chart read as smaller than its container. 100% makes the
            grid/data fill the whole box and matches where the cursor line actually ends. */}
        <RechartsRadarChart data={chart.data} outerRadius="100%">
          {/* stroke="none" was wrong: PolarGrid's `stroke` prop controls BOTH the concentric
              ring outlines AND the 6 radial per-criterion spoke lines (confirmed by tracing
              the DOM: both are children of `.recharts-polar-grid`, both inherit the same
              `stroke` prop) — there's no separate prop to silence only the rings. Removing it
              also silently removed the spokes marking each criterion's axis. Keeping a real,
              subtle stroke restores those while the `style`-based fill trick (still needed —
              Recharts hardcodes `fill="none"` as a prop on every ring; only inline `style.fill`
              overrides that per-ring, see the fill comment's history) keeps the banded look. */}
          <PolarGrid
            stroke={chart.color('border.default')}
            style={{ fill: chart.color('ember.solid'), fillOpacity: 0.1 }}
          />
          {/* Axis labels removed per feedback — tick={false} still keeps PolarAngleAxis's
              angular positioning (required for the categorical dataKey to lay out points
              around the circle), it just hides the criterion-name text. */}
          <PolarAngleAxis dataKey={chart.key('criterion')} tick={false} />
          {/* Explicit `ticks`, 5 evenly spaced up to domainMax — Recharts' default "nice
              number" tick algorithm produced an uneven, gapped set for the old fixed [0,5]
              domain (confirmed live: only 0/2/4/5, no ring at 1 or 3), so grid rings didn't
              land evenly. Keeping the same "outer ring = domain max" anchor from that fix. */}
          <PolarRadiusAxis
            domain={[0, domainMax]}
            ticks={[domainMax / 5, (domainMax * 2) / 5, (domainMax * 3) / 5, (domainMax * 4) / 5, domainMax]}
            tick={false}
            axisLine={false}
          />
          <Radar
            dataKey={chart.key('weight')}
            stroke={chart.color('accent.border')}
            fill={chart.color('accent.border')}
            fillOpacity={0.4}
            isAnimationActive={false}
          />
          {!isSmall && (
            <Tooltip
              // Recharts' default cursor (true) draws a guide line from center toward the raw
              // mouse position, unclamped to the chart's radius — combined with Chart.Root's
              // `overflow: visible` on its <svg> (chart.cjs's baseCss), that line rendered well
              // past the chart's box instead of being clipped. The hovered point's own dot
              // marker (Radar's built-in activeDot) already shows what's selected; no separate
              // cursor line is needed.
              cursor={false}
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
