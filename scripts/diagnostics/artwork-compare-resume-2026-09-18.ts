// Resumes artwork-compare-remaining-16-2026-09-18.ts for the 2 pairs that hung on the prior
// run (The Hu, Devil Master) — CAA/archive.org's documented "hangs indefinitely" failure mode.
// Adds a hard AbortController timeout since axios's own `timeout` option didn't reliably fire.
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

async function fetchArtworkUrl(releaseGroupId: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await axios.get(`https://coverartarchive.org/release-group/${releaseGroupId}`, {
      headers: { 'User-Agent': MB_USER_AGENT },
      signal: controller.signal,
    });
    return pickArtwork(res.data?.images ?? []);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': MB_USER_AGENT }, signal: controller.signal });
    fs.writeFileSync(destPath, res.data);
    return true;
  } catch (e) {
    console.log(`    download failed/timed out: ${(e as Error).message}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

const TARGETS = [
  { slug: 'the_hu_hun', band: 'The Hu', album: 'Hun', candidates: [
    { id: '2c4307d0-0d42-4848-afad-ada40dad6f63', type: 'Album' },
    { id: 'a868a0b4-b300-490f-a89f-4a6886987f23', type: 'EP' },
  ]},
  { slug: 'devil_master_bloody_dreams', band: 'Devil Master', album: 'Bloody Dreams', candidates: [
    { id: '3e4b84ab-266d-4b64-b783-e472cb48e8b1', type: 'EP' },
    { id: 'a6d20910-bb0a-43de-a6df-482d52b9853e', type: 'EP' },
  ]},
];

async function main() {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.band} — ${t.album} ===`);
    const paths: (string | null)[] = [];
    for (let i = 0; i < t.candidates.length; i++) {
      const c = t.candidates[i];
      const artUrl = await fetchArtworkUrl(c.id);
      console.log(`  candidate ${i} (${c.id}, ${c.type}): ${artUrl ?? 'NO ART'}`);
      if (artUrl) {
        const ext = artUrl.split('.').pop()?.split('?')[0] || 'jpg';
        const destPath = `${OUT_DIR}/${t.slug}_${i}.${ext}`;
        const ok = await downloadImage(artUrl, destPath);
        paths.push(ok ? destPath : null);
      } else {
        paths.push(null);
      }
    }
    const validPaths = paths.filter((p): p is string => !!p);
    if (validPaths.length >= 2) {
      const montagePath = `${OUT_DIR}/${t.slug}_montage.jpg`;
      const images = await Promise.all(validPaths.slice(0, 2).map((p) => sharp(p).resize(400, 400, { fit: 'contain', background: '#fff' }).toBuffer()));
      await sharp({ create: { width: 810, height: 400, channels: 3, background: '#fff' } })
        .composite([{ input: images[0], left: 0, top: 0 }, { input: images[1], left: 410, top: 0 }])
        .jpeg()
        .toFile(montagePath);
      console.log(`  montage: ${montagePath}`);
    } else {
      console.log(`  montage: skipped (only ${validPaths.length} of ${paths.length} candidates have art)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
