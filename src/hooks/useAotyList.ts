import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { AotyMember } from '../lib/aoty/aotyView';
import type { FavoriteListItem } from './useFavoritesList';

// AOTY is a subset of Contenders (composite FK), so membership is the only thing read here
// (`aoty`: album_id, created_at). The albums themselves come from the Contenders pool the caller
// already holds, filtered by membership: one pool read serves both lists instead of a second
// contenders -> albums embed per page (docs/decisions/aoty/aoty-list-implementation.md). No
// rank/score/year is stored, buildAotyView derives the rest. A member missing from the pool (the
// FK should make that impossible) is skipped, as the old second read did.

interface Options {
  pool: FavoriteListItem[];
  poolLoading: boolean;
  poolError: string | null;
}

type Member = { albumId: string; createdAt: string };

export function useAotyList({ pool, poolLoading, poolError }: Options) {
  const [members, setMembers] = useState<Member[]>([]);
  const [idsLoading, setIdsLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
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
    const ids = new Set(added.map((a) => a.albumId));
    setMembers((prev) => [
      ...added.map((a) => ({ albumId: a.albumId, createdAt: a.createdAt })),
      ...prev.filter((m) => !ids.has(m.albumId)),
    ]);
  }, []);
  const removeLocal = useCallback((albumIds: string[]) => {
    if (!mounted.current) return;
    mutationGen.current += 1;
    setMembers((prev) => prev.filter((m) => !albumIds.includes(m.albumId)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Only the first load shows the spinner/error; a background refetch (refreshKey > 0) is
    // silent and, if it fails, keeps what the page already shows. A retry after a failed first
    // load is also a refetch, so a success clears the error.
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
        setIdsLoading(false);
        if (fetchError) {
          if (!silent) setMembersError('Failed to load AOTY');
          return;
        }
        setMembers(
          ((aotyRows ?? []) as { album_id: string; created_at: string | null }[]).map((m) => ({
            albumId: m.album_id,
            createdAt: m.created_at ?? '',
          }))
        );
        setMembersError(null);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load AOTY', e);
        setIdsLoading(false);
        if (!silent) setMembersError('Failed to load AOTY');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // A failed ids read leaves this empty (callers then show every contender).
  const aotyIds = useMemo(() => new Set(members.map((m) => m.albumId)), [members]);
  const items = useMemo<AotyMember[]>(() => {
    const byId = new Map(pool.map((i) => [i.albumId, i]));
    return members.flatMap((m) => {
      const item = byId.get(m.albumId);
      return item ? [{ ...item, createdAt: m.createdAt }] : [];
    });
  }, [pool, members]);

  return {
    items,
    aotyIds,
    idsLoading,
    loading: idsLoading || poolLoading,
    error: poolError ?? membersError,
    addLocal,
    removeLocal,
    refetch: () => setRefreshKey((k) => k + 1),
  };
}
