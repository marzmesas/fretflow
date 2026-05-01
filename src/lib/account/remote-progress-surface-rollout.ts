import type { RemoteProfileRole } from "./remote-profile-gate";

export type RemoteProgressSurfaceRolloutReason =
  | "missing_service_url"
  | "preview_only"
  | "remote_progress_surface_ready";

export type RemoteProgressSurfaceRollout = {
  ready: boolean;
  reason: RemoteProgressSurfaceRolloutReason;
  summary: string;
  detail: string;
};

export function getRemoteProgressSurfaceRollout(input: {
  apiBaseUrl: string | null | undefined;
  remoteProfileRole: RemoteProfileRole;
}): RemoteProgressSurfaceRollout {
  const apiBaseUrl = input.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl === "") {
    return {
      ready: false,
      reason: "missing_service_url",
      summary: "Cloud progress stays off Home and Library until a service URL exists.",
      detail: "Primary product surfaces should not depend on remote progress until there is an actual backend target.",
    };
  }
  if (input.remoteProfileRole !== "primary_profile_source") {
    return {
      ready: false,
      reason: "preview_only",
      summary: "Cloud progress stays in Account preview while auth is still preview-only.",
      detail: "Home and Library should not read remote progress as primary continuity while the account state is still local-only.",
    };
  }
  return {
    ready: true,
    reason: "remote_progress_surface_ready",
    summary: "Cloud progress can now drive Home and Library continuity surfaces.",
    detail: "A service URL exists and non-dev auth is active, so Home and Library can prefer the signed-in account's remote progress snapshot.",
  };
}
