import type { CatalogSkillTag, CatalogTechniqueTag, CatalogTrackStub } from "./types";
import type { CatalogSourceMode } from "./catalog-source";
import {
  buildMockRemoteCatalogPayload,
  normalizeRemoteCatalogPayload,
  type RemoteCatalogPayloadV1,
  type RemoteCatalogMigrationTarget,
} from "./remote-catalog";

export type CatalogSnapshot = {
  sourceMode: CatalogSourceMode;
  migrationTarget: RemoteCatalogMigrationTarget;
  tracks: CatalogTrackStub[];
  skillTags: CatalogSkillTag[];
  techniqueTags: CatalogTechniqueTag[];
  playableBundledTracks: CatalogTrackStub[];
};

export type LoadCatalogSnapshotOptions = {
  forceRefresh?: boolean;
  sourceMode?: CatalogSourceMode;
  apiBaseUrl?: string | null;
  fetchImpl?: typeof fetch;
};

const cachedSnapshots = new Map<string, CatalogSnapshot>();
const pendingSnapshots = new Map<string, Promise<CatalogSnapshot>>();
let currentSnapshotKey = cacheKey("local_seed");

function buildCatalogSnapshot(
  payload: unknown,
  sourceMode: CatalogSourceMode,
): CatalogSnapshot {
  const normalized = normalizeRemoteCatalogPayload(payload);
  const tracks = normalized.tracks;
  return {
    sourceMode,
    migrationTarget: normalized.migrationTarget,
    tracks,
    skillTags: [...new Set(tracks.flatMap((track) => track.skillTags ?? []))].sort(),
    techniqueTags: [...new Set(tracks.flatMap((track) => track.techniqueTags ?? []))].sort(),
    playableBundledTracks: tracks.filter(
      (track) =>
        track.tier === "free" &&
        !track.locked &&
        (track.practiceChartKey === "bundled" || track.practiceChartKey === "demo"),
    ),
  };
}

function cacheKey(sourceMode: CatalogSourceMode, apiBaseUrl?: string | null): string {
  return `${sourceMode}:${apiBaseUrl?.trim() ?? ""}`;
}

function buildLocalCatalogSnapshot(): CatalogSnapshot {
  return buildCatalogSnapshot(buildMockRemoteCatalogPayload(), "local_seed");
}

async function loadRemoteCatalogPayload(
  apiBaseUrl: string,
  fetchImpl: typeof fetch,
): Promise<RemoteCatalogPayloadV1> {
  const normalizedBase = apiBaseUrl.trim().replace(/\/+$/, "");
  const response = await fetchImpl(`${normalizedBase}/api/v1/catalog`);
  if (!response.ok) {
    throw new Error(`catalog fetch failed: ${response.status}`);
  }
  return (await response.json()) as RemoteCatalogPayloadV1;
}

export function getCatalogSnapshot(
  options: Pick<LoadCatalogSnapshotOptions, "sourceMode" | "apiBaseUrl"> = {},
): CatalogSnapshot {
  if (options.sourceMode == null) {
    return cachedSnapshots.get(currentSnapshotKey) ?? buildLocalCatalogSnapshot();
  }
  const sourceMode = options.sourceMode;
  if (sourceMode !== "local_seed") {
    const key = cacheKey(sourceMode, options.apiBaseUrl);
    return cachedSnapshots.get(key) ?? buildLocalCatalogSnapshot();
  }
  const key = cacheKey("local_seed");
  const cachedSnapshot = cachedSnapshots.get(key);
  if (cachedSnapshot != null) {
    return cachedSnapshot;
  }
  const snapshot = buildLocalCatalogSnapshot();
  cachedSnapshots.set(key, snapshot);
  return snapshot;
}

export async function loadCatalogSnapshot(
  options: LoadCatalogSnapshotOptions = {},
): Promise<CatalogSnapshot> {
  const sourceMode = options.sourceMode ?? "local_seed";
  const key = cacheKey(sourceMode, options.apiBaseUrl);
  if (options.forceRefresh) {
    invalidateCatalogSnapshot(key);
  }
  const cachedSnapshot = cachedSnapshots.get(key);
  if (cachedSnapshot != null) {
    return cachedSnapshot;
  }
  const pendingSnapshot = pendingSnapshots.get(key);
  if (pendingSnapshot != null) {
    return pendingSnapshot;
  }
  const nextPendingSnapshot = Promise.resolve().then(async () => {
    if (sourceMode === "remote_api" && (options.apiBaseUrl?.trim() ?? "") !== "") {
      const payload = await loadRemoteCatalogPayload(options.apiBaseUrl ?? "", options.fetchImpl ?? fetch);
      return buildCatalogSnapshot(payload, "remote_api");
    }
    return buildLocalCatalogSnapshot();
  }).then((snapshot) => {
    cachedSnapshots.set(key, snapshot);
    currentSnapshotKey = key;
    pendingSnapshots.delete(key);
    return snapshot;
  });
  pendingSnapshots.set(key, nextPendingSnapshot);
  return nextPendingSnapshot;
}

export function invalidateCatalogSnapshot(key?: string): void {
  if (key != null) {
    cachedSnapshots.delete(key);
    pendingSnapshots.delete(key);
    if (currentSnapshotKey === key) {
      currentSnapshotKey = cacheKey("local_seed");
    }
    return;
  }
  cachedSnapshots.clear();
  pendingSnapshots.clear();
  currentSnapshotKey = cacheKey("local_seed");
}

export function listCatalogTracks(): CatalogTrackStub[] {
  return getCatalogSnapshot().tracks;
}

export function findCatalogTrackById(trackId: string | null | undefined): CatalogTrackStub | null {
  const normalizedTrackId = trackId?.trim();
  if (!normalizedTrackId) return null;
  return getCatalogSnapshot().tracks.find((track) => track.id === normalizedTrackId) ?? null;
}

export function listCatalogSkillTags(): CatalogSkillTag[] {
  return getCatalogSnapshot().skillTags;
}

export function listCatalogTechniqueTags(): CatalogTechniqueTag[] {
  return getCatalogSnapshot().techniqueTags;
}

export function listPlayableBundledCatalogTracks(): CatalogTrackStub[] {
  return getCatalogSnapshot().playableBundledTracks;
}

export function getCatalogMigrationTarget(): RemoteCatalogMigrationTarget {
  return getCatalogSnapshot().migrationTarget;
}
