import { Box, Flex, Heading, Tabs } from '@chakra-ui/react';
import { PageBreadcrumb } from '../ui/breadcrumb';
import { resolveFromSource, type FromSourceEntry } from '../../lib/navigation/resolveFromSource';
import type { AccuracyTier } from '../../lib/criteria-calibration/accuracyTierLabels';
import type { CalibrationStep } from '../../CriteriaCalibrationPage';
import { TierAccuracyBadge } from './TierAccuracyBadge';

// Only Favorites is a real entry point today (`?from=favorites`, set by FavoritesPage's gate
// nudge dialog). AOTY is listed per the brief's "build the plumbing, not the entry point" — a
// future `?from=aoty` slots in as one more map entry, no rewrite needed, mirroring
// AlbumRatingPage.tsx's own RATING_FROM_SOURCES (both now built on the shared
// resolveFromSource helper).
const CALIBRATION_FALLBACK_SOURCE: FromSourceEntry = { href: '/favorites', label: 'Favorites' };
const CALIBRATION_FROM_SOURCES: Record<string, FromSourceEntry> = {
  favorites: CALIBRATION_FALLBACK_SOURCE,
  // TODO: point at the real Ranked Albums/AOTY hub route once it exists.
  // aoty: { href: '/aoty', label: 'AOTY' },
};

// Rendered by the global Header (via CriteriaCalibrationPage's PageChrome), not inside the
// header component below. Since 2026-09-11 every page with a breadcrumb hands it to <Header />,
// which alone owns the 16px between its bottom rule and the breadcrumb — so that distance is
// identical on every such screen instead of being reproduced by each page's own spacing.
export function CalibrationBreadcrumb({ from }: { from: string | null }) {
  const { href, label } = resolveFromSource(
    from,
    CALIBRATION_FROM_SOURCES,
    CALIBRATION_FALLBACK_SOURCE
  );
  return <PageBreadcrumb items={[{ label, to: href }, { label: 'Criteria Calibration' }]} />;
}

interface CalibrationPageHeaderProps {
  activeStep: CalibrationStep;
  onStepChange: (step: CalibrationStep) => void;
  tier: AccuracyTier;
  accuracyPercent: number;
  /** Hide the badge until the user has actually answered something — at round 0 there is
   *  nothing calibrated yet to show. */
  hasStarted: boolean;
}

// Persistent across all three tabs (Guide/Calibration/Results): the tab bar with the tier badge
// on the same row. No forward-blocking: every tab is always clickable regardless of progress, a
// structural guarantee of using Tabs.Root/value.
//
// Design-review pass (2026-09-11):
//
//   1. No visible page title. The active tab anchors "you are here", and the old heading
//      repeated the breadcrumb's last segment. It is replaced, not dropped, by a visually-hidden
//      heading so the page keeps its heading landmark. That heading is an h2 although the brief
//      asked for an h1: the global Header already renders the app's one <h1> ("Slant Take"),
//      and the visible title this replaces was itself an h2 (Chakra's Heading defaults to h2).
//      h2 is the exact replacement; an h1 would give the page two top-level headings.
//   2. Active tab is a filled, bordered folder tab rather than an underline, for stronger
//      non-text contrast. This is Chakra's own `outline` variant, restyled in theme.ts's
//      `slotRecipes.tabs` — see the comment there for why that and not per-trigger props, and
//      why it needs CriteriaCalibrationPage to render the panel directly below with no gap.
//   3. Breadcrumb separated by spacing only, and it now lives in the global Header (see
//      CalibrationBreadcrumb above).
//   4. TierAccuracyBadge sits on the tab row. Still inside data-testid="calibration-header",
//      which CriteriaCalibrationFreezeCheckpoint.test.tsx scopes its badge query to.
export function CalibrationPageHeader({
  activeStep,
  onStepChange,
  tier,
  accuracyPercent,
  hasStarted,
}: CalibrationPageHeaderProps) {
  return (
    <Box data-testid="calibration-header">
      <Heading as="h2" srOnly>
        Criteria Calibration
      </Heading>

      <Tabs.Root
        variant="outline"
        size="lg"
        value={activeStep}
        onValueChange={({ value }) => onStepChange(value as CalibrationStep)}
      >
        <Flex align="flex-end" justify="space-between" gap={4}>
          <Tabs.List>
            <Tabs.Trigger value="guide">Guide</Tabs.Trigger>
            <Tabs.Trigger value="calibration">Calibration</Tabs.Trigger>
            <Tabs.Trigger value="results">Results</Tabs.Trigger>
          </Tabs.List>

          {hasStarted && (
            <Box pb={2}>
              <TierAccuracyBadge tier={tier} percent={accuracyPercent} size="sm" />
            </Box>
          )}
        </Flex>
      </Tabs.Root>
    </Box>
  );
}
