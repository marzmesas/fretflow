import type { RemoteProfileRole } from "../account/remote-profile-gate";

export type RemoteLibrarySyncRolloutReason =
  | "missing_service_url"
  | "preview_only"
  | "remote_library_sync_ready";

export type RemoteLibrarySyncRollout = {
  ready: boolean;
  reason: RemoteLibrarySyncRolloutReason;
  summary: string;
  detail: string;
};

export function getRemoteLibrarySyncRollout(input: {
  apiBaseUrl: string | null | undefined;
  remoteProfileRole: RemoteProfileRole;
}): RemoteLibrarySyncRollout {
  const apiBaseUrl = input.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl === "") {
    return {
      ready: false,
      reason: "missing_service_url",
      summary: "Automatic cloud library sync stays off until a service URL exists.",
      detail: "Favorites and collections should not sync in the background without a concrete backend target.",
    };
  }
  if (input.remoteProfileRole !== "primary_profile_source") {
    return {
      ready: false,
      reason: "preview_only",
      summary: "Automatic cloud library sync stays off while auth is still preview-only.",
      detail: "Background library sync should not run until the signed-in account is authoritative.",
    };
  }
  return {
    ready: true,
    reason: "remote_library_sync_ready",
    summary: "Automatic cloud library sync can run after library edits.",
    detail: "A service URL exists and non-dev auth is active, so favorite and collection changes can sync through mutation writes.",
  };
}
