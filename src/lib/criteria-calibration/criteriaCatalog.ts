// Adapter between the criteria/criteria_levels reference tables (public read, seeded in
// supabase/criteria.sql) and the engine's Profile-based types. A new file for the UI-wiring
// pass — it consumes preferenceGraph.ts's Profile type but doesn't modify any locked engine
// module (preferenceGraph/solver/simplex/questionOrdering/accuracyTiers/calibrationSession/
// elicitationDriver).
//
// `criteria.id` is the same 0-5 criterionIndex used throughout the engine (see
// supabase/criteria.sql's comment), so entries are indexed by id directly rather than by
// query row order — robust even if a future edit changes display_order relative to id.

import type { CriterionData } from '../../components/criteria-calibration/CriterionRow.js';
import type { Profile } from './preferenceGraph.js';

export interface CriterionLevelInfo {
  label: string;
  description: string;
}

export interface CriterionCatalogEntry {
  index: number;
  name: string;
  levels: Record<number, CriterionLevelInfo>;
}

export interface CriteriaCatalog {
  /** Dense, index-aligned with criterionIndex (entries[i].index === i). */
  entries: CriterionCatalogEntry[];
  /** Index-aligned with entries — count of levels per criterion, as the engine expects. */
  levelsPerCriterion: number[];
}

/** Shape of one `criteria` row as returned by the embedded Supabase select in useCriteriaCatalog.ts. */
export interface RawCriterionRow {
  id: number;
  name: string;
  display_order: number;
  criteria_levels: { level: number; label: string; description: string }[];
}

// Raw `criteria_levels.description` text is stored lowercase with no trailing punctuation
// (see supabase/criteria.sql, e.g. "doesn't leave much of a feeling behind"). Every render site
// that shows this text (CriterionLevelPicker, CriterionRow/OptionCard, RatingSummaryView,
// MobileRatingLayout) wants sentence case + a trailing period, so the transform lives here once
// rather than as five one-off fixes — see docs/decisions/album-rating-page.md's retouch-pass
// entry. Labels get the same uppercase treatment at each site via CSS `textTransform`, not a
// string transform, since that's non-destructive and doesn't need a shared helper.
export function formatLevelDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return trimmed;
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function buildCriteriaCatalog(rows: RawCriterionRow[]): CriteriaCatalog {
  const entries: CriterionCatalogEntry[] = [];
  for (const row of rows) {
    const levels: Record<number, CriterionLevelInfo> = {};
    for (const lvl of row.criteria_levels) {
      levels[lvl.level] = { label: lvl.label, description: lvl.description };
    }
    entries[row.id] = { index: row.id, name: row.name, levels };
  }
  const levelsPerCriterion = entries.map((entry) => Object.keys(entry.levels).length);
  return { entries, levelsPerCriterion };
}

/**
 * Converts an engine Profile into the CriterionData[] OptionCard/ComparisonRow already
 * expect. Sorted by criterion index so both sides of a comparison render their criteria in
 * the same order (profiles being compared are always the same degree, and in practice the
 * same criteria set, so this lines the two cards up row-for-row).
 */
export function profileToCriterionData(
  profile: Profile,
  catalog: CriteriaCatalog
): CriterionData[] {
  return Object.keys(profile)
    .map(Number)
    .sort((a, b) => a - b)
    .map((criterionIndex) => {
      const entry = catalog.entries[criterionIndex];
      const levelInfo = entry.levels[profile[criterionIndex]];
      return {
        label: entry.name,
        levelName: levelInfo.label,
        description: levelInfo.description,
      };
    });
}
