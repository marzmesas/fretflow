import type { FrontendUserProfile } from "./profile";

export type RemoteUserProfileV1 = {
  schemaVersion: 1;
  fields: {
    displayName: string | null;
    practiceGoal: string | null;
    recommendedPathId: string | null;
    recommendedTrackId: string | null;
    dailyGoalSessions: number;
  };
};

export type LoadRemoteUserProfileOptions = {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export function buildRemoteUserProfileSeed(
  profile: FrontendUserProfile,
): RemoteUserProfileV1 {
  return {
    schemaVersion: 1,
    fields: {
      displayName: profile.auth.signedIn ? profile.auth.displayName : null,
      practiceGoal: profile.learning.practiceGoal,
      recommendedPathId: profile.learning.recommendedPathId,
      recommendedTrackId: profile.learning.recommendedTrackId,
      dailyGoalSessions: profile.practice.dailyGoalSessions,
    },
  };
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.trim().replace(/\/+$/, "");
}

function isRemoteUserProfile(value: unknown): value is RemoteUserProfileV1 {
  if (value == null || typeof value !== "object") return false;
  const profile = value as Partial<RemoteUserProfileV1>;
  if (profile.schemaVersion !== 1 || profile.fields == null || typeof profile.fields !== "object") {
    return false;
  }
  const fields = profile.fields as Partial<RemoteUserProfileV1["fields"]>;
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

export async function loadRemoteUserProfile(
  options: LoadRemoteUserProfileOptions,
): Promise<RemoteUserProfileV1> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  if (apiBaseUrl === "") {
    throw new Error("profile fetch requires an API base URL");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/profile`);
  if (!response.ok) {
    throw new Error(`profile fetch failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteUserProfile(payload)) {
    throw new Error("profile fetch returned an invalid response");
  }
  return payload;
}
