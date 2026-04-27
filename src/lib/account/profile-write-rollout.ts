import type { RemoteProfileRole } from "./remote-profile-gate";

export type ProfileWriteRolloutReason =
  | "missing_service_url"
  | "auth_not_ready"
  | "remote_write_ready";

export type ProfileWriteRollout = {
  ready: boolean;
  reason: ProfileWriteRolloutReason;
  summary: string;
  detail: string;
};

export function getProfileWriteRollout(input: {
  apiBaseUrl: string | null | undefined;
  remoteProfileRole: RemoteProfileRole;
}): ProfileWriteRollout {
  const apiBaseUrl = input.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl === "") {
    return {
      ready: false,
      reason: "missing_service_url",
      summary: "Profile writes stay local until the service URL is configured.",
      detail: "The app should not try to persist remote profile fields until it has a concrete backend target.",
    };
  }
  if (input.remoteProfileRole !== "primary_profile_source") {
    return {
      ready: false,
      reason: "auth_not_ready",
      summary: "Profile writes remain blocked while auth is still in preview mode.",
      detail: "The dev session stub can preview the future remote shape, but it should not become the authoritative writer.",
    };
  }
  return {
    ready: true,
    reason: "remote_write_ready",
    summary: "Profile writes can now flow to the backend.",
    detail: "A service URL exists and real non-dev auth is active, so remote-first profile fields can be persisted.",
  };
}
