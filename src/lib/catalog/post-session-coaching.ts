import type { LearningPathContinuation } from "./learning-paths";
import type { CatalogTrackStub } from "./types";

type ChartInsightLike = {
  totalSessions: number;
  latestAccuracy: number | null;
  averageAccuracy: number | null;
  accuracyDelta: number | null;
};

export type CoachingNote = {
  id: string;
  title: string;
  body: string;
};

function formatTag(value: string | undefined): string | null {
  return value ? value.replaceAll("_", " ") : null;
}

export function getPostSessionCoaching(
  track: CatalogTrackStub | null,
  insight: ChartInsightLike,
  pathContinuation: LearningPathContinuation | null,
): CoachingNote[] {
  if (track == null || insight.totalSessions === 0) return [];

  const notes: CoachingNote[] = [];
  const threshold = track.masteryAccuracyThreshold ?? 85;
  const primaryTechnique = formatTag(track.techniqueTags?.[0]);
  const primarySkill = formatTag(track.skillTags?.[0]);

  if (primaryTechnique || primarySkill) {
    notes.push({
      id: "focus",
      title: "Focus area",
      body: primaryTechnique
        ? `This chart is primarily building ${primaryTechnique}. Use the loop tools to repeat only the phrase where that motion breaks down.`
        : `This chart is primarily building ${primarySkill}. Aim for consistency before increasing speed or density.`,
    });
  }

  if (insight.latestAccuracy != null && insight.latestAccuracy < threshold) {
    notes.push({
      id: "mastery",
      title: "Mastery target",
      body: `Stay on this chart until you clear ${threshold}% accuracy. Right now the path logic still considers this step in progress.`,
    });
  } else if (insight.latestAccuracy != null) {
    notes.push({
      id: "mastery",
      title: "Mastery target",
      body: `You cleared the ${threshold}% mastery threshold for this chart. Preserve the preset or saved loop, then move the difficulty up intentionally.`,
    });
  }

  if ((track.prerequisiteTrackIds?.length ?? 0) > 0 && insight.latestAccuracy != null && insight.latestAccuracy < threshold) {
    notes.push({
      id: "prerequisites",
      title: "Reinforcement",
      body: `If this still feels unstable, revisit one prerequisite chart before the next full run. This step assumes earlier movement patterns are already clean.`,
    });
  }

  if (track.targetBpm != null) {
    notes.push({
      id: "tempo",
      title: "Tempo goal",
      body: `Target pace for this chart is ${track.targetBpm} BPM. Use saved loops to get trouble spots clean first, then bring the full chart back to tempo.`,
    });
  }

  if (pathContinuation?.state === "advance" && pathContinuation.nextTrackTitle) {
    notes.push({
      id: "path",
      title: "Path progression",
      body: `Your seeded path is ready to advance to ${pathContinuation.nextTrackTitle}. Take that next step while this result is still fresh.`,
    });
  }

  return notes.slice(0, 4);
}
