import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getReleaseYear } from '../App';
import { useAuth } from '../AuthContext';
import { parseYearParam, serializeScope, type Scope } from '../lib/aoty/yearScope';
import type { FavoriteListItem } from './useFavoritesList';

// The release year as one shared scope for /aoty and /aoty/contenders. Always derived from
// albums.release_date, never stored; the only persisted state is the `?year=` URL param
// (docs/decisions/aoty/aoty-list-implementation.md, "Year as a shared scope").

export const scopeOf = (releaseDate: string | null): Scope => getReleaseYear(releaseDate) ?? 'none';

function pickMostCommon(counts: Map<number, number>): number | null {
  let best: number | null = null;
  for (const [year, n] of counts) {
    if (best === null || n > counts.get(best)! || (n === counts.get(best)! && year > best)) {
      best = year;
    }
  }
  return best;
}

function yearCounts(items: FavoriteListItem[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const i of items) {
    const y = getReleaseYear(i.releaseDate);
    if (y !== null) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return counts;
}

// Most AOTY members; else most contenders; ties go to the latest year. Never reads today's date.
// Undated albums are a default only when they are all there is.
function defaultScope(pool: FavoriteListItem[], aotyIds: Set<string>): Scope | null {
  const year =
    pickMostCommon(yearCounts(pool.filter((i) => aotyIds.has(i.albumId)))) ??
    pickMostCommon(yearCounts(pool));
  return year ?? (pool.length > 0 ? 'none' : null);
}

// `seen` is the URL value this scope was resolved against.
interface Pin {
  uid: string | null;
  scope: Scope | null;
  seen: string | null;
}

// `pool` is the unfiltered contenders list (AOTY is a subset of it); `aotyIds` is the live id
// set, so addLocal/removeLocal are reflected at once. `ready` is true once both have loaded.
//
// The scope is resolved once and then pinned: promoting or moving albums later changes counts but
// never the displayed scope. It is re-resolved only on mount, an account change, or when the URL
// value itself changes (back button, a link carrying another year). A pinned scope that becomes
// empty stays put and shows its empty state.
export function useYearScope({
  pool,
  aotyIds,
  ready,
}: {
  pool: FavoriteListItem[];
  aotyIds: Set<string>;
  ready: boolean;
}) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [params, setParams] = useSearchParams();
  const raw = params.get('year');
  const [pin, setPin] = useState<Pin | null>(null);

  const available = useMemo(() => new Set(pool.map((i) => scopeOf(i.releaseDate))), [pool]);

  // Set-state-during-render: the documented pattern for state derived from props. A null scope
  // (empty pool) re-resolves once the pool has content.
  if (ready) {
    const resolve = () => {
      const asked = parseYearParam(raw);
      const next = asked !== null && available.has(asked) ? asked : defaultScope(pool, aotyIds);
      setPin({ uid, scope: next, seen: raw });
    };
    if (pin === null || pin.uid !== uid || (pin.scope === null && pool.length > 0)) resolve();
    else if (raw !== pin.seen) {
      // The URL now says what is already pinned (our own write, or the same year typed in):
      // nothing to re-resolve, just note it.
      if (parseYearParam(raw) === pin.scope) setPin({ ...pin, seen: raw });
      else resolve();
    }
  }

  const scope = pin?.scope ?? null;

  // Selector options: every scope value in the pool, plus the pinned one while it is empty.
  const options = useMemo(() => {
    const all = new Set(available);
    if (scope !== null) all.add(scope);
    const years = [...all].filter((s): s is number => s !== 'none').sort((a, b) => b - a);
    return all.has('none') ? [...years, 'none' as const] : years;
  }, [available, scope]);
  const spansMany = options.length > 1;

  // Write the resolved scope into the URL (replace, no history entry) so the header link and a
  // reload carry it.
  useEffect(() => {
    if (scope === null || !spansMany || raw === serializeScope(scope)) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('year', serializeScope(scope));
        return next;
      },
      { replace: true }
    );
  }, [scope, spansMany, raw, setParams]);

  function setYear(next: Scope) {
    setPin((p) => ({ uid, scope: next, seen: p?.seen ?? null }));
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('year', serializeScope(next));
        return p;
      },
      { replace: true }
    );
  }

  const inScope = useCallback(
    (item: FavoriteListItem) => scope === null || scopeOf(item.releaseDate) === scope,
    [scope]
  );

  return {
    scope,
    setYear,
    options,
    spansMany,
    inScope,
    // For links to the other screen; empty when there is only one scope value to choose from.
    scopeSearch: scope !== null && spansMany ? `?year=${serializeScope(scope)}` : '',
  };
}
