import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../supabaseClient';
import { logSkippedPost } from '../ingest';

// Builds a supabase.from('skipped_posts') mock covering both call shapes
// logSkippedPost uses: the dedup lookup (.select().eq('url', ...).maybeSingle())
// and the insert itself.
function makeSkippedPostsFromImpl(options: { existingRow?: { id: string } | null }) {
  const { existingRow = null } = options;
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    impl: (table: string) => {
      if (table !== 'skipped_posts') throw new Error(`unexpected table ${table}`);
      return { select, insert };
    },
    insert,
    eq,
  };
}

describe('logSkippedPost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs a new post (no existing row for its URL)', async () => {
    const { impl, insert, eq } = makeSkippedPostsFromImpl({ existingRow: null });
    vi.mocked(supabase.from).mockImplementation(impl);

    await logSkippedPost('Angry Metal Guy', {
      title: 'Record(s) o’ the Month – May 2026',
      link: 'https://www.angrymetalguy.com/records-o-the-month-may-2026/',
    });

    expect(eq).toHaveBeenCalledWith('url', 'https://www.angrymetalguy.com/records-o-the-month-may-2026/');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://www.angrymetalguy.com/records-o-the-month-may-2026/' })
    );
  });

  it('does not re-insert a post already logged for the same URL', async () => {
    const { impl, insert } = makeSkippedPostsFromImpl({ existingRow: { id: 'existing-log-1' } });
    vi.mocked(supabase.from).mockImplementation(impl);

    await logSkippedPost('Angry Metal Guy', {
      title: 'Record(s) o’ the Month – May 2026',
      link: 'https://www.angrymetalguy.com/records-o-the-month-may-2026/',
    });

    expect(insert).not.toHaveBeenCalled();
  });
});
