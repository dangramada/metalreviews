// One-off correction for 7 confirmed-broken same-title-collision rows, same pattern as
// fix-khemmis-moonspell-release-group-2026-09-18.ts (step 1): each is a real album/EP whose
// stored or currently-resolving data traces to a promotional Single of the same title instead.
// Correct release-group ids were identified by hand via live research this session — this
// script does not re-derive them, it just fetches fresh enrichment for the known-correct id
// and writes it.
//
// Scope: exactly these 7 rows. Does not touch reviews. Does not touch Stormhammer (already
// correct — see the decision doc's Task 2), Sun Guts (deliberately left alone — Task 3), or
// the remaining 16 unconfirmed pairs (Task 4, automated artwork check only, no fix).
//
// Usage: npx tsx scripts/diagnostics/fix-7-confirmed-collision-rows-2026-09-18.ts

import { supabase } from '../supabaseClient';
import { lookupMusicBrainzByReleaseGroupId } from '../musicbrainz';
import { releaseDatePrecision } from '../ingest';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CORRECTIONS = [
  { band: 'Yes', album: 'Aurora', correctReleaseGroupId: '96a132b5-1e90-4ac9-87cf-73d696fb7bc5' },
  { band: 'Shadowborne', album: 'Heaven’s Falling', correctReleaseGroupId: '84bf95c1-f2d4-4d6b-aafb-90d6c043a240' },
  { band: 'Elder', album: 'Through Zero', correctReleaseGroupId: '3fd4d36a-9fef-4bd0-b822-3eb14a150078' },
  { band: 'Black Veil Brides', album: 'Vindicate', correctReleaseGroupId: 'a6a02c12-2016-435c-ad3d-e7f999829eb8' },
  { band: 'Haken', album: 'In a Fever Dream', correctReleaseGroupId: '44df52ad-cf1a-425f-8b27-583d60d851a9' },
  { band: 'Cancer Bats', album: 'Give Me Dirt', correctReleaseGroupId: '7fb3424d-975d-41f2-8559-6c0a6f631fc3' },
  { band: 'Flotsam and Jetsam', album: 'Rats in the Temple', correctReleaseGroupId: 'fe4f7edb-5ea6-4f53-9a9a-c62341694504' },
];

async function main() {
  for (const c of CORRECTIONS) {
    console.log(`\n=== ${c.band} — ${c.album} ===`);

    const { data: dupRows, error: dupErr } = await supabase
      .from('albums')
      .select('id, band, album')
      .eq('mb_release_group_id', c.correctReleaseGroupId);
    if (dupErr) throw dupErr;
    if (dupRows.length > 0) {
      console.log(`  DUPLICATE-ID CHECK: ${dupRows.length} existing row(s) already hold this release-group id:`, dupRows);
    } else {
      console.log('  Duplicate-id check: none — no other album already holds this release-group id.');
    }

    const { data: rows, error } = await supabase
      .from('albums')
      .select('*')
      .ilike('band', c.band)
      .ilike('album', c.album);
    if (error) throw error;
    if (rows.length !== 1) throw new Error(`Expected exactly 1 row for ${c.band} — ${c.album}, found ${rows.length}`);
    const before = rows[0];
    console.log('  Before:', { mb_release_group_id: before.mb_release_group_id, release_date: before.release_date, artwork_url: before.artwork_url, genre: before.genre });

    const fresh = await lookupMusicBrainzByReleaseGroupId(c.correctReleaseGroupId);
    if (fresh.status !== 'ok') throw new Error(`MB fetch for ${c.band} — ${c.album} returned status ${fresh.status}`);

    const genre = fresh.genres.length > 0 ? fresh.genres : before.genre;
    const artwork_url = fresh.artworkUrl ?? before.artwork_url;
    const release_date =
      releaseDatePrecision(fresh.releaseDate) >= releaseDatePrecision(before.release_date)
        ? fresh.releaseDate
        : before.release_date;

    const { error: updateErr } = await supabase
      .from('albums')
      .update({
        mb_release_group_id: c.correctReleaseGroupId,
        release_date,
        artwork_url,
        genre,
      })
      .eq('id', before.id);
    if (updateErr) throw updateErr;

    const { data: afterRows, error: afterErr } = await supabase.from('albums').select('*').eq('id', before.id);
    if (afterErr) throw afterErr;
    console.log('  After:', { mb_release_group_id: afterRows[0].mb_release_group_id, release_date: afterRows[0].release_date, artwork_url: afterRows[0].artwork_url, genre: afterRows[0].genre });

    await sleep(1000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
