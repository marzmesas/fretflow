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
};

export type RemoteCatalogPayloadV1 = {
  schemaVersion: 1;
  generatedAt: string;
  migrationTarget: RemoteCatalogMigrationTarget;
  tracks: RemoteCatalogTrackV1[];
};

const REMOTE_CATALOG_MIGRATION_TARGET: RemoteCatalogMigrationTarget = {
  schemaVersion: 1,
  key: "bundled_metadata_seed",
  label: "Bundled metadata seed",
  includesPremiumPreviewRows: true,
  includesPlayablePremiumTracks: false,
  includesEntitlements: false,
  includesImportedCharts: false,
  includesPracticeAssets: false,
};

const MOCK_REMOTE_TRACKS: RemoteCatalogTrackV1[] = [
  {
    id: "warmup-alt-picking-1",
    title: "Alt Picking Warmup",
    artist: "Fretflow",
    tier: "free",
    practiceChartKey: "bundled",
    bundledChartFile: "alt-picking-warmup.json",
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
    bundledChartFile: "one-note-rhythm.json",
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
  {
    id: "premium-tight-riffs",
    title: "Tight Riff Builder",
    artist: "Fretflow",
    tier: "premium",
    locked: true,
    practiceChartKey: "none",
    difficulty: "intermediate",
    durationSec: 95,
    skillTags: ["riffs", "rhythm"],
    techniqueTags: ["power_chords"],
    prerequisiteTrackIds: ["demo-playalong"],
    targetBpm: 120,
    masteryAccuracyThreshold: 90,
  },
  {
    id: "premium-legato-lab",
    title: "Legato Lab",
    artist: "Fretflow",
    tier: "premium",
    locked: true,
    practiceChartKey: "none",
    difficulty: "intermediate",
    durationSec: 105,
    skillTags: ["legato", "single_note"],
    techniqueTags: ["hammer_on", "pull_off"],
    targetBpm: 108,
    masteryAccuracyThreshold: 90,
  },
];

export function buildMockCatalogPayload(): RemoteCatalogPayloadV1 {
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    migrationTarget: REMOTE_CATALOG_MIGRATION_TARGET,
    tracks: MOCK_REMOTE_TRACKS,
  };
}
