import { describe, expect, it } from "vitest";
import { getProfileWriteRollout } from "./profile-write-rollout";

describe("profile write rollout", () => {
  it("blocks writes without a service URL", () => {
    const rollout = getProfileWriteRollout({
      apiBaseUrl: "",
      remoteProfileRole: "preview_only",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("missing_service_url");
  });

  it("blocks writes while auth is still preview-only", () => {
    const rollout = getProfileWriteRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "preview_only",
    });

    expect(rollout.ready).toBe(false);
    expect(rollout.reason).toBe("auth_not_ready");
  });

  it("enables writes once real auth is active", () => {
    const rollout = getProfileWriteRollout({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.ready).toBe(true);
    expect(rollout.reason).toBe("remote_write_ready");
  });
});
