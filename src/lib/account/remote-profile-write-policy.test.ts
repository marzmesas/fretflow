import { describe, expect, it } from "vitest";
import { getRemoteProfileWritePolicy } from "./remote-profile-write-policy";

describe("remote profile write policy", () => {
  it("keeps remote profile editing intentionally narrow until revisions exist", () => {
    const policy = getRemoteProfileWritePolicy();

    expect(policy.revisionGuardRequiredNext).toBe(true);
    expect(policy.broadenProfileEditingNow).toBe(false);
    expect(policy.summary).toContain("intentionally narrow");
    expect(policy.nextRequirement).toContain("profile revision");
  });
});
