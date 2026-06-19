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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
