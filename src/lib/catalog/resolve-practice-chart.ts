import { DEMO_CHART } from "$lib/chart/demo-chart";
import type { FretflowChartV1 } from "$lib/chart/types";
import { MOCK_CATALOG } from "./mock-catalog";

export type ResolvedPracticeChart = {
  chart: FretflowChartV1;
  /** Set when a Library free row opened Practice with this id. */
  catalogTrackId: string | null;
  /** `?track=` was set but id is unknown or not playable (e.g. premium). */
  trackRequestInvalid: boolean;
};

/**
 * Map `?track=` from Library (or future deep links) to chart data.
 * Unknown or locked ids fall back to the embedded demo chart.
 */
export function resolvePracticeChart(trackId: string | null | undefined): ResolvedPracticeChart {
  const id = typeof trackId === "string" && trackId.trim() !== "" ? trackId.trim() : null;
  if (!id) {
    return { chart: DEMO_CHART, catalogTrackId: null, trackRequestInvalid: false };
  }
  const row = MOCK_CATALOG.find((r) => r.id === id);
  if (!row || row.tier === "premium" || row.practiceChartKey !== "demo") {
    return { chart: DEMO_CHART, catalogTrackId: null, trackRequestInvalid: true };
  }
  return {
    chart: { ...DEMO_CHART, title: row.title },
    catalogTrackId: id,
    trackRequestInvalid: false,
  };
}
