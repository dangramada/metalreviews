// One-off correction (step 1 of 2) for the two confirmed-broken rows found by
// docs/decisions/album-identity/album-identity-same-title-release-group-collision.md's
// manual check: Step A's ambiguous search picked the wrong release-group for these two
// albums. The correct release-group ids were already identified by hand — this script does
// not re-derive them, it just fetches fresh enrichment for the known-correct id and writes it.
//
// Scope: exactly these two rows. Does not touch reviews, and does not touch the other 27
// flagged-but-unconfirmed pairs (Devin Townsend/Wormwood already confirmed fine; the rest
// unconfirmed).
//
// Usage: npx tsx scripts/diagnostics/fix-khemmis-moonspell-release-group-2026-09-18.ts

import { supabase } from '../supabaseClient';
import { lookupMusicBrainzByReleaseGroupId } from '../musicbrainz';
import { releaseDatePrecision } from '../ingest';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CORRECTIONS = [
  { band: 'Khemmis', album: 'Khemmis', correctReleaseGroupId: '66eda96e-276a-46b5-a4bf-46bb8b201b28' },
  { band: 'Moonspell', album: 'Far from God', correctReleaseGroupId: 'aebc070b-e3a1-4042-8f93-da01fc26fda8' },
];

async function main() {
  for (const c of CORRECTIONS) {
    console.log(`\n=== ${c.band} — ${c.album} ===`);

    // Duplicate-id guard: this correction must not quietly merge into a pre-existing row.
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

    // Same non-regression guard as applyAlbumEnrichment in ingest.ts, applied to all three
    // enrichment fields — not just genre. A fresh empty/null/coarser value must never
    // downgrade what's already stored (this is a manual correction, not a fresh-album
    // creation, so "already stored" here still means the OLD wrong release-group's data —
    // but the guard is about never losing ground on a field the fresh fetch didn't
    // improve, exactly the same rule ingest.ts applies on every run).
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

    await sleep(1000); // MB rate limit before the next correction's fetch
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
