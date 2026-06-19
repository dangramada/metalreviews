import express from 'express';
import cors from 'cors';
import path from 'path';
import { runIngestion } from './scripts/ingest.js';

const app = express();
app.use(cors());
app.use(express.static(path.resolve(process.cwd(), 'dist')));

let ingesting = false;

// Pure helper — exported for unit testing only.
// PHASE 5 NOTE: this token check is intentionally weak. Once auth ships,
// replace this with a server-side session check so the secret never needs
// to be sent from the browser (it can't be kept secret via VITE_ env vars).
export function isAuthorized(
  token: string | string[] | undefined,
  secret: string | undefined
): boolean {
  const normalized = Array.isArray(token) ? token[0] : token;
  if (!normalized || !secret) return false;
  return normalized === secret;
}

// Warn once at startup so the operator notices immediately if the secret is missing.
// Without it every POST /api/ingest call returns 401 and the refresh button never works.
if (!process.env.INGEST_SECRET_TOKEN) {
  console.warn('INGEST_SECRET_TOKEN is not set — POST /api/ingest will always return 401');
}

app.post('/api/ingest', (req, res) => {
  const token = req.headers['x-ingest-token'];
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

// Catch-all for client-side routes: serve index.html so React Router handles
// paths like /login and /auth/callback when typed directly in the address bar.
// Must come after all /api/* routes — Express matches in registration order.
app.get(/.*/, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
