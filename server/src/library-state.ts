import {
  getStoredAccount,
  getStoredCollections,
  getStoredFavoriteTrackIds,
  saveStoredCollections,
  saveStoredFavoriteTrackIds,
  type StoredLibraryCollection,
} from "./account-store.js";

export type RemoteLibraryStateV1 = {
  schemaVersion: 1;
  revision: number;
  favorites: string[];
  collections: StoredLibraryCollection[];
};

export type SaveRemoteLibraryStateResult =
  | {
      status: "saved";
      state: RemoteLibraryStateV1;
    }
  | {
      status: "conflict";
      currentState: RemoteLibraryStateV1;
    };

type RemoteLibraryIdentity = {
  accountId?: string;
  email?: string;
};

type RemoteLibraryWriteRequest = RemoteLibraryIdentity & {
  state?: unknown;
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function isStoredLibraryCollection(value: unknown): value is StoredLibraryCollection {
  if (value == null || typeof value !== "object") return false;
  const collection = value as Partial<StoredLibraryCollection>;
  return (
    typeof collection.id === "string" &&
    typeof collection.name === "string" &&
    typeof collection.createdAt === "string" &&
    Array.isArray(collection.trackIds) &&
    collection.trackIds.every((trackId) => typeof trackId === "string")
  );
}

function resolveStoredLibraryAccount(identity: RemoteLibraryIdentity) {
  const accountId = identity.accountId?.trim() ?? "";
  const email = normalizeEmail(identity.email);
  if (accountId === "" || email === "") {
    return null;
  }
  const account = getStoredAccount(accountId);
  if (account == null || normalizeEmail(account.email) !== email) {
    return null;
  }
  return account;
}

function normalizeFavorites(trackIds: string[]): string[] {
  return [...new Set(trackIds.map((trackId) => trackId.trim()).filter((trackId) => trackId.length > 0))];
}

function normalizeCollections(collections: StoredLibraryCollection[]): StoredLibraryCollection[] {
  return collections.map((collection) => ({
    id: collection.id.trim(),
    name: collection.name.trim(),
    createdAt: collection.createdAt,
    trackIds: normalizeFavorites(collection.trackIds),
  }));
}

export function isRemoteLibraryStatePayload(value: unknown): value is RemoteLibraryStateV1 {
  if (value == null || typeof value !== "object") return false;
  const payload = value as Partial<RemoteLibraryStateV1>;
  return (
    payload.schemaVersion === 1 &&
    typeof payload.revision === "number" &&
    Array.isArray(payload.favorites) &&
    payload.favorites.every((trackId) => typeof trackId === "string") &&
    Array.isArray(payload.collections) &&
    payload.collections.every(isStoredLibraryCollection)
  );
}

export function getCurrentRemoteLibraryState(identity: RemoteLibraryIdentity): RemoteLibraryStateV1 | null {
  const account = resolveStoredLibraryAccount(identity);
  if (account == null) {
    return null;
  }
  return {
    schemaVersion: 1,
    revision: 0,
    favorites: getStoredFavoriteTrackIds(account.accountId),
    collections: getStoredCollections(account.accountId),
  };
}

export function saveRemoteLibraryState(request: unknown): SaveRemoteLibraryStateResult | null {
  if (request == null || typeof request !== "object") {
    return null;
  }
  const payload = request as RemoteLibraryWriteRequest;
  const account = resolveStoredLibraryAccount(payload);
  if (account == null || !isRemoteLibraryStatePayload(payload.state)) {
    return null;
  }
  const currentState = getCurrentRemoteLibraryState(payload);
  if (currentState == null) {
    return null;
  }
  if (payload.state.revision !== currentState.revision) {
    return {
      status: "conflict",
      currentState,
    };
  }
  const favorites = normalizeFavorites(payload.state.favorites);
  const collections = normalizeCollections(payload.state.collections).filter(
    (collection) => collection.id !== "" && collection.name !== "",
  );
  saveStoredFavoriteTrackIds(account.accountId, favorites);
  saveStoredCollections(account.accountId, collections);
  return {
    status: "saved",
    state: {
      schemaVersion: 1,
      revision: currentState.revision + 1,
      favorites,
      collections,
    },
  };
}
