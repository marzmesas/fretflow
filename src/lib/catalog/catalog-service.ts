import { MOCK_CATALOG } from "./mock-catalog";
import type { CatalogSkillTag, CatalogTechniqueTag, CatalogTrackStub } from "./types";

export function listCatalogTracks(): CatalogTrackStub[] {
  return MOCK_CATALOG;
}

export function findCatalogTrackById(trackId: string | null | undefined): CatalogTrackStub | null {
  const normalizedTrackId = trackId?.trim();
  if (!normalizedTrackId) return null;
  return MOCK_CATALOG.find((track) => track.id === normalizedTrackId) ?? null;
}

export function listCatalogSkillTags(): CatalogSkillTag[] {
  return [...new Set(MOCK_CATALOG.flatMap((track) => track.skillTags ?? []))].sort();
}

export function listCatalogTechniqueTags(): CatalogTechniqueTag[] {
  return [...new Set(MOCK_CATALOG.flatMap((track) => track.techniqueTags ?? []))].sort();
}

export function listPlayableBundledCatalogTracks(): CatalogTrackStub[] {
  return MOCK_CATALOG.filter(
    (track) =>
      track.tier === "free" &&
      !track.locked &&
      (track.practiceChartKey === "bundled" || track.practiceChartKey === "demo"),
  );
}
