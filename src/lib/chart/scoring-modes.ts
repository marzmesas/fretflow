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

export type TimingGrade = "perfect" | "great" | "good" | "ok";

const GRADE_THRESHOLDS: { grade: TimingGrade; maxAbsMs: number }[] = [
  { grade: "perfect", maxAbsMs: 20 },
  { grade: "great", maxAbsMs: 50 },
  { grade: "good", maxAbsMs: 100 },
  { grade: "ok", maxAbsMs: Infinity },
];

export function gradeHitTiming(absDeltaMs: number): TimingGrade {
  for (const t of GRADE_THRESHOLDS) {
    if (absDeltaMs <= t.maxAbsMs) return t.grade;
  }
  return "ok";
}

export const GRADE_LABEL: Record<TimingGrade, string> = {
  perfect: "Perfect",
  great: "Great",
  good: "Good",
  ok: "OK",
};

export const GRADE_COLOR: Record<TimingGrade, string> = {
  perfect: "#facc15",
  great: "#3dd68c",
  good: "#3d8bfd",
  ok: "#8b93a7",
};
