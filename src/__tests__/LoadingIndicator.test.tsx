// src/__tests__/LoadingIndicator.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider, Button } from '@chakra-ui/react';
import system from '../theme';
import { LoadingIndicator, LoadingIndicatorBars } from '../LoadingIndicator';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}

// Structural/accessibility assertions only — jsdom doesn't evaluate real CSS media queries,
// so prefers-reduced-motion is verified live in the browser (see
// docs/decisions/slant-take-design-system.md pass 7), not here.
describe('LoadingIndicator (section scale)', () => {
  it('exposes a status region with "Loading" as its accessible content', () => {
    render(<LoadingIndicator />, { wrapper });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading');
  });

  it('hides the decorative bars from assistive tech', () => {
    render(<LoadingIndicator />, { wrapper });
    const status = screen.getByRole('status');
    const hiddenNode = status.querySelector('[aria-hidden="true"]');
    expect(hiddenNode).toBeInTheDocument();
  });
});

describe('LoadingIndicatorBars (button scale)', () => {
  it('renders as purely decorative — no role or accessible content of its own', () => {
    render(<LoadingIndicatorBars />, { wrapper });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('button gets an explicit aria-label while loading, since the visible label is hidden', () => {
    const { rerender } = render(
      <Button loading={false} spinner={<LoadingIndicatorBars />} aria-label={undefined}>
        Log in
      </Button>,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();

    rerender(
      <ChakraProvider value={system}>
        <Button loading spinner={<LoadingIndicatorBars />} aria-label="Loading">
          Log in
        </Button>
      </ChakraProvider>
    );
    expect(screen.getByRole('button', { name: 'Loading' })).toBeInTheDocument();
  });
});
