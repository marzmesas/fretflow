import { describe, expect, it } from "vitest";
import { getRemoteLibraryRecoveryPolicy } from "./remote-library-recovery-policy";

describe("remote library recovery policy", () => {
  it("keeps manual snapshot tools as a recovery path", () => {
    const policy = getRemoteLibraryRecoveryPolicy();

    expect(policy.summary).toContain("recovery path");
    expect(policy.detail).toContain("sync automatically");
    expect(policy.whenToUse).toContain("diverge");
  });
});
