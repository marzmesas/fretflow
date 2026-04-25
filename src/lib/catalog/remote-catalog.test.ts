import { describe, expect, it } from "vitest";
import { buildMockRemoteCatalogPayload, normalizeRemoteCatalogPayload } from "./remote-catalog";

describe("remote-catalog", () => {
  it("normalizes the mock remote payload into catalog tracks", () => {
    const payload = buildMockRemoteCatalogPayload();
    const normalized = normalizeRemoteCatalogPayload(payload);
    expect(normalized.tracks.length).toBeGreaterThan(0);
    expect(normalized.tracks[0]?.id).toBe(payload.tracks[0]?.id);
    expect(normalized.migrationTarget.key).toBe("bundled_metadata_seed");
  });

  it("returns the default target and an empty list for invalid payloads", () => {
    expect(normalizeRemoteCatalogPayload({ schemaVersion: 2, tracks: [] })).toEqual({
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
      tracks: [],
    });
    expect(normalizeRemoteCatalogPayload(null).tracks).toEqual([]);
  });
});
