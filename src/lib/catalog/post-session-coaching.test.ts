import { describe, expect, it } from "vitest";
import { getPostSessionCoaching } from "./post-session-coaching";
import type { CatalogTrackStub } from "./types";

const TRACK: CatalogTrackStub = {
  id: "bundled-spider",
  title: "Spider exercise",
  artist: "Fretflow",
  tier: "free",
  practiceChartKey: "bundled",
  bundledChartFile: "spider-exercise.json",
  difficulty: "easy",
  skillTags: ["fretting", "endurance"],
  techniqueTags: ["finger_independence"],
  prerequisiteTrackIds: ["bundled-chromatic"],
  targetBpm: 80,
  masteryAccuracyThreshold: 85,
};

describe("post-session coaching", () => {
  it("returns focus and mastery coaching for an in-progress chart", () => {
    const notes = getPostSessionCoaching(
      TRACK,
      {
        totalSessions: 2,
        latestAccuracy: 70,
        averageAccuracy: 68,
        accuracyDelta: 4,
      },
      null,
    );
    expect(notes.map((note) => note.id)).toContain("focus");
    expect(notes.map((note) => note.id)).toContain("mastery");
    expect(notes.map((note) => note.id)).toContain("prerequisites");
  });

  it("includes path advancement coaching when the path is ready to move on", () => {
    const notes = getPostSessionCoaching(
      TRACK,
      {
        totalSessions: 3,
        latestAccuracy: 91,
        averageAccuracy: 87,
        accuracyDelta: 6,
      },
      {
        pathId: "technique",
        pathTitle: "Technique ladder",
        currentStepTrackId: "bundled-spider",
        currentStepTitle: "Spider exercise",
        currentStepThreshold: 85,
        nextTrackId: "bundled-string-skip",
        nextTrackTitle: "String skipping",
        state: "advance",
      },
    );
    expect(notes.some((note) => note.id === "path")).toBe(true);
    expect(notes.some((note) => note.body.includes("String skipping"))).toBe(true);
  });
});
