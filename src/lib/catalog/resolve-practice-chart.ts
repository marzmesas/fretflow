import { DEMO_CHART } from "../chart/demo-chart";
import type { FretflowChartV1 } from "../chart/types";
import type { SubscriptionState } from "../ipc";
import { getCatalogTrackAccess } from "./entitlement-overlay";
import type { CatalogTrackStub } from "./types";
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
export function resolvePracticeChart(
  trackId: string | null | undefined,
  options: {
    catalogTracks?: CatalogTrackStub[];
    subscription?: SubscriptionState | null;
  } = {},
): ResolvedPracticeChart {
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

  const row = options.catalogTracks?.find((track) => track.id === id) ?? null;
  if (!row) {
    return {
      chart: DEMO_CHART,
      catalogTrackId: null,
      trackRequestInvalid: true,
      bundledChartUrl: null,
    };
  }
  const access = getCatalogTrackAccess(row, options.subscription ?? null);
  if (!access.canPractice) {
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
