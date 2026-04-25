import { describe, expect, it } from "vitest";
import { getCatalogTrackAccess } from "./entitlement-overlay";
import type { CatalogTrackStub } from "./types";
import type { SubscriptionState } from "../ipc";

function makeTrack(overrides: Partial<CatalogTrackStub> = {}): CatalogTrackStub {
  return {
    id: "track-1",
    title: "Track 1",
    artist: "Fretflow",
    tier: "free",
    practiceChartKey: "bundled",
    bundledChartFile: "track-1.json",
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    schemaVersion: 1,
    apiBaseUrl: "",
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

describe("catalog entitlement overlay", () => {
  it("keeps free playable tracks available", () => {
    expect(getCatalogTrackAccess(makeTrack(), null)).toMatchObject({
      state: "available",
      canPractice: true,
    });
  });

  it("treats premium tracks as entitlement-locked before availability checks", () => {
    expect(
      getCatalogTrackAccess(
        makeTrack({
          tier: "premium",
          practiceChartKey: "none",
        }),
        makeSubscription({ entitled: false }),
      ),
    ).toMatchObject({
      state: "premium_locked",
      isPremiumLocked: true,
      canPractice: false,
    });
  });

  it("treats premium tracks without assets as coming soon when entitled", () => {
    expect(
      getCatalogTrackAccess(
        makeTrack({
          tier: "premium",
          practiceChartKey: "none",
        }),
        makeSubscription({ entitled: true, subscriptionStatus: "active" }),
      ),
    ).toMatchObject({
      state: "coming_soon",
      isComingSoon: true,
      canPractice: false,
    });
  });
});
