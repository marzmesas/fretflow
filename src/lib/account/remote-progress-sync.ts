import { getRemoteProfileRole } from "./remote-profile-gate";
import { compareRemoteProgressStates, mergeRemoteProgressStates } from "./remote-progress-conflicts";
import {
  buildLocalRemoteProgressState,
  loadRemoteProgressState,
  saveRemoteProgressState,
  type RemoteProgressStateV1,
} from "./remote-progress";
import { getRemoteProgressSyncRollout } from "./remote-progress-sync-rollout";
import type { AppSession, SubscriptionState } from "../ipc";

export type RemoteProgressAutoSyncResult =
  | {
      status: "skipped";
      reason: "missing_service_url" | "preview_only" | "guest";
      summary: string;
    }
  | {
      status: "synced";
      mode: "upload" | "merge";
      state: RemoteProgressStateV1;
      summary: string;
    };

export async function syncRemoteProgressAfterPracticeSession(
  input: {
    session: AppSession | null;
    subscription: SubscriptionState | null;
    fetchImpl?: typeof fetch;
  },
): Promise<RemoteProgressAutoSyncResult> {
  const session = input.session;
  const subscription = input.subscription;
  if (!session?.signedIn || !session.accountId || !session.email) {
    return {
      status: "skipped",
      reason: "guest",
      summary: "Cloud progress sync skipped because no signed-in account is active.",
    };
  }

  const rollout = getRemoteProgressSyncRollout({
    apiBaseUrl: subscription?.apiBaseUrl ?? "",
    remoteProfileRole: getRemoteProfileRole(session),
  });
  if (!rollout.ready) {
    if (rollout.reason === "remote_progress_sync_ready") {
      throw new Error("Auto-sync rollout reached an impossible ready state.");
    }
    return {
      status: "skipped",
      reason: rollout.reason,
      summary: rollout.summary,
    };
  }

  const localState = buildLocalRemoteProgressState();
  const remoteState = await loadRemoteProgressState({
    apiBaseUrl: subscription?.apiBaseUrl ?? "",
    accountId: session.accountId,
    email: session.email,
    fetchImpl: input.fetchImpl,
  });
  const conflict = compareRemoteProgressStates(localState, remoteState);
  const nextState =
    conflict.state === "in_sync" || conflict.state === "local_only" || conflict.state === "local_ahead"
      ? localState
      : mergeRemoteProgressStates(localState, remoteState);

  const savedState = await saveRemoteProgressState({
    apiBaseUrl: subscription?.apiBaseUrl ?? "",
    accountId: session.accountId,
    email: session.email,
    state: nextState,
    fetchImpl: input.fetchImpl,
  });

  return {
    status: "synced",
    mode: nextState === localState ? "upload" : "merge",
    state: savedState,
    summary:
      nextState === localState
        ? "Saved the latest local progress snapshot to the signed-in cloud account."
        : "Merged local and cloud progress before saving the updated cloud snapshot.",
  };
}
