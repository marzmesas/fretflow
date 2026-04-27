export type RemoteUserProfileV1 = {
  schemaVersion: 1;
  seedSource: "mock_seed" | "frontend_preview" | "backend_persisted";
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
    seedSource: "mock_seed",
    fields: {
      displayName: "Local dev",
      practiceGoal: "fundamentals",
      recommendedPathId: "starter",
      recommendedTrackId: "bundled-one-note",
      dailyGoalSessions: 1,
    },
  };
}

export function isRemoteUserProfilePayload(value: unknown): value is RemoteUserProfileV1 {
  if (value == null || typeof value !== "object") return false;
  const payload = value as Partial<RemoteUserProfileV1>;
  if (
    payload.schemaVersion !== 1 ||
    (payload.seedSource !== "mock_seed" &&
      payload.seedSource !== "frontend_preview" &&
      payload.seedSource !== "backend_persisted") ||
    payload.fields == null ||
    typeof payload.fields !== "object"
  ) {
    return false;
  }
  const fields = payload.fields as Partial<RemoteUserProfileV1["fields"]>;
  return (
    (typeof fields.displayName === "string" || fields.displayName === null) &&
    (fields.practiceGoal === "fundamentals" ||
      fields.practiceGoal === "rhythm" ||
      fields.practiceGoal === "technique" ||
      fields.practiceGoal === null) &&
    (fields.recommendedPathId === "starter" ||
      fields.recommendedPathId === "rhythm" ||
      fields.recommendedPathId === "technique" ||
      fields.recommendedPathId === null) &&
    (typeof fields.recommendedTrackId === "string" || fields.recommendedTrackId === null) &&
    typeof fields.dailyGoalSessions === "number"
  );
}

export function buildPreviewUserProfilePayload(seed: unknown): RemoteUserProfileV1 | null {
  if (!isRemoteUserProfilePayload(seed)) {
    return null;
  }
  return {
    schemaVersion: 1,
    seedSource: "frontend_preview",
    fields: {
      displayName: seed.fields.displayName,
      practiceGoal: seed.fields.practiceGoal,
      recommendedPathId: seed.fields.recommendedPathId,
      recommendedTrackId: seed.fields.recommendedTrackId,
      dailyGoalSessions: seed.fields.dailyGoalSessions,
    },
  };
}

let persistedProfilePayload: RemoteUserProfileV1 | null = null;

export function getCurrentUserProfilePayload(): RemoteUserProfileV1 {
  return persistedProfilePayload ?? buildMockUserProfilePayload();
}

export function saveUserProfilePayload(seed: unknown): RemoteUserProfileV1 | null {
  if (!isRemoteUserProfilePayload(seed)) {
    return null;
  }
  persistedProfilePayload = {
    schemaVersion: 1,
    seedSource: "backend_persisted",
    fields: {
      displayName: seed.fields.displayName,
      practiceGoal: seed.fields.practiceGoal,
      recommendedPathId: seed.fields.recommendedPathId,
      recommendedTrackId: seed.fields.recommendedTrackId,
      dailyGoalSessions: seed.fields.dailyGoalSessions,
    },
  };
  return persistedProfilePayload;
}
