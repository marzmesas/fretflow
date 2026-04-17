/** Stub catalog (Phase 5); server entitlements will replace this shape later. */

export type CatalogTierId = "free" | "premium";

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
};
