import type { CatalogSkillTag, CatalogTechniqueTag, CatalogTrackStub } from "./types";
import { buildMockRemoteCatalogPayload, normalizeRemoteCatalogPayload } from "./remote-catalog";

export type CatalogSnapshot = {
  tracks: CatalogTrackStub[];
  skillTags: CatalogSkillTag[];
  techniqueTags: CatalogTechniqueTag[];
  playableBundledTracks: CatalogTrackStub[];
};

function buildCatalogSnapshot(): CatalogSnapshot {
  const tracks = normalizeRemoteCatalogPayload(buildMockRemoteCatalogPayload());
  return {
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
  return buildCatalogSnapshot();
}

export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  return buildCatalogSnapshot();
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
