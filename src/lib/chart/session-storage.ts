import type { ScoringModeId } from "./scoring-modes";

const LAST_KEY = "fretflow.lastSession.v1";
const HISTORY_KEY = "fretflow.sessionHistory.v1";
const MAX_HISTORY = 50;

export type SessionSummaryV1 = {
  schemaVersion: 1;
  at: string;
  chartTitle: string;
  scoringMode: ScoringModeId;
  hits: number;
  misses: number;
  accuracyPercent: number;
  maxCombo: number;
  totalNotes?: number;
  inputSource?: string;
};

export function saveLastSession(summary: SessionSummaryV1): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(summary));
  } catch {
    /* private mode / quota */
  }
  appendSessionHistory(summary);
}

export function loadLastSession(): SessionSummaryV1 | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as SessionSummaryV1;
    if (o?.schemaVersion !== 1) return null;
    return o;
  } catch {
    return null;
  }
}

function appendSessionHistory(summary: SessionSummaryV1): void {
  try {
    const history = loadSessionHistory();
    history.unshift(summary);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* quota / private mode */
  }
}

export function loadSessionHistory(): SessionSummaryV1[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (o: unknown) =>
        o != null &&
        typeof o === "object" &&
        (o as SessionSummaryV1).schemaVersion === 1,
    ) as SessionSummaryV1[];
  } catch {
    return [];
  }
}

export function clearSessionHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}

export function getSessionStats(history: SessionSummaryV1[]): {
  totalSessions: number;
  averageAccuracy: number | null;
  bestAccuracy: number | null;
  bestCombo: number;
  uniqueCharts: number;
} {
  if (history.length === 0) {
    return { totalSessions: 0, averageAccuracy: null, bestAccuracy: null, bestCombo: 0, uniqueCharts: 0 };
  }
  let sumAcc = 0;
  let bestAcc = 0;
  let bestCombo = 0;
  const charts = new Set<string>();
  for (const s of history) {
    sumAcc += s.accuracyPercent;
    bestAcc = Math.max(bestAcc, s.accuracyPercent);
    bestCombo = Math.max(bestCombo, s.maxCombo);
    charts.add(s.chartTitle);
  }
  return {
    totalSessions: history.length,
    averageAccuracy: Math.round(sumAcc / history.length),
    bestAccuracy: bestAcc,
    bestCombo,
    uniqueCharts: charts.size,
  };
}
