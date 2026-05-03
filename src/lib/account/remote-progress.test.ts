import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRemoteProgressState,
  buildLocalRemoteProgressState,
  loadRemoteProgressState,
  saveRemoteProgressState,
} from "./remote-progress";
import type { SessionSummaryV1 } from "../chart/session-storage";

describe("remote progress state", () => {
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

  const history: SessionSummaryV1[] = [
    {
      schemaVersion: 1 as const,
      at: "2026-04-29T10:00:00.000Z",
      chartTitle: "Single note pulse",
      practiceTrackId: "bundled-one-note",
      scoringMode: "practice",
      hits: 18,
      misses: 2,
      accuracyPercent: 90,
      maxCombo: 12,
      totalNotes: 20,
      inputSource: "midi",
    },
    {
      schemaVersion: 1 as const,
      at: "2026-04-28T10:00:00.000Z",
      chartTitle: "Chromatic ladder",
      practiceTrackId: "bundled-chromatic",
      scoringMode: "practice",
      hits: 16,
      misses: 4,
      accuracyPercent: 80,
      maxCombo: 8,
      totalNotes: 20,
      inputSource: "midi",
    },
  ];

  it("builds a cloud progress snapshot from local history", () => {
    const state = buildLocalRemoteProgressState(history);
    expect(state.revision).toBe(0);
    expect(state.sessionHistory).toEqual(history);
    expect(state.learningPathProgress[0]?.pathId).toBe("starter");
    expect(state.learningPathProgress[0]?.completedSteps).toBe(1);
  });

  it("applies cloud progress onto local storage and recomputes path progress", () => {
    const state = applyRemoteProgressState({
      schemaVersion: 1,
      revision: 3,
      lastUpdatedAt: "2026-04-29T11:00:00.000Z",
      sessionHistory: [...history].reverse(),
      learningPathProgress: [],
    });

    expect(state.sessionHistory[0]?.practiceTrackId).toBe("bundled-one-note");
    expect(state.revision).toBe(3);
    expect(state.learningPathProgress[0]?.pathId).toBe("starter");
    expect(JSON.parse(store.get("fretflow.lastSession.v1") ?? "null")?.practiceTrackId).toBe(
      "bundled-one-note",
    );
  });

  it("requests remote progress with account identity", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        revision: 4,
        lastUpdatedAt: "2026-04-29T11:00:00.000Z",
        sessionHistory: history,
        learningPathProgress: [],
      }),
    })) as unknown as typeof fetch;

    const state = await loadRemoteProgressState({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "PLAYER@example.com",
      fetchImpl,
    });

    expect(state.sessionHistory).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/progress-state?accountId=acct_123&email=player%40example.com",
    );
  });

  it("writes remote progress with account identity", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        revision: 4,
        lastUpdatedAt: "2026-04-29T11:00:00.000Z",
        sessionHistory: history,
        learningPathProgress: [],
      }),
    })) as unknown as typeof fetch;

    await saveRemoteProgressState({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "player@example.com",
      state: {
        schemaVersion: 1,
        revision: 0,
        lastUpdatedAt: "2026-04-29T11:00:00.000Z",
        sessionHistory: history,
        learningPathProgress: [],
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/progress-state",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          accountId: "acct_123",
          email: "player@example.com",
          state: {
            schemaVersion: 1,
            revision: 0,
            lastUpdatedAt: "2026-04-29T11:00:00.000Z",
            sessionHistory: history,
            learningPathProgress: [],
          },
        }),
      }),
    );
  });
});
