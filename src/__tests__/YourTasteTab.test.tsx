// @vitest-environment jsdom
//
// Coverage for the real "Your Taste" tab (ResultsTab.tsx + YourTasteFingerprint +
// YourTasteCriterionDetail), replacing the throwaway /results-spike route's manual live checks
// with an enforced regression suite. See
// docs/decisions/criteria-calibration/criteria-calibration-results-tab-design-brief.md for the
// design history each case below traces back to.
//
// Renders ResultsTab directly with synthetic props rather than the whole
// CriteriaCalibrationPage — it's a pure presentational component (tier/accuracyPercent/
// solvedValues/catalog in, real markup out), so no Supabase/auth/resume mocking is needed.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import system from '../theme';
import { ResultsTab } from '../components/criteria-calibration/ResultsTab';
import { YourTasteCriterionDetail } from '../components/criteria-calibration/YourTasteCriterionDetail';
import { YourTasteFingerprint } from '../components/criteria-calibration/YourTasteFingerprint';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import type { LevelValue } from '../lib/criteria-calibration/solver';
import type { CriterionBreakdown } from '../lib/criteria-calibration/resultsBreakdown';

function makeCatalog(criteria: { name: string; levels: string[] }[]): CriteriaCatalog {
  return {
    entries: criteria.map((c, index) => ({
      index,
      name: c.name,
      description: `${c.name} description.`,
      levels: Object.fromEntries(
        c.levels.map((label, i) => [i + 1, { label, description: `${label} description.` }])
      ),
    })),
    levelsPerCriterion: criteria.map((c) => c.levels.length),
  };
}

// perCriterionRestPoints[c] = cumulative solved points (0-1 scale) for levels 2..top. Level 1
// isn't passed — it's implicit at exactly 0, matching values[c][1] = {0,0,0} in the real solver
// output (the solver's own invariant, not a test simplification).
function makeSolvedValues(perCriterionRestPoints: number[][]): LevelValue[][] {
  return perCriterionRestPoints.map((points) => {
    const values: LevelValue[] = [
      { point: 0, min: 0, max: 0 },
      { point: 0, min: 0, max: 0 },
    ];
    for (const p of points) values.push({ point: p, min: p, max: p });
    return values;
  });
}

function renderTab(props: Partial<Parameters<typeof ResultsTab>[0]> = {}) {
  return render(
    <ChakraProvider value={system}>
      <ResultsTab
        tier="medium"
        accuracyPercent={62}
        solvedValues={null}
        catalog={null}
        onBackToCalibration={() => {}}
        {...props}
      />
    </ChakraProvider>
  );
}

describe('ResultsTab ("Your Taste") — gating', () => {
  it('shows the unified empty state when tier is none, regardless of solved data', () => {
    renderTab({ tier: 'none' });
    expect(screen.getByText("Nothing's taken shape yet.")).toBeTruthy();
    expect(screen.getByText("Keep comparing and it'll start to show up here.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to Calibration' })).toBeTruthy();
  });

  it('shows the empty state (not a crash) when the gate is open but nothing has solved yet', () => {
    renderTab({ tier: 'medium', solvedValues: null, catalog: null });
    expect(screen.getByText("Nothing's taken shape yet.")).toBeTruthy();
  });

  it('shows real content once tier is past none and solved data exists', () => {
    const catalog = makeCatalog([
      { name: 'Emotional impact', levels: ['Flat', 'Powerful'] },
      { name: 'Coherence', levels: ['Weak', 'Strong'] },
    ]);
    const solvedValues = makeSolvedValues([[0.6], [0.4]]);
    renderTab({ tier: 'medium', solvedValues, catalog });
    expect(screen.queryByText("Nothing's taken shape yet.")).toBeNull();
    expect(screen.getByText('Fingerprint')).toBeTruthy();
    expect(screen.getByText('Per-criterion detail')).toBeTruthy();
  });
});

describe('ResultsTab — narrative sentence tie-handling', () => {
  const NAMES = [
    'Emotional impact',
    'Coherence',
    'Songwriting',
    'Production',
    'Performance',
    'Innovation',
  ];
  function catalogFor() {
    return makeCatalog(NAMES.map((name) => ({ name, levels: ['Base', 'Top'] })));
  }
  function solvedFor(weights: number[]) {
    return makeSolvedValues(weights.map((w) => [w / 100]));
  }

  it('names exactly one leader when nothing else is within 2 points of the top', () => {
    const weights = [40, 20, 15, 10, 8, 7];
    renderTab({ solvedValues: solvedFor(weights), catalog: catalogFor() });
    expect(screen.getByText('Right now, you lean hardest into emotional impact.')).toBeTruthy();
  });

  it('names two leaders when the top two are within 2 points of each other', () => {
    const weights = [30, 29, 15, 10, 8, 8];
    renderTab({ solvedValues: solvedFor(weights), catalog: catalogFor() });
    expect(
      screen.getByText('Right now, you lean hardest into emotional impact and coherence.')
    ).toBeTruthy();
  });

  it('names three leaders when the top three are within 2 points of each other', () => {
    const weights = [30, 29, 28, 10, 2, 1];
    renderTab({ solvedValues: solvedFor(weights), catalog: catalogFor() });
    expect(
      screen.getByText(
        'Right now, you lean hardest into emotional impact, coherence, and songwriting.'
      )
    ).toBeTruthy();
  });

  it('falls back to the dead-heat line when 4 or more criteria are tied at the top', () => {
    const weights = [17, 17, 17, 17, 16, 16];
    renderTab({ solvedValues: solvedFor(weights), catalog: catalogFor() });
    expect(
      screen.getByText("It's a dead heat up top right now. Annoying, but accurate.")
    ).toBeTruthy();
  });
});

// The per-level/fingerprint tests below render YourTasteCriterionDetail/YourTasteFingerprint
// directly with a controlled CriterionBreakdown[] fixture, rather than going through
// ResultsTab + simulating an accordion-trigger click: Ark UI's accordion defers its open/close
// commit to a CSS animation-driven step that jsdom (no real layout/transitions) never
// completes, so a synthetic click alone doesn't reliably flip its state in this test
// environment. Driving `openValues` directly exercises the same real rendering (BarRowLabel,
// formatLevelPercent, aria-hidden) without depending on that animation machinery.
function renderDetail(criteria: CriterionBreakdown[], openValues: string[]) {
  return render(
    <ChakraProvider value={system}>
      <YourTasteCriterionDetail
        criteria={criteria}
        openValues={openValues}
        onOpenValuesChange={() => {}}
      />
    </ChakraProvider>
  );
}

describe('YourTasteCriterionDetail — per-level formatting and accessibility', () => {
  // Production: 0%, 88.9%, 10.3%, 0.5% (exact boundary), 0.3% (<0.5%) — increments sum to 100%,
  // matching the design brief's requirement that level percentages sum to the criterion's own
  // displayed weight. "Exceptional" stands in for the spike's long-name-truncation case.
  const production: CriterionBreakdown = {
    index: 0,
    name: 'Production',
    weightPercent: 100,
    levels: [
      { label: 'Poor', percent: 0 },
      { label: 'Exceptional', percent: 88.9 },
      { label: 'Well done', percent: 10.3 },
      { label: 'Masterful', percent: 0.5 },
      { label: 'Groundbreaking', percent: 0.3 },
    ],
  };
  const innovation: CriterionBreakdown = {
    index: 1,
    name: 'Innovation',
    weightPercent: 100,
    levels: [
      { label: 'Uninspired', percent: 0 },
      { label: 'Bold', percent: 100 },
    ],
  };

  it('renders the level-1 baseline literally as "0%", never omitted or truncated', () => {
    renderDetail([production], ['Production']);
    expect(screen.getAllByText('Poor').length).toBeGreaterThan(0);
    // Two literal "0%" copies exist for the level's baseline: the visible one and its
    // aria-hidden bar-clipped twin (see the aria-hidden test below).
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
  });

  it('shows exactly-0.5% as a literal "0.5%", not "<0.5%"', () => {
    renderDetail([production], ['Production']);
    expect(screen.getAllByText('0.5%').length).toBeGreaterThan(0);
  });

  it('shows under-0.5% values as "<0.5%"', () => {
    renderDetail([production], ['Production']);
    expect(screen.getAllByText('<0.5%').length).toBeGreaterThan(0);
  });

  it('renders a long level name ("Exceptional") in full, unclipped', () => {
    renderDetail([production], ['Production']);
    expect(screen.getAllByText('Exceptional').length).toBeGreaterThan(0);
  });

  it('does not break when every criterion is expanded simultaneously', () => {
    renderDetail([production, innovation], ['Production', 'Innovation']);
    expect(screen.getAllByText('Exceptional').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bold').length).toBeGreaterThan(0);
  });

  it('marks the decorative bar-clipped label copy aria-hidden, leaving one accessible copy', () => {
    renderDetail([production], ['Production']);

    const matches = screen.getAllByText('Exceptional');
    expect(matches).toHaveLength(2);
    const hidden = matches.filter((el) => el.closest('[aria-hidden="true"]'));
    const visible = matches.filter((el) => !el.closest('[aria-hidden="true"]'));
    expect(hidden).toHaveLength(1);
    expect(visible).toHaveLength(1);
  });
});

describe('YourTasteFingerprint', () => {
  it('gives a criterion above the inline-label cutoff an on-segment name, and formats weight to one decimal', () => {
    // Emotional impact (95%) clears the 20%-inline-label cutoff; Innovation (5%) doesn't and
    // falls to the legend instead — both still show their percent below the bar either way.
    const criteria: CriterionBreakdown[] = [
      {
        index: 0,
        name: 'Emotional impact',
        weightPercent: 95,
        levels: [{ label: 'Top', percent: 95 }],
      },
      { index: 1, name: 'Innovation', weightPercent: 5, levels: [{ label: 'Top', percent: 5 }] },
    ];
    render(
      <ChakraProvider value={system}>
        <YourTasteFingerprint criteria={criteria} />
      </ChakraProvider>
    );

    // One-decimal weight formatting (per Dan's review): 95% and 5% display as "95.0%"/"5.0%",
    // never rounded to a whole number, matching the level-percent convention exactly.
    expect(screen.getByText('95.0%')).toBeTruthy();
    expect(screen.getByText('5.0%')).toBeTruthy();
    // Innovation clears no inline-label threshold, so its name only shows via the legend —
    // still rendered somewhere on the page rather than dropped.
    expect(screen.getAllByText('Innovation').length).toBeGreaterThan(0);
    // Emotional impact clears the cutoff and gets an on-segment name.
    expect(screen.getAllByText('Emotional impact').length).toBeGreaterThan(0);
  });
});
