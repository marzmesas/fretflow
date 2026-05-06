import {
  isRemoteLibraryState,
  normalizeApiBaseUrlForRemoteLibrary,
  normalizeRemoteLibraryIdentity,
  RemoteLibraryWriteConflictError,
  type RemoteLibraryStateV1,
} from "./remote-library";

export type RemoteLibraryMutationV1 =
  | {
      kind: "favorite_set";
      trackId: string;
      value: boolean;
    }
  | {
      kind: "collection_create";
      collectionId: string;
      name: string;
      createdAt: string;
    }
  | {
      kind: "collection_delete";
      collectionId: string;
    }
  | {
      kind: "collection_rename";
      collectionId: string;
      name: string;
    }
  | {
      kind: "collection_track_set";
      collectionId: string;
      trackId: string;
      value: boolean;
    };

export type ApplyRemoteLibraryMutationBatchOptions = {
  apiBaseUrl: string;
  accountId: string;
  email: string;
  baseRevision: number;
  mutations: RemoteLibraryMutationV1[];
  fetchImpl?: typeof fetch;
};

export async function applyRemoteLibraryMutationBatch(
  options: ApplyRemoteLibraryMutationBatchOptions,
): Promise<RemoteLibraryStateV1> {
  const apiBaseUrl = normalizeApiBaseUrlForRemoteLibrary(options.apiBaseUrl);
  const identity = normalizeRemoteLibraryIdentity({
    accountId: options.accountId,
    email: options.email,
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/library-state/mutations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      schemaVersion: 1,
      ...identity,
      baseRevision: options.baseRevision,
      mutations: options.mutations,
    }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      const payload = (await response.json()) as unknown;
      if (isRemoteLibraryState(payload)) {
        throw new RemoteLibraryWriteConflictError(payload);
      }
      throw new Error("remote library mutation conflict returned an invalid response");
    }
    throw new Error(`remote library mutation write failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteLibraryState(payload)) {
    throw new Error("remote library mutation write returned an invalid response");
  }
  return payload;
}
