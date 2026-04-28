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
      id: "bundled-one-note",
      title: "One open low E",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "one-note.json",
      difficulty: "beginner",
      durationSec: 2,
      skillTags: ["timing", "single_note"],
      techniqueTags: ["alternate_picking"],
      targetBpm: 60,
      masteryAccuracyThreshold: 90,
    },
    {
      id: "bundled-chromatic",
      title: "Chromatic warm-up (0–4)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "chromatic-warmup.json",
      difficulty: "beginner",
      durationSec: 23,
      skillTags: ["timing", "fretting", "endurance"],
      techniqueTags: ["alternate_picking", "finger_independence"],
      prerequisiteTrackIds: ["bundled-one-note"],
      targetBpm: 72,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-major-scale",
      title: "E major scale — up & down",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "major-scale-e.json",
      difficulty: "beginner",
      durationSec: 10,
      skillTags: ["scales", "timing", "fretting"],
      techniqueTags: ["position_shift", "alternate_picking"],
      prerequisiteTrackIds: ["bundled-chromatic"],
      targetBpm: 76,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-pentatonic",
      title: "Am pentatonic — up & down",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "pentatonic-am.json",
      difficulty: "easy",
      durationSec: 16,
      skillTags: ["scales", "single_note", "timing"],
      techniqueTags: ["position_shift", "alternate_picking"],
      prerequisiteTrackIds: ["bundled-major-scale"],
      targetBpm: 80,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-single-string",
      title: "Single string eighths (low E)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "single-string-eighths.json",
      difficulty: "easy",
      durationSec: 17,
      skillTags: ["rhythm", "timing", "single_note"],
      techniqueTags: ["alternate_picking"],
      prerequisiteTrackIds: ["bundled-one-note"],
      targetBpm: 92,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-open-chords",
      title: "Open chord changes (C–Am–Em–D)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "open-chords.json",
      difficulty: "easy",
      durationSec: 27,
      skillTags: ["chords", "rhythm", "timing"],
      techniqueTags: ["chord_switching"],
      prerequisiteTrackIds: ["bundled-single-string"],
      targetBpm: 76,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-spider",
      title: "Spider exercise (1-2-3-4)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "spider-exercise.json",
      difficulty: "easy",
      durationSec: 41,
      skillTags: ["fretting", "endurance", "timing"],
      techniqueTags: ["finger_independence", "alternate_picking"],
      prerequisiteTrackIds: ["bundled-chromatic"],
      targetBpm: 80,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-arpeggio",
      title: "Arpeggio exercise (C–Em)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "arpeggio-c-em.json",
      difficulty: "intermediate",
      durationSec: 34,
      skillTags: ["arpeggios", "timing", "fretting"],
      techniqueTags: ["arpeggio_shapes", "position_shift"],
      prerequisiteTrackIds: ["bundled-open-chords"],
      targetBpm: 84,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-blues",
      title: "Blues shuffle riff (E)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "blues-shuffle.json",
      difficulty: "intermediate",
      durationSec: 22,
      skillTags: ["rhythm", "riffs", "timing"],
      techniqueTags: ["shuffle_feel", "alternate_picking"],
      prerequisiteTrackIds: ["bundled-single-string"],
      targetBpm: 88,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-power-chords",
      title: "Power chord rhythm (E–G–A–G)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "power-chords.json",
      difficulty: "intermediate",
      durationSec: 16,
      skillTags: ["chords", "rhythm", "riffs"],
      techniqueTags: ["power_chords"],
      prerequisiteTrackIds: ["bundled-open-chords"],
      targetBpm: 96,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-string-skip",
      title: "String skipping (open position)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "string-skipping.json",
      difficulty: "intermediate",
      durationSec: 32,
      skillTags: ["string_skipping", "fretting", "timing"],
      techniqueTags: ["string_skipping", "alternate_picking"],
      prerequisiteTrackIds: ["bundled-spider"],
      targetBpm: 82,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-hammer-pull",
      title: "Hammer-on / pull-off drill",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "hammer-pull-drill.json",
      difficulty: "intermediate",
      durationSec: 17,
      skillTags: ["legato", "fretting", "timing"],
      techniqueTags: ["hammer_on", "pull_off"],
      prerequisiteTrackIds: ["bundled-spider"],
      targetBpm: 78,
      masteryAccuracyThreshold: 85,
    },
    {
      id: "bundled-sustained",
      title: "Sustained melody (Am feel)",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "bundled",
      bundledChartFile: "sustained-melody.json",
      difficulty: "advanced",
      durationSec: 15,
      skillTags: ["single_note", "timing", "endurance"],
      techniqueTags: ["sustain_control", "position_shift"],
      prerequisiteTrackIds: ["bundled-arpeggio", "bundled-hammer-pull"],
      targetBpm: 74,
      masteryAccuracyThreshold: 88,
    },
    {
      id: "demo-warmup",
      title: "Demo: ladder & sustain",
      artist: "Fretflow",
      tier: "free",
      practiceChartKey: "demo",
      difficulty: "beginner",
      durationSec: 7,
      skillTags: ["timing", "single_note"],
      techniqueTags: ["alternate_picking"],
      targetBpm: 70,
      masteryAccuracyThreshold: 85,
    },
    buildPremiumTrack({
      id: "premium-blues",
      title: "Blues turnaround in A",
      artist: "Catalog preview",
      tier: "premium",
      premiumAccessIds: ["pro", "blues_pack"],
      difficulty: "advanced",
      skillTags: ["riffs", "rhythm"],
      techniqueTags: ["shuffle_feel", "power_chords"],
      targetBpm: 100,
      masteryAccuracyThreshold: 88,
      bundledChartFile: "blues-shuffle.json",
    }),
    buildPremiumTrack({
      id: "premium-fingerstyle",
      title: "Fingerstyle étude No. 1",
      artist: "Catalog preview",
      tier: "premium",
      premiumAccessIds: ["pro", "fingerstyle_pack"],
      difficulty: "advanced",
      skillTags: ["fretting", "timing"],
      techniqueTags: ["finger_independence", "sustain_control"],
      targetBpm: 84,
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
