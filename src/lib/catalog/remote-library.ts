import {
  getCollections,
  isChartCollectionV1,
  replaceCollections,
  type ChartCollectionV1,
} from "./collections";
import {
  getFavoriteTrackIds,
  replaceFavoriteTrackIds,
} from "./favorites";

export type RemoteLibraryStateV1 = {
  schemaVersion: 1;
  revision: number;
  favorites: string[];
  collections: ChartCollectionV1[];
};

type RemoteLibraryIdentity = {
  accountId: string;
  email: string;
};

type RemoteLibraryApiOptions = {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export type LoadRemoteLibraryStateOptions = RemoteLibraryApiOptions & RemoteLibraryIdentity;

export type SaveRemoteLibraryStateOptions = RemoteLibraryApiOptions &
  RemoteLibraryIdentity & {
    state: RemoteLibraryStateV1;
  };

export class RemoteLibraryWriteConflictError extends Error {
  readonly currentState: RemoteLibraryStateV1;

  constructor(currentState: RemoteLibraryStateV1) {
    super("remote library write conflict");
    this.name = "RemoteLibraryWriteConflictError";
    this.currentState = currentState;
  }
}

export function normalizeApiBaseUrlForRemoteLibrary(apiBaseUrl: string): string {
  const normalized = apiBaseUrl.trim().replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("remote library requests require an API base URL");
  }
  return normalized;
}

export function normalizeRemoteLibraryIdentity(identity: RemoteLibraryIdentity): RemoteLibraryIdentity {
  const accountId = identity.accountId.trim();
  const email = identity.email.trim().toLowerCase();
  if (accountId === "" || email === "") {
    throw new Error("remote library requests require a signed-in account");
  }
  return {
    accountId,
    email,
  };
}

function normalizeFavorites(favorites: string[]): string[] {
  return [...new Set(favorites.map((trackId) => trackId.trim()).filter((trackId) => trackId.length > 0))];
}

function normalizeCollections(collections: ChartCollectionV1[]): ChartCollectionV1[] {
  return collections
    .filter(isChartCollectionV1)
    .map((collection) => ({
      id: collection.id.trim(),
      name: collection.name.trim(),
      createdAt: collection.createdAt,
      trackIds: normalizeFavorites(collection.trackIds),
    }))
    .filter((collection) => collection.id !== "" && collection.name !== "");
}

export function isRemoteLibraryState(value: unknown): value is RemoteLibraryStateV1 {
  if (value == null || typeof value !== "object") return false;
  const state = value as Partial<RemoteLibraryStateV1>;
  return (
    state.schemaVersion === 1 &&
    typeof state.revision === "number" &&
    Array.isArray(state.favorites) &&
    state.favorites.every((trackId) => typeof trackId === "string") &&
    Array.isArray(state.collections) &&
    state.collections.every(isChartCollectionV1)
  );
}

export function buildLocalRemoteLibraryState(): RemoteLibraryStateV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    favorites: getFavoriteTrackIds(),
    collections: getCollections(),
  };
}

export function applyRemoteLibraryState(state: RemoteLibraryStateV1): RemoteLibraryStateV1 {
  const normalized: RemoteLibraryStateV1 = {
    schemaVersion: 1,
    revision: state.revision,
    favorites: normalizeFavorites(state.favorites),
    collections: normalizeCollections(state.collections),
  };
  replaceFavoriteTrackIds(normalized.favorites);
  replaceCollections(normalized.collections);
  return normalized;
}

export async function loadRemoteLibraryState(
  options: LoadRemoteLibraryStateOptions,
): Promise<RemoteLibraryStateV1> {
  const apiBaseUrl = normalizeApiBaseUrlForRemoteLibrary(options.apiBaseUrl);
  const identity = normalizeRemoteLibraryIdentity(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams(identity);
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/library-state?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`remote library fetch failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteLibraryState(payload)) {
    throw new Error("remote library fetch returned an invalid response");
  }
  return payload;
}

export async function saveRemoteLibraryState(
  options: SaveRemoteLibraryStateOptions,
): Promise<RemoteLibraryStateV1> {
  const apiBaseUrl = normalizeApiBaseUrlForRemoteLibrary(options.apiBaseUrl);
  const identity = normalizeRemoteLibraryIdentity(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/library-state`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...identity,
      state: options.state,
    }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      const payload = (await response.json()) as unknown;
      if (isRemoteLibraryState(payload)) {
        throw new RemoteLibraryWriteConflictError(payload);
      }
      throw new Error("remote library write conflict returned an invalid response");
    }
    throw new Error(`remote library write failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteLibraryState(payload)) {
    throw new Error("remote library write returned an invalid response");
  }
  return payload;
}
