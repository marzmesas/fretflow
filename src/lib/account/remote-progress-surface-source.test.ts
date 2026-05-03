import { describe, expect, it } from "vitest";
import { selectRemoteProgressSurfaceHistory } from "./remote-progress-surface-source";
import type { SessionSummaryV1 } from "../chart/session-storage";
import type { RemoteProgressStateV1 } from "./remote-progress";

function makeSession(at: string, trackId: string): SessionSummaryV1 {
  return {
    schemaVersion: 1,
    at,
    chartTitle: trackId,
    practiceTrackId: trackId,
    scoringMode: "practice",
    hits: 8,
    misses: 2,
    accuracyPercent: 80,
    maxCombo: 5,
    totalNotes: 10,
    inputSource: "midi",
  };
}

function makeState(history: SessionSummaryV1[]): RemoteProgressStateV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    lastUpdatedAt: history[0]?.at ?? new Date(0).toISOString(),
    sessionHistory: history,
    learningPathProgress: [],
  };
}

describe("remote progress surface source", () => {
  it("keeps Home and Library local when this device is ahead", () => {
    const localHistory = [makeSession("2025-01-02T00:00:00.000Z", "track-a")];
    const remoteState = makeState([]);

    const selection = selectRemoteProgressSurfaceHistory(localHistory, remoteState);

    expect(selection.source).toBe("local");
    expect(selection.conflictState).toBe("local_only");
    expect(selection.history).toEqual(localHistory);
  });

  it("uses cloud history when the cloud is ahead", () => {
    const cloudHistory = [makeSession("2025-01-02T00:00:00.000Z", "track-a")];
    const remoteState = makeState(cloudHistory);

    const selection = selectRemoteProgressSurfaceHistory([], remoteState);

    expect(selection.source).toBe("cloud");
    expect(selection.conflictState).toBe("remote_only");
    expect(selection.history).toEqual(cloudHistory);
  });

  it("merges the histories when local and cloud diverge", () => {
    const localHistory = [makeSession("2025-01-03T00:00:00.000Z", "track-a")];
    const remoteHistory = [makeSession("2025-01-02T00:00:00.000Z", "track-b")];
    const remoteState = makeState(remoteHistory);

    const selection = selectRemoteProgressSurfaceHistory(localHistory, remoteState);

    expect(selection.source).toBe("merged");
    expect(selection.conflictState).toBe("diverged");
    expect(selection.history).toHaveLength(2);
    expect(selection.history.map((session) => session.practiceTrackId)).toEqual(["track-a", "track-b"]);
  });
});
