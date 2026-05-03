import {
  buildRemoteProgressStateFromHistory,
  type RemoteProgressStateV1,
} from "./remote-progress";
import type { SessionSummaryV1 } from "../chart/session-storage";

export type RemoteProgressConflictState =
  | "in_sync"
  | "local_only"
  | "remote_only"
  | "local_ahead"
  | "remote_ahead"
  | "diverged";

export type RemoteProgressConflictSummary = {
  state: RemoteProgressConflictState;
  summary: string;
  detail: string;
  localSessionCount: number;
  remoteSessionCount: number;
  localOnlySessions: number;
  remoteOnlySessions: number;
  localLatestAt: string | null;
  remoteLatestAt: string | null;
};

function sessionSignature(session: SessionSummaryV1): string {
  return [
    session.at,
    session.practiceTrackId ?? "",
    session.chartTitle,
    session.scoringMode,
    session.hits,
    session.misses,
    session.accuracyPercent,
    session.maxCombo,
    session.totalNotes ?? "",
    session.inputSource ?? "",
  ].join("|");
}

function latestAt(history: SessionSummaryV1[]): string | null {
  return history[0]?.at ?? null;
}

function uniqueSessions(history: SessionSummaryV1[]): SessionSummaryV1[] {
  const seen = new Set<string>();
  const unique: SessionSummaryV1[] = [];
  for (const session of history) {
    const signature = sessionSignature(session);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(session);
  }
  return unique;
}

export function compareRemoteProgressStates(
  localState: RemoteProgressStateV1,
  remoteState: RemoteProgressStateV1,
): RemoteProgressConflictSummary {
  const localSessions = uniqueSessions(localState.sessionHistory);
  const remoteSessions = uniqueSessions(remoteState.sessionHistory);
  const localKeys = new Set(localSessions.map(sessionSignature));
  const remoteKeys = new Set(remoteSessions.map(sessionSignature));
  const localOnlySessions = [...localKeys].filter((key) => !remoteKeys.has(key)).length;
  const remoteOnlySessions = [...remoteKeys].filter((key) => !localKeys.has(key)).length;

  let state: RemoteProgressConflictState;
  if (localKeys.size === 0 && remoteKeys.size === 0) {
    state = "in_sync";
  } else if (remoteKeys.size === 0) {
    state = "local_only";
  } else if (localKeys.size === 0) {
    state = "remote_only";
  } else if (localOnlySessions === 0 && remoteOnlySessions === 0) {
    state = "in_sync";
  } else if (localOnlySessions > 0 && remoteOnlySessions === 0) {
    state = "local_ahead";
  } else if (localOnlySessions === 0 && remoteOnlySessions > 0) {
    state = "remote_ahead";
  } else {
    state = "diverged";
  }

  switch (state) {
    case "in_sync":
      return {
        state,
        summary: "Local and cloud progress are in sync.",
        detail: "Home and Library can safely use the remote continuity view without hiding any device-only runs.",
        localSessionCount: localSessions.length,
        remoteSessionCount: remoteSessions.length,
        localOnlySessions,
        remoteOnlySessions,
        localLatestAt: latestAt(localSessions),
        remoteLatestAt: latestAt(remoteSessions),
      };
    case "local_only":
      return {
        state,
        summary: "This device has progress that never reached the cloud.",
        detail: "Push the current device snapshot if you want cloud continuity to include these runs.",
        localSessionCount: localSessions.length,
        remoteSessionCount: remoteSessions.length,
        localOnlySessions,
        remoteOnlySessions,
        localLatestAt: latestAt(localSessions),
        remoteLatestAt: latestAt(remoteSessions),
      };
    case "remote_only":
      return {
        state,
        summary: "The cloud has progress that this device does not have yet.",
        detail: "Apply the cloud snapshot if you want this device to catch up to the signed-in account.",
        localSessionCount: localSessions.length,
        remoteSessionCount: remoteSessions.length,
        localOnlySessions,
        remoteOnlySessions,
        localLatestAt: latestAt(localSessions),
        remoteLatestAt: latestAt(remoteSessions),
      };
    case "local_ahead":
      return {
        state,
        summary: "This device is ahead of the cloud snapshot.",
        detail: `There are ${localOnlySessions} device-only session${localOnlySessions === 1 ? "" : "s"} not yet persisted online.`,
        localSessionCount: localSessions.length,
        remoteSessionCount: remoteSessions.length,
        localOnlySessions,
        remoteOnlySessions,
        localLatestAt: latestAt(localSessions),
        remoteLatestAt: latestAt(remoteSessions),
      };
    case "remote_ahead":
      return {
        state,
        summary: "The cloud snapshot is ahead of this device.",
        detail: `There are ${remoteOnlySessions} cloud-only session${remoteOnlySessions === 1 ? "" : "s"} available to apply locally.`,
        localSessionCount: localSessions.length,
        remoteSessionCount: remoteSessions.length,
        localOnlySessions,
        remoteOnlySessions,
        localLatestAt: latestAt(localSessions),
        remoteLatestAt: latestAt(remoteSessions),
      };
    case "diverged":
      return {
        state,
        summary: "Local and cloud progress have diverged.",
        detail: `This device has ${localOnlySessions} unique session${localOnlySessions === 1 ? "" : "s"} and the cloud has ${remoteOnlySessions} unique session${remoteOnlySessions === 1 ? "" : "s"} that are missing on the other side.`,
        localSessionCount: localSessions.length,
        remoteSessionCount: remoteSessions.length,
        localOnlySessions,
        remoteOnlySessions,
        localLatestAt: latestAt(localSessions),
        remoteLatestAt: latestAt(remoteSessions),
      };
  }
}

export function mergeRemoteProgressStates(
  localState: RemoteProgressStateV1,
  remoteState: RemoteProgressStateV1,
): RemoteProgressStateV1 {
  const mergedSessions = uniqueSessions([
    ...localState.sessionHistory,
    ...remoteState.sessionHistory,
  ]).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return buildRemoteProgressStateFromHistory(
    mergedSessions,
    new Date().toISOString(),
    Math.max(localState.revision, remoteState.revision),
  );
}
