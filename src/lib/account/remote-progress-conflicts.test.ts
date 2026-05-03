import { describe, expect, it } from "vitest";
import {
  compareRemoteProgressStates,
  mergeRemoteProgressStates,
} from "./remote-progress-conflicts";
import { buildRemoteProgressStateFromHistory } from "./remote-progress";
import type { SessionSummaryV1 } from "../chart/session-storage";

const SESSION_A: SessionSummaryV1 = {
  schemaVersion: 1,
  at: "2026-04-29T10:00:00.000Z",
  chartTitle: "One note",
  practiceTrackId: "bundled-one-note",
  scoringMode: "practice",
  hits: 18,
  misses: 2,
  accuracyPercent: 90,
  maxCombo: 10,
};

const SESSION_B: SessionSummaryV1 = {
  schemaVersion: 1,
  at: "2026-04-29T09:00:00.000Z",
  chartTitle: "Chromatic",
  practiceTrackId: "bundled-chromatic",
  scoringMode: "practice",
  hits: 16,
  misses: 4,
  accuracyPercent: 80,
  maxCombo: 8,
};

const SESSION_C: SessionSummaryV1 = {
  schemaVersion: 1,
  at: "2026-04-29T08:00:00.000Z",
  chartTitle: "Scale",
  practiceTrackId: "bundled-major-scale",
  scoringMode: "practice",
  hits: 15,
  misses: 5,
  accuracyPercent: 75,
  maxCombo: 7,
};

describe("remote progress conflicts", () => {
  it("detects when local progress is ahead", () => {
    const summary = compareRemoteProgressStates(
      buildRemoteProgressStateFromHistory([SESSION_A, SESSION_B]),
      buildRemoteProgressStateFromHistory([SESSION_A]),
    );

    expect(summary.state).toBe("local_ahead");
    expect(summary.localOnlySessions).toBe(1);
    expect(summary.remoteOnlySessions).toBe(0);
  });

  it("detects diverged progress snapshots", () => {
    const summary = compareRemoteProgressStates(
      buildRemoteProgressStateFromHistory([SESSION_A, SESSION_B]),
      buildRemoteProgressStateFromHistory([SESSION_A, SESSION_C]),
    );

    expect(summary.state).toBe("diverged");
    expect(summary.localOnlySessions).toBe(1);
    expect(summary.remoteOnlySessions).toBe(1);
  });

  it("merges unique sessions from both sides", () => {
    const merged = mergeRemoteProgressStates(
      buildRemoteProgressStateFromHistory([SESSION_A, SESSION_B]),
      buildRemoteProgressStateFromHistory([SESSION_A, SESSION_C]),
    );

    expect(merged.sessionHistory).toEqual([SESSION_A, SESSION_B, SESSION_C]);
    expect(merged.learningPathProgress[0]?.pathId).toBe("starter");
  });
});
