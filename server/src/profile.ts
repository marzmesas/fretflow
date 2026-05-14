import {
  getStoredAccount,
  getStoredRemoteProfile,
  saveStoredRemoteProfile,
} from "./account-store.js";

export type RemoteUserProfileV1 = {
  schemaVersion: 1;
  revision: number;
  seedSource: "mock_seed" | "frontend_preview" | "backend_persisted";
  fields: {
    displayName: string | null;
    practiceGoal: "fundamentals" | "rhythm" | "technique" | null;
    recommendedPathId: "starter" | "rhythm" | "technique" | null;
    recommendedTrackId: string | null;
    dailyGoalSessions: number;
  };
};

type RemoteProfileIdentity = {
  accountId?: string;
  email?: string;
};

type RemoteProfileWriteRequest = RemoteProfileIdentity & {
  profile?: unknown;
};

export type SaveRemoteUserProfileResult =
  | {
      status: "saved";
      profile: RemoteUserProfileV1;
    }
  | {
      status: "conflict";
      currentProfile: RemoteUserProfileV1;
    };

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function resolveStoredProfileAccount(identity: RemoteProfileIdentity) {
  const accountId = identity.accountId?.trim() ?? "";
  const email = normalizeEmail(identity.email);
  if (accountId === "" || email === "") {
    return null;
  }
  const account = getStoredAccount(accountId);
  if (account == null || normalizeEmail(account.email) !== email) {
    return null;
  }
  return account;
}

export function buildMockUserProfilePayload(displayName: string | null = "Local dev"): RemoteUserProfileV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    seedSource: "mock_seed",
    fields: {
      displayName,
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
    typeof payload.revision !== "number" ||
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
    revision: seed.revision,
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

export function getCurrentUserProfilePayload(identity: RemoteProfileIdentity): RemoteUserProfileV1 | null {
  const account = resolveStoredProfileAccount(identity);
  if (account == null) {
    return null;
  }
  const persistedProfile = getStoredRemoteProfile(account.accountId);
  if (persistedProfile != null && isRemoteUserProfilePayload(persistedProfile)) {
    return persistedProfile;
  }
  return buildMockUserProfilePayload(account.displayName);
}

export function saveUserProfilePayload(request: unknown): SaveRemoteUserProfileResult | null {
  if (request == null || typeof request !== "object") {
    return null;
  }
  const payload = request as RemoteProfileWriteRequest;
  const account = resolveStoredProfileAccount(payload);
  if (account == null || !isRemoteUserProfilePayload(payload.profile)) {
    return null;
  }
  const currentProfile = getCurrentUserProfilePayload(payload);
  if (currentProfile != null && payload.profile.revision !== currentProfile.revision) {
    return {
      status: "conflict",
      currentProfile,
    };
  }
  const persistedProfilePayload: RemoteUserProfileV1 = {
    schemaVersion: 1,
    revision: (currentProfile?.revision ?? 0) + 1,
    seedSource: "backend_persisted",
    fields: {
      displayName: payload.profile.fields.displayName,
      practiceGoal: payload.profile.fields.practiceGoal,
      recommendedPathId: payload.profile.fields.recommendedPathId,
      recommendedTrackId: payload.profile.fields.recommendedTrackId,
      dailyGoalSessions: payload.profile.fields.dailyGoalSessions,
    },
  };
  saveStoredRemoteProfile(account.accountId, persistedProfilePayload as Record<string, unknown>);
  return {
    status: "saved",
    profile: persistedProfilePayload,
  };
}
