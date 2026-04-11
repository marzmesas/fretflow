import type { FretflowChartV1 } from "./types";

/** Session handoff: Chart QA (or other tools) → Practice one-shot load. */
export const PENDING_PRACTICE_CHART_KEY = "fretflow.pendingPracticeChart.v1";

export function stageChartForPractice(chart: FretflowChartV1): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PENDING_PRACTICE_CHART_KEY, JSON.stringify(chart));
}

/**
 * Returns raw JSON string if a chart was staged, and removes the key.
 * Caller must parse and validate.
 */
export function consumePendingPracticeChartJson(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(PENDING_PRACTICE_CHART_KEY);
  if (raw != null) {
    sessionStorage.removeItem(PENDING_PRACTICE_CHART_KEY);
  }
  return raw;
}
