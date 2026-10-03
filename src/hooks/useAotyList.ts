import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { CONTENDERS_SELECT, toFavoriteListItem, type ContenderRow } from './useContendersList';
import type { AotyMember } from '../lib/aoty/aotyView';

// `aoty` has a foreign key only to `contenders` (composite), not to `albums`, so PostgREST cannot
// embed albums from it (PGRST200). Two steps instead: read the membership rows, then fetch those
// albums through the contenders -> albums embed ContendersPage already uses (CONTENDERS_SELECT,
// a relationship that exists). Chosen over a nested `aoty -> contenders -> albums` embed because
// that shape could not be demonstrated against real rows (the table was empty when tried), while
// this reuses a proven one. Membership rows only: no rank/score/year is stored
// (docs/decisions/aoty/aoty-list-implementation.md), buildAotyView derives the rest.

export function useAotyList() {
  const [items, setItems] = useState<AotyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Bumped by every local mutation. A refetch that started before the latest mutation carries
  // pre-mutation data, so its response is dropped rather than undoing the local change; the
  // refetch each write triggers after its own mutation is the one that lands.
  const mutationGen = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Optimistic-from-write-result updates: the page applies a successful write here immediately,
  // then refetches in the background to reconcile.
  const addLocal = useCallback((added: AotyMember[]) => {
    if (!mounted.current) return;
    mutationGen.current += 1;
    setItems((prev) => {
      const ids = new Set(added.map((a) => a.albumId));
      return [...added, ...prev.filter((i) => !ids.has(i.albumId))];
    });
  }, []);
  const removeLocal = useCallback((albumIds: string[]) => {
    if (!mounted.current) return;
    mutationGen.current += 1;
    setItems((prev) => prev.filter((i) => !albumIds.includes(i.albumId)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Only the first load shows the spinner/error; a background refetch (refreshKey > 0) is
    // silent and, if it fails, keeps what the page already shows.
    const silent = refreshKey > 0;
    const startedAtGen = mutationGen.current;
    const stale = () => cancelled || mutationGen.current !== startedAtGen;

    async function load() {
      try {
        const { data: aotyRows, error: fetchError } = await supabase
          .from('aoty')
          .select('album_id, created_at')
          .order('created_at', { ascending: false });
        if (stale()) return;
        if (fetchError) {
          if (!silent) {
            setError('Failed to load AOTY');
            setLoading(false);
          }
          return;
        }
        const members = (aotyRows ?? []) as { album_id: string; created_at: string | null }[];
        if (members.length === 0) {
          setItems([]);
          setLoading(false);
          return;
        }
        const { data: contenderRows, error: albumsError } = await supabase
          .from('contenders')
          .select(CONTENDERS_SELECT)
          .in(
            'album_id',
            members.map((m) => m.album_id)
          );
        if (stale()) return;
        if (albumsError) {
          if (!silent) {
            setError('Failed to load AOTY');
            setLoading(false);
          }
          return;
        }
        const byId = new Map(
          ((contenderRows ?? []) as unknown as ContenderRow[]).map((r) => [r.album_id, r])
        );
        setItems(
          members.flatMap((m) => {
            const row = byId.get(m.album_id);
            return row ? [{ ...toFavoriteListItem(row), createdAt: m.created_at ?? '' }] : [];
          })
        );
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load AOTY', e);
        if (!silent) {
          setError('Failed to load AOTY');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return {
    items,
    loading,
    error,
    addLocal,
    removeLocal,
    refetch: () => setRefreshKey((k) => k + 1),
  };
}
