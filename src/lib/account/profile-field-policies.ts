export type ProfileFieldOwnership = "remote_first" | "local_only";

export type ProfileFieldPolicy = {
  key:
    | "display_name"
    | "practice_goal"
    | "recommended_path_seed"
    | "daily_goal_target"
    | "input_device_preferences"
    | "latency_calibration"
    | "analytics_delivery_backlog"
    | "catalog_source_rollout";
  label: string;
  ownership: ProfileFieldOwnership;
  rationale: string;
};

const PROFILE_FIELD_POLICIES: readonly ProfileFieldPolicy[] = [
  {
    key: "display_name",
    label: "Display name",
    ownership: "remote_first",
    rationale: "Identity-facing profile fields should follow the user across devices.",
  },
  {
    key: "practice_goal",
    label: "Practice goal",
    ownership: "remote_first",
    rationale: "Guided progression intent should remain stable across devices once auth exists.",
  },
  {
    key: "recommended_path_seed",
    label: "Path seed",
    ownership: "remote_first",
    rationale: "Initial path and chart placement are part of the user profile, not the device.",
  },
  {
    key: "daily_goal_target",
    label: "Daily goal target",
    ownership: "remote_first",
    rationale: "Goal targets shape habit formation and should stay consistent across devices.",
  },
  {
    key: "input_device_preferences",
    label: "Input device preferences",
    ownership: "local_only",
    rationale: "Audio and MIDI device choices are hardware-specific and should remain per device.",
  },
  {
    key: "latency_calibration",
    label: "Latency calibration",
    ownership: "local_only",
    rationale: "Calibration depends on the machine, audio path, and interface chain.",
  },
  {
    key: "analytics_delivery_backlog",
    label: "Analytics delivery backlog",
    ownership: "local_only",
    rationale: "Retry state and unsent analytics batches belong to the local client transport layer.",
  },
  {
    key: "catalog_source_rollout",
    label: "Catalog source rollout",
    ownership: "local_only",
    rationale: "A rollout flag is an environment toggle, not durable user identity.",
  },
] as const;

export function listProfileFieldPolicies(): ProfileFieldPolicy[] {
  return [...PROFILE_FIELD_POLICIES];
}

export function listProfileFieldPoliciesByOwnership(
  ownership: ProfileFieldOwnership,
): ProfileFieldPolicy[] {
  return PROFILE_FIELD_POLICIES.filter((policy) => policy.ownership === ownership);
}
