import { listPlayableBundledCatalogTracks } from "./catalog-service";
import type { CatalogDifficulty, CatalogTrackStub } from "./types";
import type { SessionSummaryV1 } from "$lib/chart/session-storage";

const DIFFICULTY_ORDER: CatalogDifficulty[] = ["beginner", "easy", "intermediate", "advanced"];

export type RecommendedTrack = {
  track: CatalogTrackStub;
  reason: string;
};

function difficultyIndex(difficulty: CatalogDifficulty | undefined): number {
  if (difficulty == null) return 0;
  const index = DIFFICULTY_ORDER.indexOf(difficulty);
  return index === -1 ? 0 : index;
}

export function getRecommendedTracks(
  history: SessionSummaryV1[],
  limit = 3,
  bundledTracks: CatalogTrackStub[] = listPlayableBundledCatalogTracks(),
): RecommendedTrack[] {
  const bundled = bundledTracks;
  if (bundled.length === 0) return [];

  const practicedTrackIds = history
    .map((session) => session.practiceTrackId?.trim() ?? "")
    .filter((trackId) => trackId !== "");
  const uniquePracticed = new Set(practicedTrackIds);
  const lastTrackId = practicedTrackIds[0] ?? null;
  const lastTrack = lastTrackId ? bundled.find((track) => track.id === lastTrackId) ?? null : null;
  const lastAccuracy = history[0]?.accuracyPercent ?? null;

  const unseen = bundled.filter((track) => !uniquePracticed.has(track.id));
  const practiced = bundled.filter((track) => uniquePracticed.has(track.id));

  if (lastTrack == null || lastAccuracy == null) {
    return unseen.slice(0, limit).map((track, index) => ({
      track,
      reason:
        index === 0
          ? "Good starting point from the bundled library."
          : "Fresh chart to build momentum.",
    }));
  }

  const currentDifficulty = difficultyIndex(lastTrack.difficulty);
  const targetDifficulty =
    lastAccuracy >= 90
      ? Math.min(currentDifficulty + 1, DIFFICULTY_ORDER.length - 1)
      : lastAccuracy >= 75
        ? currentDifficulty
        : Math.max(0, currentDifficulty - 1);

  const exactDifficulty = unseen.filter(
    (track) => difficultyIndex(track.difficulty) === targetDifficulty && track.id !== lastTrack.id,
  );
  const fallbackDifficulty = unseen
    .filter((track) => track.id !== lastTrack.id)
    .sort(
      (a, b) =>
        Math.abs(difficultyIndex(a.difficulty) - targetDifficulty) -
        Math.abs(difficultyIndex(b.difficulty) - targetDifficulty),
    );

  const candidates = [...exactDifficulty, ...fallbackDifficulty].filter(
    (track, index, all) => all.findIndex((candidate) => candidate.id === track.id) === index,
  );

  const recommendations: RecommendedTrack[] = candidates.slice(0, limit).map((track, index) => {
    if (index === 0) {
      if (lastAccuracy >= 90) {
        return {
          track,
          reason: `You scored ${lastAccuracy}% on ${lastTrack.title}. This is a good step up.`,
        };
      }
      if (lastAccuracy >= 75) {
        return {
          track,
          reason: `You are stable on ${lastTrack.title}. Try another ${track.difficulty ?? "next"} chart at a similar level.`,
        };
      }
      return {
        track,
        reason: `You were at ${lastAccuracy}% on ${lastTrack.title}. This keeps you in a safer range.`,
      };
    }
    return {
      track,
      reason: "Another bundled chart worth rotating into your next session.",
    };
  });

  if (recommendations.length < limit) {
    const practicedFallback = practiced
      .filter((track) => track.id !== lastTrack.id)
      .slice(0, limit - recommendations.length)
      .map((track) => ({
        track,
        reason: "Revisit a previously practiced chart to consolidate accuracy.",
      }));
    recommendations.push(...practicedFallback);
  }

  return recommendations.slice(0, limit);
}
