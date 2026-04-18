import { describe, expect, it } from "vitest";
import { localDateString, toPracticeGoalsSnapshot } from "./practice-goals-storage";

describe("practice-goals-storage", () => {
  it("localDateString is YYYY-MM-DD", () => {
    const s = localDateString(new Date(2026, 3, 18));
    expect(s).toBe("2026-04-18");
  });

  it("toPracticeGoalsSnapshot reflects today progress", () => {
    const today = localDateString(new Date());
    const snap = toPracticeGoalsSnapshot({
      schemaVersion: 1,
      dailyGoalSessions: 2,
      lastLocalDay: today,
      streakDays: 2,
      sessionsToday: 2,
    });
    expect(snap.goalMetToday).toBe(true);
    expect(snap.progressToday).toBe("2/2");
  });
});
