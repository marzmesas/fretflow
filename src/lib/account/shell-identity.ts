import type { AppSession } from "../ipc";

export type ShellIdentitySource = "signed_out" | "local_session_stub" | "remote_auth";

export type ShellIdentityRollout = {
  source: ShellIdentitySource;
  summary: string;
  detail: string;
  label: string;
};

export function getShellIdentityRollout(session: AppSession | null): ShellIdentityRollout {
  if (!session?.signedIn) {
    return {
      source: "signed_out",
      label: "Guest",
      summary: "Shell is still running without a signed-in identity",
      detail: "Until real auth is active, the shell falls back to a guest state with no account-backed identity.",
    };
  }

  const authKind = session.authKind?.trim() ?? "";
  const displayName = session.displayName?.trim() || (authKind === "dev" ? "Dev" : "Player");
  if (authKind === "" || authKind === "dev") {
    return {
      source: "local_session_stub",
      label: displayName,
      summary: "Shell identity is still driven by the local session stub",
      detail: "The dev sign-in remains the active identity source until a non-dev auth provider takes over.",
    };
  }

  return {
    source: "remote_auth",
    label: displayName,
    summary: "Shell identity is now driven by real auth",
    detail: "A non-dev auth provider is active, so the shell can treat this account as the primary identity source.",
  };
}
