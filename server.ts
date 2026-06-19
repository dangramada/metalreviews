import express from 'express';
import cors from 'cors';
import path from 'path';
import { runIngestion } from './scripts/ingest.js';

const app = express();
app.use(cors());
app.use(express.static(path.resolve(process.cwd(), 'dist')));

let ingesting = false;

app.post('/api/ingest', (_req, res) => {
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
