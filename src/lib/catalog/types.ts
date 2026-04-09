/** Stub catalog (Phase 5); server entitlements will replace this shape later. */

export type CatalogTierId = "free" | "premium";

export type CatalogTrackStub = {
  id: string;
  title: string;
  artist: string;
  tier: CatalogTierId;
  /** When true, row shows locked UI even if tier is free (e.g. coming soon). */
  locked?: boolean;
  /** Practice route uses embedded demo until per-track charts ship. */
  practiceChartKey: "demo" | "none";
};
