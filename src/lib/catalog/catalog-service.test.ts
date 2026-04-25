import { describe, expect, it } from "vitest";
import {
  getCatalogMigrationTarget,
  getCatalogSnapshot,
  invalidateCatalogSnapshot,
  loadCatalogSnapshot,
} from "./catalog-service";

describe("catalog-service", () => {
  it("returns a sync snapshot with catalog metadata", () => {
    invalidateCatalogSnapshot();
    const snapshot = getCatalogSnapshot();
    expect(snapshot.migrationTarget.key).toBe("bundled_metadata_seed");
    expect(snapshot.tracks.length).toBeGreaterThan(0);
    expect(snapshot.skillTags.length).toBeGreaterThan(0);
    expect(snapshot.techniqueTags.length).toBeGreaterThan(0);
    expect(snapshot.playableBundledTracks.every((track) => track.tier === "free")).toBe(true);
  });

  it("exposes the same shape through the async loader", async () => {
    invalidateCatalogSnapshot();
    const snapshot = await loadCatalogSnapshot();
    expect(snapshot.tracks.length).toBe(getCatalogSnapshot().tracks.length);
    expect(snapshot.skillTags).toEqual(getCatalogSnapshot().skillTags);
  });

  it("exposes the remote migration target directly", () => {
    expect(getCatalogMigrationTarget().includesEntitlements).toBe(false);
    expect(getCatalogMigrationTarget().includesPremiumPreviewRows).toBe(true);
  });

  it("reuses the cached snapshot until invalidated", async () => {
    invalidateCatalogSnapshot();
    const first = await loadCatalogSnapshot();
    const second = getCatalogSnapshot();
    expect(second).toBe(first);

    invalidateCatalogSnapshot();
    const refreshed = getCatalogSnapshot();
    expect(refreshed).not.toBe(first);
    expect(refreshed.tracks).toEqual(first.tracks);
  });

  it("supports force-refresh through the async loader", async () => {
    invalidateCatalogSnapshot();
    const first = await loadCatalogSnapshot();
    const refreshed = await loadCatalogSnapshot({ forceRefresh: true });
    expect(refreshed).not.toBe(first);
    expect(refreshed.skillTags).toEqual(first.skillTags);
  });
});
