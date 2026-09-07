import { Box, Tabs, VStack } from '@chakra-ui/react';
import { PageBreadcrumb } from '../ui/breadcrumb';
import { resolveFromSource, type FromSourceEntry } from '../../lib/navigation/resolveFromSource';
import type { AccuracyTier } from '../../lib/criteria-calibration/accuracyTierLabels';
import type { CalibrationStep } from '../../CriteriaCalibrationPage';
import { TitleStatusRow } from './TitleStatusRow';

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

interface CalibrationPageHeaderProps {
  from: string | null;
  activeStep: CalibrationStep;
  onStepChange: (step: CalibrationStep) => void;
  tier: AccuracyTier;
  accuracyPercent: number;
  hasStarted: boolean;
}

// Persistent across all three tabs (Guide/Calibration/Results) — breadcrumb, title + badge,
// and the tab bar itself. First use of Chakra's Tabs anywhere in the app (no existing pattern
// to match), so this stays close to Chakra's default underline styling rather than a custom
// treatment. No forward-blocking: every tab is always clickable regardless of progress, a
// structural guarantee of using Tabs.Root/value rather than something bespoke.
export function CalibrationPageHeader({
  from,
  activeStep,
  onStepChange,
  tier,
  accuracyPercent,
  hasStarted,
}: CalibrationPageHeaderProps) {
  const { href: backHref, label: sourceLabel } = resolveFromSource(
    from,
    CALIBRATION_FROM_SOURCES,
    CALIBRATION_FALLBACK_SOURCE
  );

  return (
    <VStack gap={4} align="stretch" data-testid="calibration-header">
      <Box>
        <PageBreadcrumb
          items={[{ label: sourceLabel, to: backHref }, { label: 'Criteria Calibration' }]}
        />
      </Box>

      <TitleStatusRow tier={tier} accuracyPercent={accuracyPercent} hasStarted={hasStarted} />

      <Tabs.Root
        value={activeStep}
        onValueChange={({ value }) => onStepChange(value as CalibrationStep)}
      >
        <Tabs.List>
          <Tabs.Trigger value="guide">Guide</Tabs.Trigger>
          <Tabs.Trigger value="calibration">Calibration</Tabs.Trigger>
          <Tabs.Trigger value="results">Results</Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.Root>
    </VStack>
  );
}
