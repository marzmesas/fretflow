import { describe, expect, it } from "vitest";
import { getRemoteLibrarySyncRollout } from "./remote-library-sync-rollout";

describe("remote library sync rollout", () => {
  it("blocks auto-sync without a service url", () => {
    expect(
      getRemoteLibrarySyncRollout({
        apiBaseUrl: "",
        remoteProfileRole: "primary_profile_source",
      }).ready,
    ).toBe(false);
  });

  it("blocks auto-sync while auth is preview-only", () => {
    expect(
      getRemoteLibrarySyncRollout({
        apiBaseUrl: "http://127.0.0.1:8787",
        remoteProfileRole: "preview_only",
      }).reason,
    ).toBe("preview_only");
  });

  it("allows auto-sync for primary signed-in cloud identity", () => {
    expect(
      getRemoteLibrarySyncRollout({
        apiBaseUrl: "http://127.0.0.1:8787",
        remoteProfileRole: "primary_profile_source",
      }).ready,
    ).toBe(true);
  });
});
