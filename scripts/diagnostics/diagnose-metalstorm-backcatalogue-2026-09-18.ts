// One-off diagnostic (read-only, writes nothing): counts how many existing Metal Storm reviews
// would be hidden under the proposed back-catalogue rule (release_date resolves to a known year
// that isn't the current calendar year), broken down by year. Answers the blast-radius question
// before designing the "hide Metal Storm back-catalogue reviews" feature — same diagnostic-first
// norm as diagnose-release-group-genre-yield-2026-09-18.ts.
//
// Year extraction inlined rather than importing src/App.tsx's getReleaseYear() — that function
// is 3 lines (parseInt on the leading 4 chars) and this script is throwaway; the real
// implementation must still reuse getReleaseYear() per the brief.
//
// Usage: npx tsx scripts/diagnostics/diagnose-metalstorm-backcatalogue-2026-09-18.ts

import { supabase } from '../supabaseClient';

function getReleaseYear(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.substring(0, 4), 10);
  return isNaN(year) ? null : year;
}

async function main() {
  const currentYear = new Date().getFullYear();

  const { data, error } = await supabase
    .from('reviews')
    .select('id, band, album, published_at, albums!inner(release_date)')
    .eq('source', 'Metal Storm');
  if (error) throw error;

  type Row = { id: string; band: string; album: string; published_at: string | null; albums: { release_date: string | null } };
  const rows = data as unknown as Row[];

  console.log(`Total Metal Storm reviews: ${rows.length}`);
  console.log(`Current calendar year (evaluated now): ${currentYear}\n`);

  const byYear = new Map<number, number>();
  let nullReleaseDate = 0;
  let currentYearCount = 0;
  let hiddenCount = 0;

  for (const row of rows) {
    const year = getReleaseYear(row.albums.release_date);
    if (year === null) {
      nullReleaseDate++;
      continue;
    }
    if (year === currentYear) {
      currentYearCount++;
      continue;
    }
    hiddenCount++;
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }

  console.log('--- Breakdown ---');
  console.log(`release_date null (shown, fail-safe): ${nullReleaseDate}`);
  console.log(`release_date = current year ${currentYear} (shown): ${currentYearCount}`);
  console.log(`release_date = non-current year (HIDDEN under proposed rule): ${hiddenCount}`);
  console.log('\nHidden reviews by year:');
  for (const year of [...byYear.keys()].sort()) {
    console.log(`  ${year}: ${byYear.get(year)}`);
  }

  console.log('\n--- Hidden review detail ---');
  for (const row of rows) {
    const year = getReleaseYear(row.albums.release_date);
    if (year !== null && year !== currentYear) {
      console.log(`  ${row.band} — ${row.album} (release_date year: ${year})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
