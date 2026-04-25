import type { AppSession } from "../ipc";

export type RemoteProfileRole = "preview_only" | "primary_profile_source";

export function getRemoteProfileRole(session: AppSession | null): RemoteProfileRole {
  const authKind = session?.authKind?.trim();
  if (session?.signedIn && authKind != null && authKind !== "" && authKind !== "dev") {
    return "primary_profile_source";
  }
  return "preview_only";
}
