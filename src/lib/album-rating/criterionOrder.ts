// Fixed criterion display order for the Album Rating Page (not user-configurable, not the
// criteria table's own `display_order`). Verified against real catalog ids in
// supabase/criteria.sql: 0=Innovation, 1=Emotional impact, 2=Performance, 3=Coherence,
// 4=Production, 5=Songwriting. The brief's descriptive names map onto these ids as:
// Emotional impact -> Instrumental+Vocal (Performance) -> Production -> Songwriting ->
// Innovation -> Coherence. See docs/decisions/album-rating-page.md.
export const FIXED_CRITERION_ORDER: number[] = [1, 2, 4, 5, 0, 3];
