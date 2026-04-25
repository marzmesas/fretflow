import { describe, expect, it } from "vitest";
import { listProfileFieldPoliciesByOwnership } from "./profile-field-policies";

describe("profile field policies", () => {
  it("marks identity and progression fields as remote-first", () => {
    expect(listProfileFieldPoliciesByOwnership("remote_first").map((policy) => policy.key)).toEqual([
      "display_name",
      "practice_goal",
      "recommended_path_seed",
      "daily_goal_target",
    ]);
  });

  it("keeps device and transport fields local-only", () => {
    expect(listProfileFieldPoliciesByOwnership("local_only").map((policy) => policy.key)).toEqual([
      "input_device_preferences",
      "latency_calibration",
      "analytics_delivery_backlog",
      "catalog_source_rollout",
    ]);
  });
});
