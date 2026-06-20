# Session decisions — Persistent review history (June 2026, superseded)

> **Superseded by the Supabase migration (June 2026).** Kept here for historical record only — the merge guard logic described below was preserved and extracted into `applyMergeGuard()`. See `docs/decisions/supabase-migration.md` for the current implementation. The JSON file is no longer the write target and no longer exists in the repo.

The original implementation merged fresh results into `public/reviews.json` so history beyond the current RSS window was preserved. The merge key was `computeId()` (stable band+album hash). The merge guard prevented artwork/genre regressions on transient MB failures.
