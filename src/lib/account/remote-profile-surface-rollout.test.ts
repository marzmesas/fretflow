import { describe, expect, it } from "vitest";
import { getRemoteProfileSurfaceRollout } from "./remote-profile-surface-rollout";

describe("remote profile surface rollout", () => {
  it("blocks shell and home reads without a service URL", () => {
    const rollout = getRemoteProfileSurfaceRollout({
      apiBaseUrl: "",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("missing_service_url");
  });

  it("keeps remote profile on Account only while auth is preview-only", () => {
    const rollout = getRemoteProfileSurfaceRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "preview_only",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("preview_only");
  });

  it("promotes remote profile to shell and home once auth is primary", () => {
    const rollout = getRemoteProfileSurfaceRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.ready).toBe(true);
    expect(rollout.reason).toBe("remote_surface_ready");
  });
});
