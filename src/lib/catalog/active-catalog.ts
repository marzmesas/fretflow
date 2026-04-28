import { getRemoteProfileRole } from "../account/remote-profile-gate";
import type { AppSession, SubscriptionState } from "../ipc";
import {
  getCatalogSourceRollout,
  resolveCatalogSourceMode,
} from "./catalog-rollout";
import {
  findCatalogTrackById,
  getCatalogSnapshot,
  loadCatalogSnapshot,
  type CatalogSnapshot,
  type LoadCatalogSnapshotOptions,
} from "./catalog-service";
import { getCatalogSourcePreference } from "./catalog-source";
import type { CatalogTrackStub } from "./types";

export type ActiveCatalogResolution = {
  sourceMode: LoadCatalogSnapshotOptions["sourceMode"];
  apiBaseUrl: string;
};

export function resolveActiveCatalog(session: AppSession | null, subscription: SubscriptionState | null): ActiveCatalogResolution {
  const apiBaseUrl = subscription?.apiBaseUrl?.trim() ?? "";
  const sourceMode = resolveCatalogSourceMode(
    getCatalogSourcePreference(),
    getCatalogSourceRollout({
      session,
      apiBaseUrl,
      remoteProfileRole: getRemoteProfileRole(session),
    }),
  );
  return {
    sourceMode,
    apiBaseUrl,
  };
}

export async function loadActiveCatalogSnapshot(input: {
  session: AppSession | null;
  subscription: SubscriptionState | null;
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<CatalogSnapshot> {
  const resolved = resolveActiveCatalog(input.session, input.subscription);
  return loadCatalogSnapshot({
    sourceMode: resolved.sourceMode,
    apiBaseUrl: resolved.apiBaseUrl,
    forceRefresh: input.forceRefresh,
    fetchImpl: input.fetchImpl,
  });
}

export function findTrackInSnapshot(
  snapshot: CatalogSnapshot,
  trackId: string | null | undefined,
): CatalogTrackStub | null {
  const normalizedTrackId = trackId?.trim();
  if (!normalizedTrackId) return null;
  return snapshot.tracks.find((track) => track.id === normalizedTrackId) ?? null;
}

export function findTrackFromActiveCatalog(trackId: string | null | undefined): CatalogTrackStub | null {
  return findTrackInSnapshot(getCatalogSnapshot(), trackId) ?? findCatalogTrackById(trackId);
}
