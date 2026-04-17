/** Timing windows for MIDI (and mic rhythm) vs chart note starts — milliseconds */

export type ScoringModeId = "practice" | "performance";

export const TIMING_BY_MODE: Record<ScoringModeId, { earlyMs: number; lateMs: number }> = {
  practice: { earlyMs: 140, lateMs: 200 },
  performance: { earlyMs: 50, lateMs: 70 },
};

export const SCORING_MODE_LABEL: Record<ScoringModeId, string> = {
  practice: "Practice (wide timing)",
  performance: "Performance (tight timing)",
};

/** @deprecated Use SCORING_MODE_LABEL instead */
export const MIDI_SCORING_LABEL: Record<ScoringModeId, string> = SCORING_MODE_LABEL;
