import { describe, expect, it } from "vitest";
import type { SubscriptionState } from "../ipc";
import {
  getSubscriptionLifecycle,
  normalizeSubscriptionStatus,
} from "./subscription-lifecycle";

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

describe("subscription-lifecycle", () => {
  it("normalizes known statuses and rejects unknown ones", () => {
    expect(normalizeSubscriptionStatus("trialing")).toBe("trialing");
    expect(normalizeSubscriptionStatus("canceling")).toBe("canceling");
    expect(normalizeSubscriptionStatus("weird")).toBe("unknown");
  });

  it("prioritizes offline grace over the raw server status", () => {
    const lifecycle = getSubscriptionLifecycle(
      makeSubscription({
        subscriptionStatus: "past_due",
        offlineGraceActive: true,
        lastSyncOkUnixMs: Date.UTC(2025, 0, 1),
      }),
    );

    expect(lifecycle.tone).toBe("grace");
    expect(lifecycle.badgeLabel).toBe("Offline grace");
    expect(lifecycle.billingMomentLabel).toBe("Grace ends");
  });

  it("returns plan-specific messaging for trialing and canceled states", () => {
    expect(
      getSubscriptionLifecycle(
        makeSubscription({
          subscriptionStatus: "trialing",
          validUntilUnixMs: Date.UTC(2025, 0, 10),
        }),
      ).badgeLabel,
    ).toBe("Trial");

    expect(
      getSubscriptionLifecycle(
        makeSubscription({
          subscriptionStatus: "canceled",
          validUntilUnixMs: Date.UTC(2025, 0, 10),
        }),
      ).nextStep,
    ).toContain("free workflow");
  });
});
