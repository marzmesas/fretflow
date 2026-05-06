import type { ChartCollectionV1 } from "./collections";
import type { RemoteLibraryMutationV1 } from "./remote-library-mutations";
import type { RemoteLibraryStateV1 } from "./remote-library";

const LOCAL_ONLY_USER_CHART_PREFIX = "user-";

function normalizeTrackId(trackId: string): string {
  return trackId.trim();
}

export function isCloudEligibleLibraryTrackId(trackId: string): boolean {
  const normalizedTrackId = normalizeTrackId(trackId);
  return normalizedTrackId !== "" && !normalizedTrackId.startsWith(LOCAL_ONLY_USER_CHART_PREFIX);
}

export function filterCloudEligibleLibraryTrackIds(trackIds: string[]): string[] {
  return [...new Set(trackIds.map(normalizeTrackId).filter(isCloudEligibleLibraryTrackId))];
}

export function filterCloudEligibleLibraryCollections(
  collections: ChartCollectionV1[],
): ChartCollectionV1[] {
  return collections.map((collection) => ({
    ...collection,
    trackIds: filterCloudEligibleLibraryTrackIds(collection.trackIds),
  }));
}

export function filterCloudEligibleRemoteLibraryState(
  state: RemoteLibraryStateV1,
): RemoteLibraryStateV1 {
  return {
    ...state,
    favorites: filterCloudEligibleLibraryTrackIds(state.favorites),
    collections: filterCloudEligibleLibraryCollections(state.collections),
  };
}

export function filterCloudEligibleRemoteLibraryMutation(
  mutation: RemoteLibraryMutationV1,
): RemoteLibraryMutationV1 | null {
  switch (mutation.kind) {
    case "favorite_set":
      return isCloudEligibleLibraryTrackId(mutation.trackId) ? mutation : null;
    case "collection_track_set":
      return isCloudEligibleLibraryTrackId(mutation.trackId) ? mutation : null;
    case "collection_create":
    case "collection_delete":
    case "collection_rename":
      return mutation;
  }
}
