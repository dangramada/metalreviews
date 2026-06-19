// One-time migration: seed Supabase reviews table from public/reviews.json.
// Safe to re-run — upsert on conflict id means existing rows are updated, not duplicated.
import { promises as fs } from 'fs';
import path from 'path';
import { supabase } from './supabaseClient';
import { toDbRow } from './ingest';
import type { MetalReview } from '../src/types';

const jsonPath = path.resolve(process.cwd(), 'public', 'reviews.json');

const raw = await fs.readFile(jsonPath, 'utf-8');
const reviews: MetalReview[] = JSON.parse(raw);

console.log(`Seeding ${reviews.length} reviews from reviews.json…`);

const { error } = await supabase
  .from('reviews')
  .upsert(reviews.map(toDbRow), { onConflict: 'id' });

if (error) {
  console.error('Seed failed:', error.message);
  process.exit(1);
}

console.log(`✅ Seeded ${reviews.length} reviews to Supabase`);
