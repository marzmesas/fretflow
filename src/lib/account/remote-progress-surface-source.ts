import {
  compareRemoteProgressStates,
  mergeRemoteProgressStates,
  type RemoteProgressConflictState,
} from "./remote-progress-conflicts";
import {
  buildLocalRemoteProgressState,
  type RemoteProgressStateV1,
} from "./remote-progress";
import type { SessionSummaryV1 } from "../chart/session-storage";

export type RemoteProgressSurfaceSource = "local" | "cloud" | "merged";

export type RemoteProgressSurfaceSelection = {
  source: RemoteProgressSurfaceSource;
  history: SessionSummaryV1[];
  conflictState: RemoteProgressConflictState;
  summary: string;
  detail: string;
};

export function selectRemoteProgressSurfaceHistory(
  localHistory: SessionSummaryV1[],
  remoteState: RemoteProgressStateV1,
): RemoteProgressSurfaceSelection {
  const localState = buildLocalRemoteProgressState(localHistory);
  const conflict = compareRemoteProgressStates(localState, remoteState);

  switch (conflict.state) {
    case "in_sync":
    case "remote_only":
    case "remote_ahead":
      return {
        source: "cloud",
        history: remoteState.sessionHistory,
        conflictState: conflict.state,
        summary: "Cloud progress can safely drive continuity surfaces.",
        detail: conflict.detail,
      };
    case "local_only":
    case "local_ahead":
      return {
        source: "local",
        history: localHistory,
        conflictState: conflict.state,
        summary: "This device stays in control until its unsynced runs reach the cloud.",
        detail: conflict.detail,
      };
    case "diverged": {
      const mergedState = mergeRemoteProgressStates(localState, remoteState);
      return {
        source: "merged",
        history: mergedState.sessionHistory,
        conflictState: conflict.state,
        summary: "Continuity surfaces use a merged local-plus-cloud preview while progress is split.",
        detail: conflict.detail,
      };
    }
  }
}
