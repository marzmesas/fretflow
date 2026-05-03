import { describe, expect, it } from "vitest";
import { getRemoteProgressSyncRollout } from "./remote-progress-sync-rollout";

describe("remote progress sync rollout", () => {
  it("blocks automatic sync without a service URL", () => {
    const rollout = getRemoteProgressSyncRollout({
      apiBaseUrl: "",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("missing_service_url");
  });

  it("blocks automatic sync while auth is preview-only", () => {
    const rollout = getRemoteProgressSyncRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "preview_only",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("preview_only");
  });

  it("enables automatic sync once auth is primary", () => {
    const rollout = getRemoteProgressSyncRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.ready).toBe(true);
    expect(rollout.reason).toBe("remote_progress_sync_ready");
  });
});
