import { DEMO_CHART } from "$lib/chart/demo-chart";
import type { FretflowChartV1 } from "$lib/chart/types";
import { findCatalogTrackById } from "./catalog-service";
import { resolveUserChart } from "./user-charts";

export type ResolvedPracticeChart = {
  chart: FretflowChartV1;
  /** Set when a Library free row opened Practice with this id. */
  catalogTrackId: string | null;
  /** `?track=` was set but id is unknown or not playable (e.g. premium). */
  trackRequestInvalid: boolean;
  /** When set, Practice loads this URL then replaces `chart` (bundled static JSON). */
  bundledChartUrl: string | null;
};

/**
 * Map `?track=` from Library (or future deep links) to chart data.
 * Unknown or locked ids fall back to the embedded demo chart.
 */
export function resolvePracticeChart(trackId: string | null | undefined): ResolvedPracticeChart {
  const id = typeof trackId === "string" && trackId.trim() !== "" ? trackId.trim() : null;
  if (!id) {
    return {
      chart: DEMO_CHART,
      catalogTrackId: null,
      trackRequestInvalid: false,
      bundledChartUrl: null,
    };
  }
  // User-imported charts (stored in localStorage).
  if (id.startsWith("user-")) {
    const userChart = resolveUserChart(id);
    if (userChart) {
      return {
        chart: userChart,
        catalogTrackId: id,
        trackRequestInvalid: false,
        bundledChartUrl: null,
      };
    }
    return {
      chart: DEMO_CHART,
      catalogTrackId: null,
      trackRequestInvalid: true,
      bundledChartUrl: null,
    };
  }

  const row = findCatalogTrackById(id);
  if (!row || row.tier === "premium") {
    return {
      chart: DEMO_CHART,
      catalogTrackId: null,
      trackRequestInvalid: true,
      bundledChartUrl: null,
    };
  }
  if (row.practiceChartKey === "none") {
    return {
      chart: DEMO_CHART,
      catalogTrackId: null,
      trackRequestInvalid: true,
      bundledChartUrl: null,
    };
  }
  if (row.practiceChartKey === "bundled") {
    const file = row.bundledChartFile?.trim();
    if (!file || file.includes("/") || file.includes("..")) {
      return {
        chart: DEMO_CHART,
        catalogTrackId: null,
        trackRequestInvalid: true,
        bundledChartUrl: null,
      };
    }
    return {
      chart: { ...DEMO_CHART, title: row.title },
      catalogTrackId: id,
      trackRequestInvalid: false,
      bundledChartUrl: `/charts/${file}`,
    };
  }
  return {
    chart: { ...DEMO_CHART, title: row.title },
    catalogTrackId: id,
    trackRequestInvalid: false,
    bundledChartUrl: null,
  };
}
