import { describe, expect, it } from "vitest";
import { getRemoteProfileWritePolicy } from "./remote-profile-write-policy";

describe("remote profile write policy", () => {
  it("requires revision guards before broader remote profile editing", () => {
    const policy = getRemoteProfileWritePolicy();

    expect(policy.revisionGuardRequiredNext).toBe(true);
    expect(policy.nextRequirement).toContain("profile revision");
  });
});
