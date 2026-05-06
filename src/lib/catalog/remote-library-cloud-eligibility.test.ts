import { describe, expect, it } from "vitest";
import {
  filterCloudEligibleRemoteLibraryMutation,
  filterCloudEligibleRemoteLibraryState,
  isCloudEligibleLibraryTrackId,
} from "./remote-library-cloud-eligibility";

describe("remote library cloud eligibility", () => {
  it("treats imported user chart ids as local-only", () => {
    expect(isCloudEligibleLibraryTrackId("bundled-one-note")).toBe(true);
    expect(isCloudEligibleLibraryTrackId("user-123")).toBe(false);
  });

  it("filters local-only ids out of remote library snapshots", () => {
    expect(
      filterCloudEligibleRemoteLibraryState({
        schemaVersion: 1,
        revision: 4,
        favorites: ["bundled-one-note", "user-123"],
        collections: [
          {
            id: "set-a",
            name: "Set A",
            createdAt: "2026-01-01T00:00:00.000Z",
            trackIds: ["bundled-one-note", "user-123"],
          },
        ],
      }),
    ).toEqual({
      schemaVersion: 1,
      revision: 4,
      favorites: ["bundled-one-note"],
      collections: [
        {
          id: "set-a",
          name: "Set A",
          createdAt: "2026-01-01T00:00:00.000Z",
          trackIds: ["bundled-one-note"],
        },
      ],
    });
  });

  it("skips mutation writes for imported track ids", () => {
    expect(
      filterCloudEligibleRemoteLibraryMutation({
        kind: "favorite_set",
        trackId: "user-123",
        value: true,
      }),
    ).toBeNull();

    expect(
      filterCloudEligibleRemoteLibraryMutation({
        kind: "collection_create",
        collectionId: "set-a",
        name: "Set A",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      kind: "collection_create",
      collectionId: "set-a",
      name: "Set A",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
