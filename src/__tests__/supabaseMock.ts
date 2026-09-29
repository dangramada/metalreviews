import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// supabase.from() mocks across these tests only ever implement the chain methods a
// given test actually exercises (select/insert/eq/order/...), never the full
// PostgrestQueryBuilder interface — tsc flags each one as a shape mismatch. This
// centralizes that one cast instead of an @ts-expect-error at every mockImplementation
// call site.
export function mockSupabaseFrom(from: SupabaseClient['from'], impl: (table: string) => unknown) {
  vi.mocked(from).mockImplementation(impl as never);
}
