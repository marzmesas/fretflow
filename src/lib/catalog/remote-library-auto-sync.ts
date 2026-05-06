import {
  loadRemoteLibraryState,
  RemoteLibraryWriteConflictError,
  type RemoteLibraryStateV1,
} from "./remote-library";
import {
  applyRemoteLibraryMutationBatch,
  type RemoteLibraryMutationV1,
} from "./remote-library-mutations";
import { filterCloudEligibleRemoteLibraryMutation } from "./remote-library-cloud-eligibility";

export type AutoSyncRemoteLibraryMutationsOptions = {
  apiBaseUrl: string;
  accountId: string;
  email: string;
  currentRemoteState: RemoteLibraryStateV1 | null;
  mutations: RemoteLibraryMutationV1[];
  fetchImpl?: typeof fetch;
};

export type AutoSyncRemoteLibraryMutationsResult = {
  state: RemoteLibraryStateV1;
  status: "synced" | "replayed_after_conflict" | "skipped_local_only";
};

export async function autoSyncRemoteLibraryMutations(
  options: AutoSyncRemoteLibraryMutationsOptions,
): Promise<AutoSyncRemoteLibraryMutationsResult> {
  const filteredMutations = options.mutations
    .map(filterCloudEligibleRemoteLibraryMutation)
    .filter((mutation): mutation is RemoteLibraryMutationV1 => mutation != null);
  if (filteredMutations.length === 0) {
    return {
      state:
        options.currentRemoteState ??
        ({
          schemaVersion: 1,
          revision: 0,
          favorites: [],
          collections: [],
        } satisfies RemoteLibraryStateV1),
      status: "skipped_local_only",
    };
  }
  const remoteState =
    options.currentRemoteState ??
    (await loadRemoteLibraryState({
      apiBaseUrl: options.apiBaseUrl,
      accountId: options.accountId,
      email: options.email,
      fetchImpl: options.fetchImpl,
    }));
  try {
    const state = await applyRemoteLibraryMutationBatch({
      apiBaseUrl: options.apiBaseUrl,
      accountId: options.accountId,
      email: options.email,
      baseRevision: remoteState.revision,
      mutations: filteredMutations,
      fetchImpl: options.fetchImpl,
    });
    return {
      state,
      status: "synced",
    };
  } catch (error) {
    if (!(error instanceof RemoteLibraryWriteConflictError)) {
      throw error;
    }
    const state = await applyRemoteLibraryMutationBatch({
      apiBaseUrl: options.apiBaseUrl,
      accountId: options.accountId,
      email: options.email,
      baseRevision: error.currentState.revision,
      mutations: filteredMutations,
      fetchImpl: options.fetchImpl,
    });
    return {
      state,
      status: "replayed_after_conflict",
    };
  }
}
