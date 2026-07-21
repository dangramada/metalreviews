import express from 'express';
import cors from 'cors';
import path from 'path';
import { runIngestion } from './scripts/ingest.js';
import { lookupMusicBrainz } from './scripts/musicbrainz.js';
import { supabase } from './scripts/supabaseClient.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'dist')));

let ingesting = false;

// Pure helper — exported for unit testing only.
// Caller is GitHub Actions (see .github/workflows/ingest.yml), never a browser,
// so the secret lives only in the GH Actions/Render env — see
// docs/decisions/ingest-trigger-and-security.md Section 3/5 (Option C).
export function isAuthorized(
  token: string | string[] | undefined,
  secret: string | undefined
): boolean {
  const normalized = Array.isArray(token) ? token[0] : token;
  if (!normalized || !secret) return false;
  return normalized === secret;
}

// Warn once at startup so the operator notices immediately if the secret is missing.
// Without it every POST /api/ingest call returns 401 and the scheduled GitHub Actions run fails.
if (!process.env.INGEST_SECRET_TOKEN) {
  console.warn('INGEST_SECRET_TOKEN is not set — POST /api/ingest will always return 401');
}

app.post('/api/ingest', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
  if (!isAuthorized(token, process.env.INGEST_SECRET_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (ingesting) {
    res.status(409).json({ status: 'busy', message: 'Ingest already running' });
    return;
  }
  ingesting = true;
  res.status(202).json({ status: 'running' });
  runIngestion()
    .catch((e) => console.error('Ingest error:', e))
    .finally(() => {
      ingesting = false;
    });
});

// Returns the current ingest state so the frontend can poll for completion
// rather than guessing based on reviews.json content changes.
app.get('/api/ingest/status', (_req, res) => {
  res.json({ status: ingesting ? 'running' : 'idle' });
});

// Look up MusicBrainz enrichment data (artwork, genres, release date, release-group id)
// for a user-supplied band + album. Auth is validated via the caller's Supabase session
// JWT — never the shared INGEST_SECRET_TOKEN, which is a server-only secret.
// No DB write happens here; the client checks for an existing album match (by
// releaseGroupId or norm_key) and inserts into albums/favorites directly via RLS.
app.post('/api/manual-album-lookup', async (req, res) => {
  // Extract Bearer token from Authorization header
  const authHeader = req.headers['authorization'];
  const token =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  // Validate the user's JWT against Supabase auth — auth.getUser(jwt) verifies
  // the token server-side without trusting any user-supplied user_id in the body.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  const { band, album } = (req.body ?? {}) as { band?: unknown; album?: unknown };
  if (typeof band !== 'string' || typeof album !== 'string' || !band.trim() || !album.trim()) {
    res
      .status(400)
      .json({ error: 'Request body must include non-empty "band" and "album" strings' });
    return;
  }

  // A failed MB lookup is not an error — returns nulls, client proceeds without enrichment.
  const { artworkUrl, genres, releaseDate, releaseGroupId } = await lookupMusicBrainz(
    band.trim(),
    album.trim()
  );

  res.json({ artworkUrl, genre: genres, releaseDate, releaseGroupId });
});

// Catch-all for client-side routes: serve index.html so React Router handles
// paths like /login and /auth/callback when typed directly in the address bar.
// Must come after all /api/* routes — Express matches in registration order.
app.get(/.*/, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
