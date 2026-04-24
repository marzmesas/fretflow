import { MOCK_CATALOG } from "./mock-catalog";
import type { CatalogSkillTag, CatalogTechniqueTag, CatalogTrackStub } from "./types";

export type CatalogSnapshot = {
  tracks: CatalogTrackStub[];
  skillTags: CatalogSkillTag[];
  techniqueTags: CatalogTechniqueTag[];
  playableBundledTracks: CatalogTrackStub[];
};

function buildCatalogSnapshot(): CatalogSnapshot {
  return {
    tracks: MOCK_CATALOG,
    skillTags: [...new Set(MOCK_CATALOG.flatMap((track) => track.skillTags ?? []))].sort(),
    techniqueTags: [...new Set(MOCK_CATALOG.flatMap((track) => track.techniqueTags ?? []))].sort(),
    playableBundledTracks: MOCK_CATALOG.filter(
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
  return MOCK_CATALOG.find((track) => track.id === normalizedTrackId) ?? null;
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
