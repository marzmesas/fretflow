import type { RemoteProfileRole } from "../account/remote-profile-gate";
import type { AppSession } from "../ipc";
import type { CatalogSourceMode, CatalogSourcePreference } from "./catalog-source";

export type CatalogSourceRolloutReason =
  | "missing_service_url"
  | "auth_not_ready"
  | "ready_for_remote_default";

export type CatalogSourceRollout = {
  recommendedMode: CatalogSourceMode;
  reason: CatalogSourceRolloutReason;
  summary: string;
  detail: string;
};

export type CatalogSourceRolloutInput = {
  session: AppSession | null;
  apiBaseUrl: string | null | undefined;
  remoteProfileRole: RemoteProfileRole;
};

export function getCatalogSourceRollout(
  input: CatalogSourceRolloutInput,
): CatalogSourceRollout {
  const apiBaseUrl = input.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl === "") {
    return {
      recommendedMode: "local_seed",
      reason: "missing_service_url",
      summary: "Stay on the built-in catalog",
      detail: "The online catalog should not become the default until a service URL is configured.",
    };
  }

  const authKind = input.session?.authKind?.trim() ?? "";
  const hasPrimaryRemoteIdentity =
    input.remoteProfileRole === "primary_profile_source" &&
    input.session?.signedIn === true &&
    authKind !== "" &&
    authKind !== "dev";
  if (!hasPrimaryRemoteIdentity) {
    return {
      recommendedMode: "local_seed",
      reason: "auth_not_ready",
      summary: "Keep the built-in catalog as the default",
      detail: "The online catalog should stay opt-in until real non-dev auth is driving the profile boundary.",
    };
  }

  return {
    recommendedMode: "remote_api",
    reason: "ready_for_remote_default",
    summary: "Default to the online catalog",
    detail: "A service URL is configured and a non-dev signed-in identity is active, so the online catalog can become the default path.",
  };
}

export function resolveCatalogSourceMode(
  preference: CatalogSourcePreference,
  rollout: CatalogSourceRollout,
): CatalogSourceMode {
  if (preference === "system") {
    return rollout.recommendedMode;
  }
  return preference;
}
