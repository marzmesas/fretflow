import type { RemoteUserProfileV1 } from "./remote-profile";

export type RemoteProfileFieldConflictState =
  | "in_sync"
  | "local_only"
  | "remote_only"
  | "diverged";

export type RemoteProfileFieldComparison = {
  key: "display_name" | "practice_goal" | "recommended_path_id" | "recommended_track_id" | "daily_goal_sessions";
  label: string;
  state: RemoteProfileFieldConflictState;
  localValue: string;
  remoteValue: string;
};

export type RemoteProfileConflictSummary = {
  status: "in_sync" | "local_only" | "remote_only" | "diverged";
  summary: string;
  detail: string;
  fields: RemoteProfileFieldComparison[];
};

function compareNullableStringField(input: {
  key: RemoteProfileFieldComparison["key"];
  label: string;
  localValue: string | null;
  remoteValue: string | null;
}): RemoteProfileFieldComparison {
  const localValue = input.localValue?.trim() || null;
  const remoteValue = input.remoteValue?.trim() || null;
  let state: RemoteProfileFieldConflictState;
  if (localValue === remoteValue) {
    state = "in_sync";
  } else if (localValue != null && remoteValue == null) {
    state = "local_only";
  } else if (localValue == null && remoteValue != null) {
    state = "remote_only";
  } else {
    state = "diverged";
  }
  return {
    key: input.key,
    label: input.label,
    state,
    localValue: localValue ?? "Not set",
    remoteValue: remoteValue ?? "Not set",
  };
}

function compareNumberField(input: {
  key: RemoteProfileFieldComparison["key"];
  label: string;
  localValue: number;
  remoteValue: number;
}): RemoteProfileFieldComparison {
  return {
    key: input.key,
    label: input.label,
    state: input.localValue === input.remoteValue ? "in_sync" : "diverged",
    localValue: String(input.localValue),
    remoteValue: String(input.remoteValue),
  };
}

export function compareRemoteUserProfiles(
  localProfile: RemoteUserProfileV1,
  remoteProfile: RemoteUserProfileV1,
): RemoteProfileConflictSummary {
  const fields: RemoteProfileFieldComparison[] = [
    compareNullableStringField({
      key: "display_name",
      label: "Display name",
      localValue: localProfile.fields.displayName,
      remoteValue: remoteProfile.fields.displayName,
    }),
    compareNullableStringField({
      key: "practice_goal",
      label: "Practice goal",
      localValue: localProfile.fields.practiceGoal,
      remoteValue: remoteProfile.fields.practiceGoal,
    }),
    compareNullableStringField({
      key: "recommended_path_id",
      label: "Recommended path",
      localValue: localProfile.fields.recommendedPathId,
      remoteValue: remoteProfile.fields.recommendedPathId,
    }),
    compareNullableStringField({
      key: "recommended_track_id",
      label: "Recommended chart",
      localValue: localProfile.fields.recommendedTrackId,
      remoteValue: remoteProfile.fields.recommendedTrackId,
    }),
    compareNumberField({
      key: "daily_goal_sessions",
      label: "Daily goal target",
      localValue: localProfile.fields.dailyGoalSessions,
      remoteValue: remoteProfile.fields.dailyGoalSessions,
    }),
  ];

  if (fields.every((field) => field.state === "in_sync")) {
    return {
      status: "in_sync",
      summary: "Local profile seed matches the current cloud profile.",
      detail: "No profile-field conflicts are visible right now.",
      fields,
    };
  }

  if (fields.every((field) => field.state === "remote_only" || field.state === "in_sync")) {
    return {
      status: "remote_only",
      summary: "Cloud profile is ahead of the current device seed.",
      detail: "The signed-in cloud profile already has fields this device has not populated locally.",
      fields,
    };
  }

  if (fields.every((field) => field.state === "local_only" || field.state === "in_sync")) {
    return {
      status: "local_only",
      summary: "This device has profile seed fields that are not in the cloud profile yet.",
      detail: "Saving the current device seed would make the cloud profile catch up.",
      fields,
    };
  }

  return {
    status: "diverged",
    summary: "Local and cloud profile fields differ.",
    detail:
      "At least one cloud-editable profile field has different values locally and online. Review the field list before saving over the cloud copy.",
    fields,
  };
}
