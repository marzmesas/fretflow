import { describe, expect, it } from "vitest";
import {
  getCatalogSourceRollout,
  resolveCatalogSourceMode,
} from "./catalog-rollout";

describe("catalog rollout policy", () => {
  it("keeps the built-in catalog when the service URL is missing", () => {
    const rollout = getCatalogSourceRollout({
      session: null,
      apiBaseUrl: "",
      remoteProfileRole: "preview_only",
    });

    expect(rollout.recommendedMode).toBe("local_seed");
    expect(rollout.reason).toBe("missing_service_url");
    expect(resolveCatalogSourceMode("system", rollout)).toBe("local_seed");
  });

  it("keeps the built-in catalog while auth is still preview-only", () => {
    const rollout = getCatalogSourceRollout({
      session: {
        schemaVersion: 1,
        signedIn: true,
        authKind: "dev",
        displayName: "Dev",
        signedInAtUnixMs: 1,
        entitlements: [],
      },
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "preview_only",
    });

    expect(rollout.recommendedMode).toBe("local_seed");
    expect(rollout.reason).toBe("auth_not_ready");
  });

  it("defaults to the online catalog once real auth is active", () => {
    const rollout = getCatalogSourceRollout({
      session: {
        schemaVersion: 1,
        signedIn: true,
        authKind: "oauth",
        displayName: "Player",
        signedInAtUnixMs: 1,
        entitlements: [],
      },
      apiBaseUrl: "http://127.0.0.1:8787",
      remoteProfileRole: "primary_profile_source",
    });

    expect(rollout.recommendedMode).toBe("remote_api");
    expect(rollout.reason).toBe("ready_for_remote_default");
    expect(resolveCatalogSourceMode("system", rollout)).toBe("remote_api");
    expect(resolveCatalogSourceMode("local_seed", rollout)).toBe("local_seed");
  });
});
