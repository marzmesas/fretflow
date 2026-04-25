import { describe, expect, it } from "vitest";
import { getCatalogMigrationTarget, getCatalogSnapshot, loadCatalogSnapshot } from "./catalog-service";

describe("catalog-service", () => {
  it("returns a sync snapshot with catalog metadata", () => {
    const snapshot = getCatalogSnapshot();
    expect(snapshot.migrationTarget.key).toBe("bundled_metadata_seed");
    expect(snapshot.tracks.length).toBeGreaterThan(0);
    expect(snapshot.skillTags.length).toBeGreaterThan(0);
    expect(snapshot.techniqueTags.length).toBeGreaterThan(0);
    expect(snapshot.playableBundledTracks.every((track) => track.tier === "free")).toBe(true);
  });

  it("exposes the same shape through the async loader", async () => {
    const snapshot = await loadCatalogSnapshot();
    expect(snapshot.tracks.length).toBe(getCatalogSnapshot().tracks.length);
    expect(snapshot.skillTags).toEqual(getCatalogSnapshot().skillTags);
  });

  it("exposes the remote migration target directly", () => {
    expect(getCatalogMigrationTarget().includesEntitlements).toBe(false);
    expect(getCatalogMigrationTarget().includesPremiumPreviewRows).toBe(true);
  });
});
