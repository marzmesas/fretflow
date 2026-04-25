import { describe, expect, it } from "vitest";
import {
  getCatalogMutationPolicy,
  listCatalogMutationPolicies,
  listMutationPoliciesByOwnership,
} from "./mutation-policies";

describe("catalog mutation policies", () => {
  it("classifies favorites and collections as sync candidates", () => {
    expect(listMutationPoliciesByOwnership("sync_candidate").map((policy) => policy.key)).toEqual([
      "favorites",
      "collections",
    ]);
  });

  it("keeps imported charts and practice affordances local-only", () => {
    expect(listMutationPoliciesByOwnership("local_only").map((policy) => policy.key)).toEqual([
      "user_charts",
      "practice_presets",
      "loop_bookmarks",
    ]);
  });

  it("marks session history as a later account-backed concern", () => {
    expect(getCatalogMutationPolicy("session_history").ownership).toBe("server_backed_later");
  });

  it("returns a stable policy list", () => {
    expect(listCatalogMutationPolicies()).toHaveLength(6);
  });
});
