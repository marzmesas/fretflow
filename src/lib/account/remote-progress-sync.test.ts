import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveLastSession } from "../chart/session-storage";
import { syncRemoteProgressAfterPracticeSession } from "./remote-progress-sync";
import type { AppSession, SubscriptionState } from "../ipc";

describe("remote progress auto sync", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
        removeItem(key: string) {
          store.delete(key);
        },
      },
    });
  });

  const session: AppSession = {
    schemaVersion: 1,
    signedIn: true,
    authKind: "email",
    accountId: "acct_123",
    email: "player@example.com",
    displayName: "Player",
    signedInAtUnixMs: 1,
    entitlements: [],
  };

  const subscription: SubscriptionState = {
    schemaVersion: 1,
    apiBaseUrl: "http://127.0.0.1:8787",
    graceDays: 0,
    subscriptionStatus: "active",
    tier: "pro",
    validUntilUnixMs: null,
    lastSyncOkUnixMs: 1,
    lastSyncError: null,
    lastSyncSucceeded: true,
    offlineGraceActive: false,
    entitled: true,
  };

  function seedLocalSession(trackId: string, at: string): void {
    saveLastSession({
      schemaVersion: 1,
      at,
      chartTitle: trackId,
      practiceTrackId: trackId,
      scoringMode: "practice",
      hits: 18,
      misses: 2,
      accuracyPercent: 90,
      maxCombo: 10,
    });
  }

  it("skips automatic sync without a signed-in account", async () => {
    const result = await syncRemoteProgressAfterPracticeSession({
      session: null,
      subscription,
    });

    expect(result.status).toBe("skipped");
    if (result.status === "skipped") {
      expect(result.reason).toBe("guest");
    }
  });

  it("uploads local progress when the cloud snapshot is empty", async () => {
    seedLocalSession("bundled-one-note", "2026-04-29T10:00:00.000Z");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          lastUpdatedAt: "1970-01-01T00:00:00.000Z",
          sessionHistory: [],
          learningPathProgress: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          lastUpdatedAt: "2026-04-29T10:00:01.000Z",
          sessionHistory: [
            {
              schemaVersion: 1,
              at: "2026-04-29T10:00:00.000Z",
              chartTitle: "bundled-one-note",
              practiceTrackId: "bundled-one-note",
              scoringMode: "practice",
              hits: 18,
              misses: 2,
              accuracyPercent: 90,
              maxCombo: 10,
            },
          ],
          learningPathProgress: [],
        }),
      }) as unknown as typeof fetch;

    const result = await syncRemoteProgressAfterPracticeSession({
      session,
      subscription,
      fetchImpl,
    });

    expect(result.status).toBe("synced");
    if (result.status === "synced") {
      expect(result.mode).toBe("upload");
    }
  });

  it("merges local and remote progress when the snapshots diverge", async () => {
    seedLocalSession("bundled-one-note", "2026-04-29T10:00:00.000Z");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          lastUpdatedAt: "2026-04-29T09:00:00.000Z",
          sessionHistory: [
            {
              schemaVersion: 1,
              at: "2026-04-29T09:00:00.000Z",
              chartTitle: "bundled-chromatic",
              practiceTrackId: "bundled-chromatic",
              scoringMode: "practice",
              hits: 16,
              misses: 4,
              accuracyPercent: 80,
              maxCombo: 8,
            },
          ],
          learningPathProgress: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          lastUpdatedAt: "2026-04-29T10:00:01.000Z",
          sessionHistory: [
            {
              schemaVersion: 1,
              at: "2026-04-29T10:00:00.000Z",
              chartTitle: "bundled-one-note",
              practiceTrackId: "bundled-one-note",
              scoringMode: "practice",
              hits: 18,
              misses: 2,
              accuracyPercent: 90,
              maxCombo: 10,
            },
            {
              schemaVersion: 1,
              at: "2026-04-29T09:00:00.000Z",
              chartTitle: "bundled-chromatic",
              practiceTrackId: "bundled-chromatic",
              scoringMode: "practice",
              hits: 16,
              misses: 4,
              accuracyPercent: 80,
              maxCombo: 8,
            },
          ],
          learningPathProgress: [],
        }),
      }) as unknown as typeof fetch;

    const result = await syncRemoteProgressAfterPracticeSession({
      session,
      subscription,
      fetchImpl,
    });

    expect(result.status).toBe("synced");
    if (result.status === "synced") {
      expect(result.mode).toBe("merge");
      expect(result.state.sessionHistory).toHaveLength(2);
    }
  });
});
