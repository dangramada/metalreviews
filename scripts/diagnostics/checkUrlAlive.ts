// Extracted from revalidate-artwork-2026-09-17.ts so refresh-dead-artwork-2026-10-03.ts can
// reuse it — that script runs main() at import time, so it can't be imported from directly.
import axios from 'axios';

// `probeUrl` exposes the raw status/content-type so a report can print them; `checkUrlAlive`
// is the original boolean, derived from it with the identical rule (2xx + image/*).
// Same 8000ms CAA timeout as musicbrainz.ts's CAA calls — CAA responses redirect through
// archive.org, which has been observed to hang indefinitely during a degraded state rather
// than failing fast (docs/decisions/artwork.md, "CAA request timeout", 2026-08-01).
export async function probeUrl(
  url: string
): Promise<{ status: number | null; contentType: string }> {
  try {
    const res = await axios.get(url, { timeout: 8000, validateStatus: () => true });
    return { status: res.status, contentType: res.headers['content-type'] ?? '' };
  } catch {
    // Any network failure (timeout, DNS, connection refused) counts as dead on this attempt,
    // same as a bad status or wrong content-type — all three feed the same retry-once path.
    return { status: null, contentType: '' };
  }
}

export async function checkUrlAlive(url: string): Promise<boolean> {
  const { status, contentType } = await probeUrl(url);
  if (status === null || status < 200 || status >= 300) return false;
  return contentType.startsWith('image/');
}
