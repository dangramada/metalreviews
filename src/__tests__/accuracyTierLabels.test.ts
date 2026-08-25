// Guards the single-source rule for the accuracy tier labels (2026-08-18) — see
// accuracyTierLabels.ts's header and
// docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md.
//
// WHY A SOURCE SCAN RATHER THAN A RENDER ASSERTION: the failure this catches is a display
// surface that hardcodes a label instead of reading the constants — which by definition does
// not show up in the surfaces the other tests render. The previous names (Low / Medium / High /
// Very High) were written out in four separate files, so a rename could silently leave one
// behind, disagreeing with the rest of the app.
//
// Scope, stated so a future failure is easy to judge: this scans the files that actually
// DISPLAY a tier, and only string/JSX text, with comments stripped first. Comments legitimately
// mention the old names all over this codebase — that history is deliberate and must not be
// deleted to make a test pass.
//
// KNOWN LIMIT: it matches a label as a whole quoted literal, so prose that merely contains the
// word ("They stay at Sharp") would slip past. That gap was closed by construction instead —
// the checkpoint copy interpolates ACCURACY_TIER_LABELS rather than spelling the names out —
// but a future copy edit could reintroduce it, and this test would not catch it.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCURACY_TIER_LABELS } from '../lib/criteria-calibration/accuracyTierLabels';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DISPLAY_SURFACES = [
  'CriteriaCalibrationPage.tsx',
  'components/criteria-calibration/AccuracyStatus.tsx',
  'components/criteria-calibration/CalibrationCheckpoint.tsx',
  'components/criteria-calibration/RoundGaugeGroup.tsx',
  'components/criteria-calibration/ProgressHeader.tsx',
  'components/album-rating/RatingProgressBox.tsx',
  'hooks/useCalibrationGate.ts',
];

/** Strips // line comments and block comments, so the historical narrative in this codebase's
 *  comments doesn't register as a hardcoded label. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const RETIRED_LABELS = ['Very High', 'Medium', 'Low'];

describe('accuracy tier labels are single-sourced', () => {
  it('defines exactly the four approved rungs', () => {
    expect(ACCURACY_TIER_LABELS).toEqual({
      none: 'Unfocused',
      medium: 'Blurry',
      high: 'Clear',
      veryHigh: 'Sharp',
    });
  });

  it('leaves no retired tier name hardcoded in any display surface', () => {
    for (const relative of DISPLAY_SURFACES) {
      const code = stripComments(fs.readFileSync(path.join(SRC, relative), 'utf8'));
      for (const retired of RETIRED_LABELS) {
        expect(
          code.includes(`'${retired}'`) || code.includes(`"${retired}"`),
          `${relative} still hardcodes the retired label "${retired}"`
        ).toBe(false);
      }
    }
  });

  it('leaves no CURRENT tier name hardcoded either — every surface reads the constants', () => {
    // The point of the module is that renaming a rung touches one file. A surface that spells
    // "Sharp" out in its own JSX would break that even though it happens to be correct today.
    for (const relative of DISPLAY_SURFACES) {
      const code = stripComments(fs.readFileSync(path.join(SRC, relative), 'utf8'));
      for (const label of Object.values(ACCURACY_TIER_LABELS)) {
        expect(
          code.includes(`'${label}'`) || code.includes(`"${label}"`),
          `${relative} hardcodes the label "${label}" instead of reading ACCURACY_TIER_LABELS`
        ).toBe(false);
      }
    }
  });
});
