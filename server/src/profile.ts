export type RemoteUserProfileV1 = {
  schemaVersion: 1;
  fields: {
    displayName: string | null;
    practiceGoal: "fundamentals" | "rhythm" | "technique" | null;
    recommendedPathId: "starter" | "rhythm" | "technique" | null;
    recommendedTrackId: string | null;
    dailyGoalSessions: number;
  };
};

export function buildMockUserProfilePayload(): RemoteUserProfileV1 {
  return {
    schemaVersion: 1,
    fields: {
      displayName: "Local dev",
      practiceGoal: "fundamentals",
      recommendedPathId: "starter",
      recommendedTrackId: "bundled-one-note",
      dailyGoalSessions: 1,
    },
  };
}
