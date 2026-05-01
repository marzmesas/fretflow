import { describe, expect, it } from "vitest";
import { getRemoteProgressSurfaceRollout } from "./remote-progress-surface-rollout";

describe("remote progress surface rollout", () => {
  it("blocks Home and Library without a service URL", () => {
    const rollout = getRemoteProgressSurfaceRollout({
      apiBaseUrl: "",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("missing_service_url");
  });

  it("keeps remote progress on Account while auth is preview-only", () => {
    const rollout = getRemoteProgressSurfaceRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "preview_only",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("preview_only");
  });

  it("promotes remote progress to Home and Library once auth is primary", () => {
    const rollout = getRemoteProgressSurfaceRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.ready).toBe(true);
    expect(rollout.reason).toBe("remote_progress_surface_ready");
  });
});
