import { describe, expect, it } from "vitest";
import { getLearningPathContinuation, getLearningPathProgress, recommendLearningPathSeed } from "./learning-paths";
import type { SessionSummaryV1 } from "$lib/chart/session-storage";

function session(trackId: string, accuracyPercent: number, at: string): SessionSummaryV1 {
  return {
    schemaVersion: 1,
    at,
    chartTitle: trackId,
    practiceTrackId: trackId,
    scoringMode: "practice",
    hits: 10,
    misses: 0,
    accuracyPercent,
    maxCombo: 10,
  };
}

describe("learning paths", () => {
  it("returns not-started paths with the first step as next", () => {
    const progress = getLearningPathProgress([]);
    expect(progress[0]?.status).toBe("not_started");
    expect(progress[0]?.completedSteps).toBe(0);
    expect(progress[0]?.nextStep?.track.id).toBe("bundled-one-note");
  });

  it("requires the accuracy threshold to complete a step", () => {
    const progress = getLearningPathProgress([
      session("bundled-one-note", 84, "2025-01-02T10:00:00.000Z"),
    ]);
    expect(progress[0]?.completedSteps).toBe(0);
    expect(progress[0]?.nextStep?.track.id).toBe("bundled-one-note");
  });

  it("advances sequentially and does not skip unfinished earlier steps", () => {
    const progress = getLearningPathProgress([
      session("bundled-pentatonic", 97, "2025-01-03T11:00:00.000Z"),
      session("bundled-major-scale", 72, "2025-01-03T10:00:00.000Z"),
      session("bundled-chromatic", 92, "2025-01-03T09:00:00.000Z"),
      session("bundled-one-note", 95, "2025-01-03T08:00:00.000Z"),
    ]);
    expect(progress[0]?.completedSteps).toBe(2);
    expect(progress[0]?.nextStep?.track.id).toBe("bundled-major-scale");
    expect(progress[0]?.status).toBe("in_progress");
  });

  it("marks a path completed when every step has a qualifying session", () => {
    const progress = getLearningPathProgress([
      session("bundled-sustained", 90, "2025-01-06T10:00:00.000Z"),
      session("bundled-arpeggio", 92, "2025-01-06T09:00:00.000Z"),
      session("bundled-hammer-pull", 89, "2025-01-06T08:00:00.000Z"),
      session("bundled-string-skip", 93, "2025-01-06T07:00:00.000Z"),
      session("bundled-spider", 94, "2025-01-06T06:00:00.000Z"),
      session("bundled-chromatic", 96, "2025-01-06T05:00:00.000Z"),
    ]);
    const technique = progress.find((item) => item.path.id === "technique");
    expect(technique?.status).toBe("completed");
    expect(technique?.completionPercent).toBe(100);
    expect(technique?.nextStep).toBeNull();
  });

  it("maps onboarding assessment answers to a starter recommendation", () => {
    expect(recommendLearningPathSeed("brand_new", "fundamentals")).toEqual({
      pathId: "starter",
      trackId: "bundled-one-note",
    });
    expect(recommendLearningPathSeed("returning", "rhythm")).toEqual({
      pathId: "rhythm",
      trackId: "bundled-power-chords",
    });
    expect(recommendLearningPathSeed("comfortable", "technique")).toEqual({
      pathId: "technique",
      trackId: "bundled-spider",
    });
  });

  it("returns a path continuation prompt for the current chart", () => {
    expect(getLearningPathContinuation("starter", "bundled-one-note", 70)).toMatchObject({
      state: "current_step",
      currentStepTrackId: "bundled-one-note",
    });

    expect(getLearningPathContinuation("starter", "bundled-one-note", 95)).toMatchObject({
      state: "advance",
      nextTrackId: "bundled-chromatic",
    });

    expect(getLearningPathContinuation("technique", "bundled-sustained", 95)).toMatchObject({
      state: "completed",
      nextTrackId: null,
    });
  });
});
