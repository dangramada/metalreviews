import { runIngestion } from './ingest.js';
import cron from 'node-cron';

cron.schedule('0 7,19 * * *', () => {
  console.log('⏰ Running scheduled ingestion...');
  runIngestion().catch((e) => console.warn('Failed to load reviews', e));
});

runIngestion().catch((err) => console.error('Initial ingestion error:', err));
