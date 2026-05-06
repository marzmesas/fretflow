import { describe, expect, it } from "vitest";
import { getRemoteLibrarySyncPolicy } from "./remote-library-sync-policy";

describe("remote library sync policy", () => {
  it("marks cloud library sync as mutation-based once background-safe writes exist", () => {
    const policy = getRemoteLibrarySyncPolicy();

    expect(policy.mode).toBe("mutation_auto_sync");
    expect(policy.autoSyncReady).toBe(true);
    expect(policy.detail).toContain("Imported-chart IDs stay device-local");
  });
});
