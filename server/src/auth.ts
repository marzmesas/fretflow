import { createHash, randomUUID } from "node:crypto";

type AuthSignInRequest = {
  schemaVersion?: number;
  email?: string;
  displayName?: string | null;
};

export type AuthSignInResponse = {
  schemaVersion: 1;
  authKind: "email";
  accountId: string;
  email: string;
  displayName: string | null;
  signedInAtUnixMs: number;
  entitlements: string[];
  sessionToken: string;
};

type StoredAuthSession = AuthSignInResponse;

const authSessions = new Map<string, StoredAuthSession>();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildAccountId(email: string): string {
  const hash = createHash("sha256").update(email).digest("hex");
  return `acct_${hash.slice(0, 12)}`;
}

function defaultEntitlements(): string[] {
  return [
    "remote:auth",
    "remote:profile",
    "remote:catalog",
    "remote:billing",
  ];
}

export function buildAuthSignInPayload(payload: unknown): AuthSignInResponse | null {
  if (payload == null || typeof payload !== "object") return null;
  const request = payload as AuthSignInRequest;
  const email = typeof request.email === "string" ? normalizedEmail(request.email) : "";
  if (request.schemaVersion !== 1 || !EMAIL_PATTERN.test(email)) {
    return null;
  }
  const displayName =
    typeof request.displayName === "string" && request.displayName.trim() !== ""
      ? request.displayName.trim()
      : null;
  const response: AuthSignInResponse = {
    schemaVersion: 1,
    authKind: "email",
    accountId: buildAccountId(email),
    email,
    displayName,
    signedInAtUnixMs: Date.now(),
    entitlements: defaultEntitlements(),
    sessionToken: `sess_${randomUUID()}`,
  };
  authSessions.set(response.sessionToken, response);
  return response;
}
