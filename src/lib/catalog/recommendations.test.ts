import { describe, expect, it } from "vitest";
import { getRecommendedTracks } from "./recommendations";
import type { SessionSummaryV1 } from "$lib/chart/session-storage";

describe("catalog recommendations", () => {
  it("returns starter recommendations with no history", () => {
    const recommended = getRecommendedTracks([]);
    expect(recommended.length).toBeGreaterThan(0);
    expect(recommended[0]!.reason).toContain("starting point");
  });

  it("suggests a step up after a strong recent run", () => {
    const history: SessionSummaryV1[] = [
      {
        schemaVersion: 1,
        at: "2026-04-20T10:00:00.000Z",
        chartTitle: "Chromatic warm-up (0–4)",
        practiceTrackId: "bundled-chromatic",
        scoringMode: "practice",
        hits: 23,
        misses: 0,
        accuracyPercent: 100,
        maxCombo: 23,
      },
    ];
    const recommended = getRecommendedTracks(history, 2);
    expect(recommended[0]!.track.id).not.toBe("bundled-chromatic");
    expect(recommended[0]!.reason).toContain("step up");
  });
});
