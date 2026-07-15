# Session decisions — Persistent review history (June 2026, superseded)

> **SUPERSEDED by `supabase-migration.md`.** The JSON-merge-guard approach was replaced by Supabase; the merge-guard logic itself was preserved and extracted into `applyMergeGuard()`. The JSON file is no longer the write target and no longer exists in the repo.

The original implementation merged fresh results into `public/reviews.json` so history beyond the current RSS window was preserved. The merge key was `computeId()` (stable band+album hash). The merge guard prevented artwork/genre regressions on transient MB failures.
