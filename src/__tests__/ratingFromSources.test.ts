import { describe, it, expect } from 'vitest';
import { resolveBackDestination } from '../lib/navigation/ratingFromSources';

describe('resolveBackDestination (Album Evaluation breadcrumb source)', () => {
  it('?from=contenders returns to the Contenders tab of the AOTY hub', () => {
    expect(resolveBackDestination('contenders')).toEqual({
      href: '/aoty?view=contenders',
      sourceLabel: 'Contenders',
    });
  });

  it('?from=aoty returns to /aoty', () => {
    expect(resolveBackDestination('aoty')).toEqual({ href: '/aoty', sourceLabel: 'AOTY' });
  });

  it('an unknown or missing source falls back to Favorites', () => {
    expect(resolveBackDestination('nope').href).toBe('/favorites');
    expect(resolveBackDestination(null).href).toBe('/favorites');
  });
});
