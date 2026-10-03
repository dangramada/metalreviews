// Pure pieces of the shared year scope, kept free of App/React imports so Header can use them
// without a module cycle. The hook is src/hooks/useYearScope.ts.

// A release year, or 'none' for albums without a usable release year.
export type Scope = number | 'none';

export const serializeScope = (s: Scope) => String(s);

// Well-formed values only. Whether a year actually has data is the hook's concern.
export function parseYearParam(raw: string | null): Scope | null {
  if (raw === 'none') return 'none';
  return raw !== null && /^\d{1,4}$/.test(raw) ? Number(raw) : null;
}

export const scopeLabel = (s: Scope) => (s === 'none' ? 'No release year' : String(s));
