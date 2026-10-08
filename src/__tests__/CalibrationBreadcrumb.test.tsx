// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import system from '../theme';
import { CalibrationBreadcrumb } from '../components/criteria-calibration/CalibrationPageHeader';

const renderCrumb = (from: string | null) =>
  render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <CalibrationBreadcrumb from={from} />
      </MemoryRouter>
    </ChakraProvider>
  );

describe('CalibrationBreadcrumb', () => {
  it('?from=contenders links to the Contenders tab of the AOTY hub', () => {
    renderCrumb('contenders');
    expect(screen.getByRole('link', { name: 'Contenders' })).toHaveAttribute(
      'href',
      '/aoty?view=contenders'
    );
  });

  it('?from=aoty links to /aoty, and no source falls back to Favorites', () => {
    const first = renderCrumb('aoty');
    expect(screen.getByRole('link', { name: 'AOTY' })).toHaveAttribute('href', '/aoty');
    first.unmount();
    renderCrumb(null);
    expect(screen.getByRole('link', { name: 'Favorites' })).toHaveAttribute('href', '/favorites');
  });
});
