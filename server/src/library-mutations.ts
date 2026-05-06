import { saveStoredLibraryState } from "./account-store.js";
import {
  getCurrentRemoteLibraryState,
  type RemoteLibraryStateV1,
  type SaveRemoteLibraryStateResult,
} from "./library-state.js";

type RemoteLibraryMutationV1 =
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

type RemoteLibraryMutationBatchRequestV1 = {
  schemaVersion: 1;
  accountId: string;
  email: string;
  baseRevision: number;
  mutations: RemoteLibraryMutationV1[];
};

function isRemoteLibraryMutationV1(value: unknown): value is RemoteLibraryMutationV1 {
  if (value == null || typeof value !== "object") return false;
  const mutation = value as Partial<RemoteLibraryMutationV1>;
  switch (mutation.kind) {
    case "favorite_set":
      return typeof mutation.trackId === "string" && typeof mutation.value === "boolean";
    case "collection_create":
      return (
        typeof mutation.collectionId === "string" &&
        typeof mutation.name === "string" &&
        typeof mutation.createdAt === "string"
      );
    case "collection_delete":
      return typeof mutation.collectionId === "string";
    case "collection_rename":
      return typeof mutation.collectionId === "string" && typeof mutation.name === "string";
    case "collection_track_set":
      return (
        typeof mutation.collectionId === "string" &&
        typeof mutation.trackId === "string" &&
        typeof mutation.value === "boolean"
      );
    default:
      return false;
  }
}

function isRemoteLibraryMutationBatchRequestV1(
  value: unknown,
): value is RemoteLibraryMutationBatchRequestV1 {
  if (value == null || typeof value !== "object") return false;
  const request = value as Partial<RemoteLibraryMutationBatchRequestV1>;
  return (
    request.schemaVersion === 1 &&
    typeof request.accountId === "string" &&
    typeof request.email === "string" &&
    typeof request.baseRevision === "number" &&
    Array.isArray(request.mutations) &&
    request.mutations.every(isRemoteLibraryMutationV1)
  );
}

function normalizeTrackIds(trackIds: string[]): string[] {
  return [...new Set(trackIds.map((trackId) => trackId.trim()).filter((trackId) => trackId !== ""))];
}

function applyMutation(
  state: RemoteLibraryStateV1,
  mutation: RemoteLibraryMutationV1,
): RemoteLibraryStateV1 {
  switch (mutation.kind) {
    case "favorite_set": {
      const trackId = mutation.trackId.trim();
      if (trackId === "") return state;
      const favorites = mutation.value
        ? normalizeTrackIds([trackId, ...state.favorites])
        : state.favorites.filter((favoriteTrackId) => favoriteTrackId !== trackId);
      return { ...state, favorites };
    }
    case "collection_create": {
      const collectionId = mutation.collectionId.trim();
      const name = mutation.name.trim();
      if (collectionId === "" || name === "" || state.collections.some((collection) => collection.id === collectionId)) {
        return state;
      }
      return {
        ...state,
        collections: [
          {
            id: collectionId,
            name,
            createdAt: mutation.createdAt,
            trackIds: [],
          },
          ...state.collections,
        ],
      };
    }
    case "collection_delete":
      return {
        ...state,
        collections: state.collections.filter((collection) => collection.id !== mutation.collectionId),
      };
    case "collection_rename": {
      const name = mutation.name.trim();
      if (name === "") return state;
      return {
        ...state,
        collections: state.collections.map((collection) =>
          collection.id === mutation.collectionId ? { ...collection, name } : collection,
        ),
      };
    }
    case "collection_track_set": {
      const trackId = mutation.trackId.trim();
      if (trackId === "") return state;
      return {
        ...state,
        collections: state.collections.map((collection) => {
          if (collection.id !== mutation.collectionId) return collection;
          const trackIds = mutation.value
            ? normalizeTrackIds([trackId, ...collection.trackIds])
            : collection.trackIds.filter((existingTrackId) => existingTrackId !== trackId);
          return { ...collection, trackIds };
        }),
      };
    }
  }
}

export function applyRemoteLibraryMutationBatch(
  request: unknown,
): SaveRemoteLibraryStateResult | null {
  if (!isRemoteLibraryMutationBatchRequestV1(request)) {
    return null;
  }
  const currentState = getCurrentRemoteLibraryState(request);
  if (currentState == null) {
    return null;
  }
  if (request.baseRevision !== currentState.revision) {
    return {
      status: "conflict",
      currentState,
    };
  }
  const nextState = request.mutations.reduce(applyMutation, currentState);
  const savedRevision = currentState.revision + 1;
  saveStoredLibraryState(request.accountId, {
    revision: savedRevision,
    favoriteTrackIds: nextState.favorites,
    collections: nextState.collections,
  });
  return {
    status: "saved",
    state: {
      ...nextState,
      revision: savedRevision,
    },
  };
}
