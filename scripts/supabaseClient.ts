import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { MetalReview } from '../src/types';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables. ' +
      'Add them to .env in the project root.'
  );
}

// Service key bypasses RLS — only use in server-side / ingest code, never in the frontend.
export const supabase = createClient<{ public: { Tables: { reviews: { Row: MetalReview } } } }>(
  url,
  key
);
