// @vitest-environment jsdom
//
// Score-level segmented indicator (score-level-indicator-redesign): filled-segment count and
// the calibration icon button's mute both track confidenceTier directly. Covers the segment
// count mapping for every tier and the very_high/"Sharp" mute, per the brief's "Verification"
// section.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import system from '../theme';
import { RatingProgressBox } from '../components/album-rating/RatingProgressBox';
import type { CalibrationTier } from '../hooks/useCalibrationGate';

function renderBox(confidenceTier: CalibrationTier) {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <RatingProgressBox
          ratedCount={6}
          totalCount={6}
          ratingSummary={{ score: 0.5, rank: 3 }}
          confidenceTier={confidenceTier}
        />
      </MemoryRouter>
    </ChakraProvider>
  );
}

describe('RatingProgressBox — score-level segmented indicator', () => {
  it.each<[CalibrationTier, number]>([
    ['none', 1],
    ['medium', 2],
    ['high', 3],
    ['very_high', 4],
  ])('fills %i of 4 segments for tier %s', (tier, expectedFilled) => {
    renderBox(tier);
    const segments = screen.getAllByTestId('tier-segment');
    expect(segments).toHaveLength(4);
    const filled = segments.filter((el) => el.getAttribute('data-filled') === 'true');
    expect(filled).toHaveLength(expectedFilled);
  });

  it('mutes the calibration icon button only at the Sharp (very_high) tier', () => {
    renderBox('high');
    expect(screen.getByTestId('calibration-action').getAttribute('data-muted')).toBe('false');
  });

  it('mutes the calibration icon button at very_high', () => {
    renderBox('very_high');
    expect(screen.getByTestId('calibration-action').getAttribute('data-muted')).toBe('true');
  });

  it('always exposes an accessible label for the calibration action, regardless of tier', () => {
    renderBox('none');
    expect(screen.getByRole('link', { name: 'Go to calibration' })).toBeInTheDocument();
  });
});
