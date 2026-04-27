import type { RemoteProfileRole } from "./remote-profile-gate";

export type RemoteProfileSurfaceRolloutReason =
  | "missing_service_url"
  | "preview_only"
  | "remote_surface_ready";

export type RemoteProfileSurfaceRollout = {
  ready: boolean;
  reason: RemoteProfileSurfaceRolloutReason;
  summary: string;
  detail: string;
};

export function getRemoteProfileSurfaceRollout(input: {
  apiBaseUrl: string | null | undefined;
  remoteProfileRole: RemoteProfileRole;
}): RemoteProfileSurfaceRollout {
  const apiBaseUrl = input.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl === "") {
    return {
      ready: false,
      reason: "missing_service_url",
      summary: "Remote profile stays off shell and Home until a service URL exists.",
      detail: "The app should not read profile data into primary surfaces until there is an actual backend target.",
    };
  }
  if (input.remoteProfileRole !== "primary_profile_source") {
    return {
      ready: false,
      reason: "preview_only",
      summary: "Remote profile stays in Account preview while auth is still local-only.",
      detail: "Shell and Home should not read preview-only profile data as if it were the primary source.",
    };
  }
  return {
    ready: true,
    reason: "remote_surface_ready",
    summary: "Remote profile can now drive shell and Home surfaces.",
    detail: "A service URL exists and non-dev auth is active, so remote profile reads are ready to graduate beyond Account.",
  };
}
