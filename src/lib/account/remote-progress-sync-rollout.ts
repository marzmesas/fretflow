import type { RemoteProfileRole } from "./remote-profile-gate";

export type RemoteProgressSyncRolloutReason =
  | "missing_service_url"
  | "preview_only"
  | "remote_progress_sync_ready";

export type RemoteProgressSyncRollout = {
  ready: boolean;
  reason: RemoteProgressSyncRolloutReason;
  summary: string;
  detail: string;
};

export function getRemoteProgressSyncRollout(input: {
  apiBaseUrl: string | null | undefined;
  remoteProfileRole: RemoteProfileRole;
}): RemoteProgressSyncRollout {
  const apiBaseUrl = input.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl === "") {
    return {
      ready: false,
      reason: "missing_service_url",
      summary: "Automatic cloud progress sync stays off until a service URL exists.",
      detail: "Practice should not try to sync progress in the background without a concrete backend target.",
    };
  }
  if (input.remoteProfileRole !== "primary_profile_source") {
    return {
      ready: false,
      reason: "preview_only",
      summary: "Automatic cloud progress sync stays off while auth is still preview-only.",
      detail: "Background progress sync should not run until the signed-in account is authoritative.",
    };
  }
  return {
    ready: true,
    reason: "remote_progress_sync_ready",
    summary: "Automatic cloud progress sync can run after scored practice sessions.",
    detail: "A service URL exists and non-dev auth is active, so Practice can merge and persist progress after each completed run.",
  };
}
