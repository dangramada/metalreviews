// @vitest-environment jsdom
//
// Accessibility cover for the calibration progress row. Added 2026-09-12 after MEASURING the
// rendered bar rather than reading the code: zag puts role="progressbar" on the TRACK and, left
// unnamed, generates an aria-label of the bare percentage — so the number was announced twice,
// once by the bar and once by the visible text beside it. Both assertions below would have
// passed silently before the fix in the sense that nothing threw; only the accessible NAME
// exposes the problem, which is why it is what they assert.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import system from '../theme';
import { WorkStatusRow } from '../components/criteria-calibration/WorkStatusRow';

function renderRow(percent = 47) {
  return render(
    <ChakraProvider value={system}>
      <WorkStatusRow round={12} progressPercent={percent} onPause={vi.fn()} />
    </ChakraProvider>
  );
}

describe('WorkStatusRow — progress bar accessibility', () => {
  it('names the bar for what it measures instead of taking the generated bare percentage', () => {
    renderRow();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-label')).toBe('Calibration progress');
    expect(bar.getAttribute('aria-valuenow')).toBe('47');
  });

  it('does not announce the percentage a second time through the visible text', () => {
    renderRow();
    // The visible "47%" is a rendering of aria-valuenow, not separate information, so it is
    // marked decorative. Queried by text (not role) precisely because it should be absent from
    // the accessibility tree.
    const visible = screen.getByText('47%');
    expect(visible.getAttribute('aria-hidden')).toBe('true');
  });
});
