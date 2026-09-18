// One-off, read-only artwork comparison for the 16 same-title-collision pairs not yet
// individually researched (Task 4 of the 2026-09-18 fix-7/pin-Stormhammer/note-Sun-Guts
// session). For each pair, fetches Cover Art Archive artwork for BOTH candidate
// release-groups (release-group-level lookup only, no tier-3 sibling sweep — this is a
// lightweight triage check, not the production enrichment path) and saves a side-by-side
// montage per pair for manual visual comparison. No fix, no write.
//
// Usage: npx tsx scripts/diagnostics/artwork-compare-remaining-16-2026-09-18.ts

import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';

const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';
const OUT_DIR = '/private/tmp/claude-501/-Users-gdi-Developer-metalreviews/ebbf11db-4772-4e6d-83c3-727e46e98fc7/scratchpad/artwork-compare';

function pickArtwork(images: any[]): string | null {
  const front = images.find((img: any) => img.front === true);
  if (front) return front.image;
  const approved = images.find((img: any) => img.approved === true);
  return approved?.image ?? null;
}

const REMAINING_16 = [
  'Apogean|Waste Where Life Begins',
  'Solace|Fading Failing Ruin',
  'Dysgnostic|End Whispers',
  'DevilDriver|Strike And Kill',
  'Electric Sun Defence|Estuary',
  'Inferi|Heaven Wept',
  'Pro-Pain|Stone Cold Anger',
  'Imperium|Exodus Unknown',
  'Green Lung|Necropolitan',
  'Phase Meridian|Egregore',
  'Xandria|Eclipse',
  'Opeth|Sorceress',
  'Tyraels Ascension|Grave Seeker',
  'Beseech|Future Present Past',
  'The Hu|Hun',
  'Devil Master|Bloody Dreams',
];

async function fetchArtworkUrl(releaseGroupId: string): Promise<string | null> {
  try {
    const res = await axios.get(`https://coverartarchive.org/release-group/${releaseGroupId}`, {
      headers: { 'User-Agent': MB_USER_AGENT },
      timeout: 8000,
    });
    return pickArtwork(res.data?.images ?? []);
  } catch {
    return null;
  }
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': MB_USER_AGENT }, timeout: 15000 });
    fs.writeFileSync(destPath, res.data);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = JSON.parse(
    fs.readFileSync('docs/data/album-identity/remaining-25-collision-raw-data-2026-09-18.json', 'utf-8')
  );

  const summary: any[] = [];

  for (const key of REMAINING_16) {
    const [band, album] = key.split('|');
    const entry = data.find((r: any) => r.band === band && r.album === album);
    if (!entry) {
      console.log(`SKIP: ${band} — ${album} not found in raw data`);
      continue;
    }

    console.log(`\n=== ${band} — ${album} ===`);
    const slug = key.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const paths: (string | null)[] = [];

    for (let i = 0; i < entry.candidates.length; i++) {
      const c = entry.candidates[i];
      const artUrl = await fetchArtworkUrl(c.releaseGroupId);
      console.log(`  candidate ${i} (${c.releaseGroupId}, ${c.primaryType}): ${artUrl ?? 'NO ART'}`);
      if (artUrl) {
        const ext = artUrl.split('.').pop()?.split('?')[0] || 'jpg';
        const destPath = `${OUT_DIR}/${slug}_${i}.${ext}`;
        const ok = await downloadImage(artUrl, destPath);
        paths.push(ok ? destPath : null);
      } else {
        paths.push(null);
      }
    }

    let montagePath: string | null = null;
    const validPaths = paths.filter((p): p is string => !!p);
    if (validPaths.length >= 2) {
      montagePath = `${OUT_DIR}/${slug}_montage.jpg`;
      const images = await Promise.all(validPaths.slice(0, 2).map((p) => sharp(p).resize(400, 400, { fit: 'contain', background: '#fff' }).toBuffer()));
      await sharp({ create: { width: 810, height: 400, channels: 3, background: '#fff' } })
        .composite([
          { input: images[0], left: 0, top: 0 },
          { input: images[1], left: 410, top: 0 },
        ])
        .jpeg()
        .toFile(montagePath);
      console.log(`  montage: ${montagePath}`);
    } else {
      console.log(`  montage: skipped (only ${validPaths.length} of ${paths.length} candidates have art)`);
    }

    summary.push({ band, album, candidateArtCount: validPaths.length, totalCandidates: paths.length, montagePath });
  }

  fs.writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
  console.log('\n--- Summary ---');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
