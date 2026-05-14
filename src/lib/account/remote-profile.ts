import type { FrontendUserProfile } from "./profile";

export type RemoteUserProfileV1 = {
  schemaVersion: 1;
  revision: number;
  seedSource: "mock_seed" | "frontend_preview" | "backend_persisted";
  fields: {
    displayName: string | null;
    practiceGoal: string | null;
    recommendedPathId: string | null;
    recommendedTrackId: string | null;
    dailyGoalSessions: number;
  };
};

type RemoteProfileApiOptions = {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export type LoadRemoteUserProfileOptions = RemoteProfileApiOptions & {
  accountId: string;
  email: string;
};

export type PreviewRemoteUserProfileSeedOptions = RemoteProfileApiOptions & {
  seed: RemoteUserProfileV1;
};

export type SaveRemoteUserProfileOptions = LoadRemoteUserProfileOptions & {
  profile: RemoteUserProfileV1;
};

export class RemoteProfileWriteConflictError extends Error {
  readonly currentProfile: RemoteUserProfileV1;

  constructor(currentProfile: RemoteUserProfileV1) {
    super("remote profile write conflict");
    this.name = "RemoteProfileWriteConflictError";
    this.currentProfile = currentProfile;
  }
}

export function buildRemoteUserProfileSeed(
  profile: FrontendUserProfile,
): RemoteUserProfileV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    seedSource: "frontend_preview",
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

function normalizeAccountIdentity(accountId: string, email: string): {
  accountId: string;
  email: string;
} {
  const normalizedAccountId = accountId.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedAccountId === "" || normalizedEmail === "") {
    throw new Error("remote profile requests require a signed-in account");
  }
  return {
    accountId: normalizedAccountId,
    email: normalizedEmail,
  };
}

function isRemoteUserProfile(value: unknown): value is RemoteUserProfileV1 {
  if (value == null || typeof value !== "object") return false;
  const profile = value as Partial<RemoteUserProfileV1>;
  if (
    profile.schemaVersion !== 1 ||
    typeof profile.revision !== "number" ||
    (profile.seedSource !== "mock_seed" &&
      profile.seedSource !== "frontend_preview" &&
      profile.seedSource !== "backend_persisted") ||
    profile.fields == null ||
    typeof profile.fields !== "object"
  ) {
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
  const identity = normalizeAccountIdentity(options.accountId, options.email);
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams(identity);
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/profile?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`profile fetch failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteUserProfile(payload)) {
    throw new Error("profile fetch returned an invalid response");
  }
  return payload;
}

export async function previewRemoteUserProfileSeed(
  options: PreviewRemoteUserProfileSeedOptions,
): Promise<RemoteUserProfileV1> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  if (apiBaseUrl === "") {
    throw new Error("profile preview requires an API base URL");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/profile/seed-preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(options.seed),
  });
  if (!response.ok) {
    throw new Error(`profile preview failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteUserProfile(payload)) {
    throw new Error("profile preview returned an invalid response");
  }
  return payload;
}

export async function saveRemoteUserProfile(
  options: SaveRemoteUserProfileOptions,
): Promise<RemoteUserProfileV1> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  if (apiBaseUrl === "") {
    throw new Error("profile write requires an API base URL");
  }
  const identity = normalizeAccountIdentity(options.accountId, options.email);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/profile`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...identity,
      profile: options.profile,
    }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      const payload = (await response.json()) as unknown;
      if (isRemoteUserProfile(payload)) {
        throw new RemoteProfileWriteConflictError(payload);
      }
      throw new Error("profile write conflict returned an invalid response");
    }
    throw new Error(`profile write failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteUserProfile(payload)) {
    throw new Error("profile write returned an invalid response");
  }
  return payload;
}
