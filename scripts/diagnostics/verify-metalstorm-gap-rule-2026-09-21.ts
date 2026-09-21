// One-off diagnostic (read-only, writes nothing): verifies the release→review gap rule that
// replaced the calendar-year rule in filterMetalStormBackCatalogue (src/App.tsx). Compares both
// rules' verdicts against real Metal Storm rows and flags any row where they disagree — the fix
// is expected to be a superset-compatible change (never stricter for a promptly-reviewed album),
// so any flip is worth a look. See docs/decisions/metalstorm-backcatalogue-exclusion.md and the
// 2026-09-21 gap-rule fix brief.
//
// Usage: npx tsx scripts/diagnostics/verify-metalstorm-gap-rule-2026-09-21.ts

import { supabase } from '../supabaseClient';

const GAP_MS = 365 * 24 * 60 * 60 * 1000;

async function main() {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, band, album, published_at, albums!inner(release_date)')
    .eq('source', 'Metal Storm');
  if (error) throw error;

  type Row = {
    id: string;
    band: string;
    album: string;
    published_at: string | null;
    albums: { release_date: string | null };
  };
  const rows = data as unknown as Row[];
  const currentYear = new Date().getFullYear();

  console.log(`Total Metal Storm reviews: ${rows.length}\n`);

  let hiddenByGap = 0;
  let flips = 0;

  for (const row of rows) {
    const rd = row.albums.release_date;
    const pa = row.published_at;
    const oldHidden = rd !== null && parseInt(rd.substring(0, 4), 10) !== currentYear;

    let newHidden = false;
    let gapDays: number | null = null;
    if (rd && pa) {
      const gap = new Date(pa).getTime() - new Date(rd).getTime();
      gapDays = Math.round(gap / (24 * 60 * 60 * 1000));
      newHidden = gap > GAP_MS;
    }

    if (newHidden) hiddenByGap++;
    if (oldHidden !== newHidden) {
      flips++;
      console.log(
        `FLIP: ${row.band} — ${row.album} | release_date=${rd} published_at=${pa} gapDays=${gapDays} oldHidden=${oldHidden} newHidden=${newHidden}`
      );
    }
  }

  console.log(`\nHidden under new gap rule: ${hiddenByGap}`);
  console.log(`Rows where old-rule vs new-rule verdict differs: ${flips}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
