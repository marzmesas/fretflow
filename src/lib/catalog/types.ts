/** Stub catalog (Phase 5); server entitlements will replace this shape later. */

export type CatalogTierId = "free" | "premium";

export type CatalogDifficulty = "beginner" | "easy" | "intermediate" | "advanced";

export type CatalogSkillTag =
  | "timing"
  | "single_note"
  | "fretting"
  | "scales"
  | "chords"
  | "rhythm"
  | "riffs"
  | "arpeggios"
  | "legato"
  | "string_skipping"
  | "endurance";

export type CatalogTechniqueTag =
  | "alternate_picking"
  | "finger_independence"
  | "position_shift"
  | "chord_switching"
  | "power_chords"
  | "shuffle_feel"
  | "string_skipping"
  | "hammer_on"
  | "pull_off"
  | "arpeggio_shapes"
  | "sustain_control";

export type CatalogTrackStub = {
  id: string;
  title: string;
  artist: string;
  tier: CatalogTierId;
  /** When true, row shows locked UI even if tier is free (e.g. coming soon). */
  locked?: boolean;
  /**
   * `demo` = embedded `DEMO_CHART` in Practice.
   * `bundled` = fetch `/charts/<bundledChartFile>` (files under `static/charts/`).
   * `none` = locked / no Practice chart.
   */
  practiceChartKey: "demo" | "none" | "bundled";
  /** Required when `practiceChartKey === "bundled"` — filename only (e.g. `one-note.json`). */
  bundledChartFile?: string;
  difficulty?: CatalogDifficulty;
  /** Approximate duration in seconds (for display). */
  durationSec?: number;
  /** Curriculum metadata for local pathing now and API-backed catalogs later. */
  skillTags?: CatalogSkillTag[];
  techniqueTags?: CatalogTechniqueTag[];
  prerequisiteTrackIds?: string[];
  targetBpm?: number;
  masteryAccuracyThreshold?: number;
};
