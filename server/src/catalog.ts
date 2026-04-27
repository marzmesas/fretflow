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

function buildMigrationTarget(): RemoteCatalogMigrationTarget {
  return {
    schemaVersion: 1,
    key: "bundled_metadata_seed",
    label: MOCK_PREMIUM_PLAYABLE
      ? "Bundled metadata seed with premium unlock previews"
      : "Bundled metadata seed",
    includesPremiumPreviewRows: true,
    includesPlayablePremiumTracks: MOCK_PREMIUM_PLAYABLE,
    includesEntitlements: MOCK_PREMIUM_PLAYABLE,
    includesImportedCharts: false,
    includesPracticeAssets: false,
  };
}

function buildPremiumTrack(
  track: Omit<RemoteCatalogTrackV1, "locked" | "practiceChartKey" | "bundledChartFile"> & {
    bundledChartFile: string;
  },
): RemoteCatalogTrackV1 {
  if (MOCK_PREMIUM_PLAYABLE) {
    return {
      ...track,
      practiceChartKey: "bundled",
      bundledChartFile: track.bundledChartFile,
    };
  }
  return {
    ...track,
    locked: true,
    practiceChartKey: "none",
  };
}

function buildMockRemoteTracks(): RemoteCatalogTrackV1[] {
  return [
    {
      id: "warmup-alt-picking-1",
      title: "Alt Picking Warmup",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "single-string-eighths.json",
      difficulty: "beginner",
      durationSec: 55,
      skillTags: ["timing", "single_note", "endurance"],
      techniqueTags: ["alternate_picking"],
      targetBpm: 90,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "one-note-rhythm",
      title: "One Note Rhythm Grid",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "one-note.json",
      difficulty: "beginner",
      durationSec: 60,
      skillTags: ["timing", "rhythm"],
      techniqueTags: ["alternate_picking"],
      targetBpm: 80,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "demo-playalong",
      title: "Demo Playalong",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "demo",
      difficulty: "easy",
      durationSec: 75,
      skillTags: ["timing", "riffs"],
      techniqueTags: ["position_shift"],
      targetBpm: 96,
      masteryAccuracyThreshold: 88,
    },
    buildPremiumTrack({
      id: "premium-tight-riffs",
      title: "Tight Riff Builder",
      artist: "Fretflow",
      tier: "premium",
      premiumAccessIds: ["pro", "blues_pack"],
      difficulty: "intermediate",
      durationSec: 95,
      skillTags: ["riffs", "rhythm"],
      techniqueTags: ["power_chords"],
      prerequisiteTrackIds: ["demo-playalong"],
      targetBpm: 120,
      masteryAccuracyThreshold: 90,
      bundledChartFile: "power-chords.json",
    }),
    buildPremiumTrack({
      id: "premium-legato-lab",
      title: "Legato Lab",
      artist: "Fretflow",
      tier: "premium",
      premiumAccessIds: ["pro", "fingerstyle_pack"],
      difficulty: "intermediate",
      durationSec: 105,
      skillTags: ["legato", "single_note"],
      techniqueTags: ["hammer_on", "pull_off"],
      targetBpm: 108,
      masteryAccuracyThreshold: 90,
      bundledChartFile: "hammer-pull-drill.json",
    }),
  ];
}

export function buildMockCatalogPayload(): RemoteCatalogPayloadV1 {
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    migrationTarget: buildMigrationTarget(),
    tracks: buildMockRemoteTracks(),
  };
}
