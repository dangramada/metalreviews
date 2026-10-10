// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AotyContendersRedirect } from '../AotyContendersRedirect';

function renderAt(entry: string) {
  const router = createMemoryRouter(
    [
      { path: '/aoty/contenders', element: <AotyContendersRedirect /> },
      { path: '/aoty', element: <div>hub</div> },
    ],
    { initialEntries: [entry] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('AotyContendersRedirect', () => {
  it('goes to the Contenders tab of /aoty with replace', () => {
    const router = renderAt('/aoty/contenders');
    expect(screen.getByText('hub')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/aoty');
    expect(router.state.location.search).toBe('?view=contenders');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('keeps the whole search (?year and ?from) and adds view', () => {
    const router = renderAt('/aoty/contenders?year=2025&from=favorites');
    expect(router.state.location.search).toBe('?year=2025&from=favorites&view=contenders');
  });

  it('overrides a view that was already in the search', () => {
    const router = renderAt('/aoty/contenders?view=aoty&year=none');
    expect(router.state.location.search).toBe('?view=contenders&year=none');
  });
});
