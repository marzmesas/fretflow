import type { ScoringModeId } from "./scoring-modes";

const STORAGE_KEY = "fretflow.lastSession.v1";

export type SessionSummaryV1 = {
  schemaVersion: 1;
  at: string;
  chartTitle: string;
  scoringMode: ScoringModeId;
  hits: number;
  misses: number;
  accuracyPercent: number;
  maxCombo: number;
  /** Added later — total notes in the chart at the time of the run. */
  totalNotes?: number;
  /** e.g. "midi", "mic-pitch", "mic-rhythm" — absent in older sessions. */
  inputSource?: string;
};

export function saveLastSession(summary: SessionSummaryV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    /* private mode / quota */
  }
}

export function loadLastSession(): SessionSummaryV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as SessionSummaryV1;
    if (o?.schemaVersion !== 1) return null;
    return o;
  } catch {
    return null;
  }
}
