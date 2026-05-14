import seedPayload from "./catalog-seed.json";

type CatalogTierId = "free" | "premium";

type CatalogDifficulty = "beginner" | "easy" | "intermediate" | "advanced";

type CatalogSkillTag =
  | "timing"
  | "single_note"
  | "fretting"
  | "scales"
  | "chords"
  | "rhythm"
  | "riffs"
  | "arpeggios"
  | "legato"
  | "string_skipping"
  | "endurance";

type CatalogTechniqueTag =
  | "alternate_picking"
  | "finger_independence"
  | "position_shift"
  | "chord_switching"
  | "power_chords"
  | "shuffle_feel"
  | "string_skipping"
  | "hammer_on"
  | "pull_off"
  | "arpeggio_shapes"
  | "sustain_control";

type CatalogPremiumAccessId = "pro" | "blues_pack" | "fingerstyle_pack";

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

const MOCK_PREMIUM_PLAYABLE = process.env.MOCK_PREMIUM_PLAYABLE === "true";
const BASE_REMOTE_CATALOG_PAYLOAD = seedPayload as RemoteCatalogPayloadV1;

function buildMigrationTarget(): RemoteCatalogMigrationTarget {
  return {
    ...BASE_REMOTE_CATALOG_PAYLOAD.migrationTarget,
    label: MOCK_PREMIUM_PLAYABLE
      ? "Bundled metadata seed with premium unlock previews"
      : BASE_REMOTE_CATALOG_PAYLOAD.migrationTarget.label,
    includesPlayablePremiumTracks: MOCK_PREMIUM_PLAYABLE,
    includesEntitlements: MOCK_PREMIUM_PLAYABLE,
  };
}

function buildMockRemoteTracks(): RemoteCatalogTrackV1[] {
  return BASE_REMOTE_CATALOG_PAYLOAD.tracks.map((track) => {
    if (track.tier !== "premium") {
      return { ...track };
    }
    if (MOCK_PREMIUM_PLAYABLE) {
      return {
        ...track,
        locked: false,
        practiceChartKey: "bundled",
      };
    }
    return {
      ...track,
      locked: true,
      practiceChartKey: "none",
    };
  });
}

export function buildMockCatalogPayload(): RemoteCatalogPayloadV1 {
  return {
    ...BASE_REMOTE_CATALOG_PAYLOAD,
    generatedAt: BASE_REMOTE_CATALOG_PAYLOAD.generatedAt,
    migrationTarget: buildMigrationTarget(),
    tracks: buildMockRemoteTracks(),
  };
}
