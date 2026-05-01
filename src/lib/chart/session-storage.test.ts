import { describe, expect, it } from "vitest";
import {
  getChartSessionStats,
  getLatestSessionsByTrackId,
  getPracticeRecommendation,
  getRecentSessions,
  getSessionStats,
  replaceSessionHistory,
  type SessionSummaryV1,
} from "./session-storage";

const HISTORY: SessionSummaryV1[] = [
  {
    schemaVersion: 1,
    at: "2026-04-20T10:00:00.000Z",
    chartTitle: "Warmup",
    practiceTrackId: "bundled-warmup",
    scoringMode: "practice",
    hits: 18,
    misses: 2,
    accuracyPercent: 90,
    maxCombo: 8,
  },
  {
    schemaVersion: 1,
    at: "2026-04-19T10:00:00.000Z",
    chartTitle: "Warmup",
    practiceTrackId: "bundled-warmup",
    scoringMode: "practice",
    hits: 16,
    misses: 4,
    accuracyPercent: 80,
    maxCombo: 6,
  },
  {
    schemaVersion: 1,
    at: "2026-04-18T10:00:00.000Z",
    chartTitle: "Arpeggio",
    practiceTrackId: "bundled-arpeggio",
    scoringMode: "practice",
    hits: 10,
    misses: 10,
    accuracyPercent: 50,
    maxCombo: 4,
  },
];

describe("session-storage", () => {
  it("computes global session stats", () => {
    expect(getSessionStats(HISTORY)).toEqual({
      totalSessions: 3,
      averageAccuracy: 73,
      bestAccuracy: 90,
      bestCombo: 8,
      uniqueCharts: 2,
    });
  });

  it("computes chart-specific stats using practice track id", () => {
    expect(
      getChartSessionStats(HISTORY, { chartTitle: "Warmup", practiceTrackId: "bundled-warmup" }),
    ).toMatchObject({
      totalSessions: 2,
      averageAccuracy: 85,
      bestAccuracy: 90,
      latestAccuracy: 90,
      accuracyDelta: 10,
      bestCombo: 8,
    });
  });

  it("returns a recommendation from chart stats", () => {
    const stats = getChartSessionStats(HISTORY, {
      chartTitle: "Warmup",
      practiceTrackId: "bundled-warmup",
    });
    expect(getPracticeRecommendation(stats)).toContain("improving");
  });

  it("indexes latest sessions by track id", () => {
    expect(getLatestSessionsByTrackId(HISTORY)).toMatchObject({
      "bundled-warmup": HISTORY[0],
      "bundled-arpeggio": HISTORY[2],
    });
  });

  it("returns a deduplicated recent session list by track id", () => {
    expect(getRecentSessions(HISTORY, 4)).toEqual([HISTORY[0], HISTORY[2]]);
  });

  it("replaces local session history with a normalized sorted snapshot", () => {
    const store = new Map<string, string>();
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

    const next = replaceSessionHistory([HISTORY[2]!, HISTORY[0]!, HISTORY[1]!]);
    expect(next).toEqual(HISTORY);
    expect(JSON.parse(store.get("fretflow.lastSession.v1") ?? "null")).toEqual(HISTORY[0]);
  });
});
