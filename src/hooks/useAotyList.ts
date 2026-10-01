import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: aotyRows, error: fetchError } = await supabase
          .from('aoty')
          .select('album_id, created_at')
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (fetchError) {
          setError('Failed to load AOTY');
          setLoading(false);
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
        if (cancelled) return;
        if (albumsError) {
          setError('Failed to load AOTY');
          setLoading(false);
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
        setError('Failed to load AOTY');
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { items, loading, error, refetch: () => setRefreshKey((k) => k + 1) };
}
