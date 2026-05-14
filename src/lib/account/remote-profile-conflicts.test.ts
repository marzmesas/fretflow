import { describe, expect, it } from "vitest";
import { compareRemoteUserProfiles } from "./remote-profile-conflicts";
import type { RemoteUserProfileV1 } from "./remote-profile";

function profile(
  fields: Partial<RemoteUserProfileV1["fields"]>,
  seedSource: RemoteUserProfileV1["seedSource"] = "frontend_preview",
): RemoteUserProfileV1 {
  return {
    schemaVersion: 1,
    seedSource,
    fields: {
      displayName: null,
      practiceGoal: null,
      recommendedPathId: null,
      recommendedTrackId: null,
      dailyGoalSessions: 1,
      ...fields,
    },
  };
}

describe("remote profile conflicts", () => {
  it("reports in sync when all profile fields match", () => {
    const result = compareRemoteUserProfiles(
      profile({
        displayName: "Mario",
        practiceGoal: "rhythm",
        recommendedPathId: "rhythm",
        recommendedTrackId: "bundled-power-chords",
        dailyGoalSessions: 2,
      }),
      profile(
        {
          displayName: "Mario",
          practiceGoal: "rhythm",
          recommendedPathId: "rhythm",
          recommendedTrackId: "bundled-power-chords",
          dailyGoalSessions: 2,
        },
        "backend_persisted",
      ),
    );

    expect(result.status).toBe("in_sync");
  });

  it("reports remote_only when the cloud profile has values that local lacks", () => {
    const result = compareRemoteUserProfiles(
      profile({}),
      profile(
        {
          displayName: "Mario",
          practiceGoal: "technique",
          recommendedPathId: "technique",
          recommendedTrackId: "bundled-palm-mute-drill",
          dailyGoalSessions: 1,
        },
        "backend_persisted",
      ),
    );

    expect(result.status).toBe("remote_only");
    expect(result.fields.find((field) => field.key === "display_name")?.state).toBe("remote_only");
  });

  it("reports local_only when local has values that cloud lacks", () => {
    const result = compareRemoteUserProfiles(
      profile({
        displayName: "Mario",
        practiceGoal: "fundamentals",
        recommendedPathId: "starter",
        recommendedTrackId: "bundled-one-note",
        dailyGoalSessions: 1,
      }),
      profile({}, "backend_persisted"),
    );

    expect(result.status).toBe("local_only");
    expect(result.fields.find((field) => field.key === "practice_goal")?.state).toBe("local_only");
  });

  it("reports diverged when local and remote disagree", () => {
    const result = compareRemoteUserProfiles(
      profile({
        displayName: "Mario",
        practiceGoal: "rhythm",
        recommendedPathId: "rhythm",
        recommendedTrackId: "bundled-power-chords",
        dailyGoalSessions: 2,
      }),
      profile(
        {
          displayName: "Mario Cloud",
          practiceGoal: "technique",
          recommendedPathId: "technique",
          recommendedTrackId: "bundled-palm-mute-drill",
          dailyGoalSessions: 3,
        },
        "backend_persisted",
      ),
    );

    expect(result.status).toBe("diverged");
    expect(result.fields.find((field) => field.key === "daily_goal_sessions")?.state).toBe("diverged");
  });
});
