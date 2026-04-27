import { describe, expect, it } from "vitest";
import { getShellIdentityRollout } from "./shell-identity";

describe("shell identity rollout", () => {
  it("treats signed-out state as guest shell identity", () => {
    expect(getShellIdentityRollout(null).source).toBe("signed_out");
  });

  it("keeps dev auth on the local session stub path", () => {
    const rollout = getShellIdentityRollout({
      schemaVersion: 1,
      signedIn: true,
      authKind: "dev",
      displayName: "Local dev",
      signedInAtUnixMs: 1,
      entitlements: [],
    });

    expect(rollout.source).toBe("local_session_stub");
    expect(rollout.label).toBe("Local dev");
  });

  it("promotes non-dev auth to the primary shell identity path", () => {
    const rollout = getShellIdentityRollout({
      schemaVersion: 1,
      signedIn: true,
      authKind: "oauth",
      displayName: "Mario",
      signedInAtUnixMs: 1,
      entitlements: [],
    });

    expect(rollout.source).toBe("remote_auth");
    expect(rollout.label).toBe("Mario");
  });
});
