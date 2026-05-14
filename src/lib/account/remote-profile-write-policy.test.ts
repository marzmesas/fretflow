import { describe, expect, it } from "vitest";
import { getRemoteProfileWritePolicy } from "./remote-profile-write-policy";

describe("remote profile write policy", () => {
  it("keeps remote profile editing intentionally narrow even after revision guards exist", () => {
    const policy = getRemoteProfileWritePolicy();

    expect(policy.revisionGuardRequiredNext).toBe(false);
    expect(policy.broadenProfileEditingNow).toBe(false);
    expect(policy.summary).toContain("intentionally narrow");
    expect(policy.nextRequirement).toContain("belongs to the user");
  });
});
