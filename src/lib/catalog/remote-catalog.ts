import { MOCK_CATALOG } from "./mock-catalog";
import type {
  CatalogDifficulty,
  CatalogSkillTag,
  CatalogTechniqueTag,
  CatalogTierId,
  CatalogTrackStub,
} from "./types";

export type RemoteCatalogTrackV1 = {
  id: string;
  title: string;
  artist: string;
  tier: CatalogTierId;
  locked?: boolean;
  practiceChartKey: "demo" | "none" | "bundled";
  bundledChartFile?: string;
  difficulty?: CatalogDifficulty;
  durationSec?: number;
  skillTags?: CatalogSkillTag[];
  techniqueTags?: CatalogTechniqueTag[];
  prerequisiteTrackIds?: string[];
  targetBpm?: number;
  masteryAccuracyThreshold?: number;
};

export type RemoteCatalogPayloadV1 = {
  schemaVersion: 1;
  generatedAt: string;
  tracks: RemoteCatalogTrackV1[];
};

function isTrack(value: unknown): value is RemoteCatalogTrackV1 {
  if (value == null || typeof value !== "object") return false;
  const track = value as Partial<RemoteCatalogTrackV1>;
  return (
    typeof track.id === "string" &&
    typeof track.title === "string" &&
    typeof track.artist === "string" &&
    (track.tier === "free" || track.tier === "premium") &&
    (track.practiceChartKey === "demo" ||
      track.practiceChartKey === "none" ||
      track.practiceChartKey === "bundled")
  );
}

function normalizeTrack(track: RemoteCatalogTrackV1): CatalogTrackStub {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    tier: track.tier,
    locked: track.locked ?? false,
    practiceChartKey: track.practiceChartKey,
    bundledChartFile: track.bundledChartFile,
    difficulty: track.difficulty,
    durationSec: track.durationSec,
    skillTags: track.skillTags ?? [],
    techniqueTags: track.techniqueTags ?? [],
    prerequisiteTrackIds: track.prerequisiteTrackIds ?? [],
    targetBpm: track.targetBpm,
    masteryAccuracyThreshold: track.masteryAccuracyThreshold,
  };
}

export function normalizeRemoteCatalogPayload(payload: unknown): CatalogTrackStub[] {
  if (payload == null || typeof payload !== "object") return [];
  const candidate = payload as Partial<RemoteCatalogPayloadV1>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.tracks)) return [];
  return candidate.tracks.filter(isTrack).map(normalizeTrack);
}

export function buildMockRemoteCatalogPayload(): RemoteCatalogPayloadV1 {
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    tracks: MOCK_CATALOG.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      tier: track.tier,
      locked: track.locked,
      practiceChartKey: track.practiceChartKey,
      bundledChartFile: track.bundledChartFile,
      difficulty: track.difficulty,
      durationSec: track.durationSec,
      skillTags: track.skillTags,
      techniqueTags: track.techniqueTags,
      prerequisiteTrackIds: track.prerequisiteTrackIds,
      targetBpm: track.targetBpm,
      masteryAccuracyThreshold: track.masteryAccuracyThreshold,
    })),
  };
}
