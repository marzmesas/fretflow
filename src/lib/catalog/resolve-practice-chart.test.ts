import { describe, expect, it } from "vitest";
import { resolvePracticeChart } from "./resolve-practice-chart";
import type { SubscriptionState } from "../ipc";
import type { CatalogTrackStub } from "./types";

function makeSubscription(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    schemaVersion: 1,
    apiBaseUrl: "http://127.0.0.1:8787",
    graceDays: 7,
    subscriptionStatus: "none",
    tier: null,
    validUntilUnixMs: null,
    lastSyncOkUnixMs: 0,
    lastSyncError: null,
    lastSyncSucceeded: false,
    offlineGraceActive: false,
    entitled: false,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<CatalogTrackStub> = {}): CatalogTrackStub {
  return {
    id: "premium-blues",
    title: "Blues turnaround in A",
    artist: "Catalog preview",
    tier: "premium",
    practiceChartKey: "bundled",
    bundledChartFile: "blues-shuffle.json",
    premiumAccessIds: ["pro", "blues_pack"],
    ...overrides,
  };
}

describe("resolve-practice-chart", () => {
  it("blocks premium tracks when the viewer is not entitled", () => {
    const resolved = resolvePracticeChart("premium-blues", {
      catalogTracks: [makeTrack()],
      subscription: makeSubscription(),
    });

    expect(resolved.trackRequestInvalid).toBe(true);
    expect(resolved.catalogTrackId).toBeNull();
  });

  it("allows premium bundled charts when entitlement is active", () => {
    const resolved = resolvePracticeChart("premium-blues", {
      catalogTracks: [makeTrack()],
      subscription: makeSubscription({
        entitled: true,
        subscriptionStatus: "active",
      }),
    });

    expect(resolved.trackRequestInvalid).toBe(false);
    expect(resolved.catalogTrackId).toBe("premium-blues");
    expect(resolved.bundledChartUrl).toBe("/charts/blues-shuffle.json");
  });

  it("treats missing explicit catalog tracks as invalid instead of falling back to a shared seed lookup", () => {
    const resolved = resolvePracticeChart("premium-blues", {
      catalogTracks: [],
      subscription: makeSubscription({
        entitled: true,
        subscriptionStatus: "active",
      }),
    });

    expect(resolved.trackRequestInvalid).toBe(true);
    expect(resolved.catalogTrackId).toBeNull();
  });
});
