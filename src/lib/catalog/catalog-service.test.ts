import { describe, expect, it, vi } from "vitest";
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
    expect(snapshot.sourceMode).toBe("local_seed");
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

  it("loads the remote catalog behind an explicit flag", async () => {
    invalidateCatalogSnapshot();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        migrationTarget: {
          schemaVersion: 1,
          key: "bundled_metadata_seed",
          label: "Bundled metadata seed",
          includesPremiumPreviewRows: true,
          includesPlayablePremiumTracks: false,
          includesEntitlements: false,
          includesImportedCharts: false,
          includesPracticeAssets: false,
        },
        tracks: [
          {
            id: "remote-track",
            title: "Remote Track",
            artist: "Fretflow",
            tier: "free",
            practiceChartKey: "bundled",
            bundledChartFile: "remote-track.json",
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const snapshot = await loadCatalogSnapshot({
      sourceMode: "remote_api",
      apiBaseUrl: "http://127.0.0.1:8787",
      fetchImpl,
    });

    expect(snapshot.sourceMode).toBe("remote_api");
    expect(snapshot.tracks[0]?.id).toBe("remote-track");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
