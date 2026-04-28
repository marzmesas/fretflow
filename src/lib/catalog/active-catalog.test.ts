import { describe, expect, it, vi } from "vitest";
import {
  findTrackInSnapshot,
  loadActiveCatalogSnapshot,
  resolveActiveCatalog,
} from "./active-catalog";
import type { AppSession, SubscriptionState } from "../ipc";

function makeSession(overrides: Partial<AppSession> = {}): AppSession {
  return {
    schemaVersion: 1,
    signedIn: false,
    authKind: null,
    displayName: null,
    signedInAtUnixMs: null,
    entitlements: [],
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

describe("active-catalog", () => {
  it("keeps local seed when auth is not ready", () => {
    expect(resolveActiveCatalog(makeSession(), makeSubscription()).sourceMode).toBe("local_seed");
  });

  it("defaults to remote when service url and non-dev auth are both active", () => {
    expect(
      resolveActiveCatalog(
        makeSession({
          signedIn: true,
          authKind: "email",
        }),
        makeSubscription({
          apiBaseUrl: "http://127.0.0.1:8787",
        }),
      ).sourceMode,
    ).toBe("remote_api");
  });

  it("loads the active snapshot using the resolved source mode", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        migrationTarget: {
          schemaVersion: 1,
          key: "bundled_metadata_seed",
          label: "Remote seed",
          includesPremiumPreviewRows: true,
          includesPlayablePremiumTracks: true,
          includesEntitlements: true,
          includesImportedCharts: false,
          includesPracticeAssets: false,
        },
        tracks: [
          {
            id: "bundled-one-note",
            title: "One open low E",
            artist: "Fretflow",
            tier: "free",
            practiceChartKey: "bundled",
            bundledChartFile: "one-note.json",
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const snapshot = await loadActiveCatalogSnapshot({
      session: makeSession({
        signedIn: true,
        authKind: "email",
      }),
      subscription: makeSubscription({
        apiBaseUrl: "http://127.0.0.1:8787",
      }),
      forceRefresh: true,
      fetchImpl,
    });

    expect(snapshot.sourceMode).toBe("remote_api");
    expect(findTrackInSnapshot(snapshot, "bundled-one-note")?.title).toBe("One open low E");
  });
});
