import { STATIC_REMOTE_CATALOG_SEED } from "./catalog-seed";
import type {
  CatalogDifficulty,
  CatalogPremiumAccessId,
  CatalogSkillTag,
  CatalogTechniqueTag,
  CatalogTierId,
  CatalogTrackStub,
} from "./types";

export type RemoteCatalogMigrationTarget = {
  schemaVersion: 1;
  key: "bundled_metadata_seed";
  label: string;
  includesPremiumPreviewRows: boolean;
  includesPlayablePremiumTracks: boolean;
  includesEntitlements: boolean;
  includesImportedCharts: boolean;
  includesPracticeAssets: boolean;
};

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
  premiumAccessIds?: CatalogPremiumAccessId[];
};

export type RemoteCatalogPayloadV1 = {
  schemaVersion: 1;
  generatedAt: string;
  migrationTarget: RemoteCatalogMigrationTarget;
  tracks: RemoteCatalogTrackV1[];
};

const DEFAULT_REMOTE_CATALOG_MIGRATION_TARGET: RemoteCatalogMigrationTarget = {
  schemaVersion: 1,
  key: "bundled_metadata_seed",
  label: "Bundled metadata seed",
  includesPremiumPreviewRows: true,
  includesPlayablePremiumTracks: false,
  includesEntitlements: false,
  includesImportedCharts: false,
  includesPracticeAssets: false,
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
    premiumAccessIds: track.premiumAccessIds ?? [],
  };
}

function isMigrationTarget(value: unknown): value is RemoteCatalogMigrationTarget {
  if (value == null || typeof value !== "object") return false;
  const target = value as Partial<RemoteCatalogMigrationTarget>;
  return target.schemaVersion === 1 && target.key === "bundled_metadata_seed" && typeof target.label === "string";
}

export type NormalizedRemoteCatalogPayload = {
  migrationTarget: RemoteCatalogMigrationTarget;
  tracks: CatalogTrackStub[];
};

export function normalizeRemoteCatalogPayload(
  payload: unknown,
): NormalizedRemoteCatalogPayload {
  if (payload == null || typeof payload !== "object") {
    return { migrationTarget: DEFAULT_REMOTE_CATALOG_MIGRATION_TARGET, tracks: [] };
  }
  const candidate = payload as Partial<RemoteCatalogPayloadV1>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.tracks)) {
    return { migrationTarget: DEFAULT_REMOTE_CATALOG_MIGRATION_TARGET, tracks: [] };
  }
  return {
    migrationTarget: isMigrationTarget(candidate.migrationTarget)
      ? candidate.migrationTarget
      : DEFAULT_REMOTE_CATALOG_MIGRATION_TARGET,
    tracks: candidate.tracks.filter(isTrack).map(normalizeTrack),
  };
}

export function buildMockRemoteCatalogPayload(): RemoteCatalogPayloadV1 {
  return {
    ...STATIC_REMOTE_CATALOG_SEED,
    migrationTarget: {
      ...DEFAULT_REMOTE_CATALOG_MIGRATION_TARGET,
      ...STATIC_REMOTE_CATALOG_SEED.migrationTarget,
    },
    tracks: STATIC_REMOTE_CATALOG_SEED.tracks.map((track) => ({ ...track })),
  };
}
