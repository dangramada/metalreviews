// Frontend-only Supabase client. Uses the publishable (anon) key — safe to bundle
// into browser code. Vite exposes these via import.meta.env at build time.
//
// Do NOT use the secret key (SUPABASE_SECRET_KEY) here — it bypasses RLS and
// must never ship to the browser. That key lives in scripts/supabaseClient.ts only.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  // This fires at module load time in development — catches a missing VITE_ prefix
  // silently producing `undefined` rather than waiting for the first query to fail.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Check that both are set in .env and prefixed with VITE_.'
  );
}

export const supabase = createClient(url, key);
