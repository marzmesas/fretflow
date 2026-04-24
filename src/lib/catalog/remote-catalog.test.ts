import { describe, expect, it } from "vitest";
import { buildMockRemoteCatalogPayload, normalizeRemoteCatalogPayload } from "./remote-catalog";

describe("remote-catalog", () => {
  it("normalizes the mock remote payload into catalog tracks", () => {
    const payload = buildMockRemoteCatalogPayload();
    const tracks = normalizeRemoteCatalogPayload(payload);
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0]?.id).toBe(payload.tracks[0]?.id);
  });

  it("returns an empty list for invalid payloads", () => {
    expect(normalizeRemoteCatalogPayload({ schemaVersion: 2, tracks: [] })).toEqual([]);
    expect(normalizeRemoteCatalogPayload(null)).toEqual([]);
  });
});
