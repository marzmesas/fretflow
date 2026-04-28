import { describe, expect, it } from "vitest";
import { getRemoteProfileRole } from "./remote-profile-gate";

describe("remote profile gate", () => {
  it("keeps remote profile in preview mode for guests and dev auth", () => {
    expect(getRemoteProfileRole(null)).toBe("preview_only");
    expect(
      getRemoteProfileRole({
        schemaVersion: 1,
        signedIn: true,
        authKind: "dev",
        displayName: "Local dev",
        signedInAtUnixMs: 1,
        entitlements: [],
      }),
    ).toBe("preview_only");
  });

  it("promotes remote profile only for non-dev auth kinds", () => {
    expect(
      getRemoteProfileRole({
        schemaVersion: 1,
        signedIn: true,
        authKind: "email",
        email: "user@example.com",
        displayName: "User",
        signedInAtUnixMs: 1,
        entitlements: [],
      }),
    ).toBe("primary_profile_source");
  });
});
