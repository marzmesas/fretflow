import { describe, expect, it } from "vitest";
import { getRemoteLibrarySyncPolicy } from "./remote-library-sync-policy";

describe("remote library sync policy", () => {
  it("keeps library sync manual and snapshot-based until mutation endpoints exist", () => {
    const policy = getRemoteLibrarySyncPolicy();

    expect(policy.mode).toBe("manual_snapshot_sync");
    expect(policy.autoSyncReady).toBe(false);
    expect(policy.nextRequirement).toContain("mutation-style endpoints");
  });
});
