import { describe, expect, it } from "vitest";
import { getPracticeProgressSourcePolicy } from "./remote-progress-practice-policy";

describe("practice progress source policy", () => {
  it("keeps Practice local-only without a service URL", () => {
    const policy = getPracticeProgressSourcePolicy({
      apiBaseUrl: "",
      remoteProfileRole: "primary_profile_source",
    });

    expect(policy.mode).toBe("device_local_only");
    expect(policy.reason).toBe("missing_service_url");
    expect(policy.syncAfterRun).toBe(false);
  });

  it("keeps Practice local-only while auth is preview-only", () => {
    const policy = getPracticeProgressSourcePolicy({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "preview_only",
    });

    expect(policy.mode).toBe("device_local_only");
    expect(policy.reason).toBe("preview_only");
    expect(policy.syncAfterRun).toBe(false);
  });

  it("allows post-run sync while keeping the live run local once auth is primary", () => {
    const policy = getPracticeProgressSourcePolicy({
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "primary_profile_source",
    });

    expect(policy.mode).toBe("device_local_with_cloud_sync");
    expect(policy.reason).toBe("post_run_cloud_sync");
    expect(policy.syncAfterRun).toBe(true);
  });
});
