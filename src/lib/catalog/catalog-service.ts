import type { CatalogSkillTag, CatalogTechniqueTag, CatalogTrackStub } from "./types";
import {
  buildMockRemoteCatalogPayload,
  normalizeRemoteCatalogPayload,
  type RemoteCatalogMigrationTarget,
} from "./remote-catalog";

export type CatalogSnapshot = {
  migrationTarget: RemoteCatalogMigrationTarget;
  tracks: CatalogTrackStub[];
  skillTags: CatalogSkillTag[];
  techniqueTags: CatalogTechniqueTag[];
  playableBundledTracks: CatalogTrackStub[];
};

export type LoadCatalogSnapshotOptions = {
  forceRefresh?: boolean;
};

let cachedSnapshot: CatalogSnapshot | null = null;
let pendingSnapshot: Promise<CatalogSnapshot> | null = null;

function buildCatalogSnapshot(): CatalogSnapshot {
  const normalized = normalizeRemoteCatalogPayload(buildMockRemoteCatalogPayload());
  const tracks = normalized.tracks;
  return {
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

export function getCatalogSnapshot(): CatalogSnapshot {
  if (cachedSnapshot == null) {
    cachedSnapshot = buildCatalogSnapshot();
  }
  return cachedSnapshot;
}

export async function loadCatalogSnapshot(
  options: LoadCatalogSnapshotOptions = {},
): Promise<CatalogSnapshot> {
  if (options.forceRefresh) {
    invalidateCatalogSnapshot();
  }
  if (cachedSnapshot != null) {
    return cachedSnapshot;
  }
  if (pendingSnapshot != null) {
    return pendingSnapshot;
  }
  pendingSnapshot = Promise.resolve(buildCatalogSnapshot()).then((snapshot) => {
    cachedSnapshot = snapshot;
    pendingSnapshot = null;
    return snapshot;
  });
  return pendingSnapshot;
}

export function invalidateCatalogSnapshot(): void {
  cachedSnapshot = null;
  pendingSnapshot = null;
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
