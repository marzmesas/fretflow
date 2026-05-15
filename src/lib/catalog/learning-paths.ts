import type { SessionSummaryV1 } from "../chart/session-storage";
import { getLatestSessionsByTrackId } from "../chart/session-storage";
import { findCatalogTrackById, getCatalogSnapshot } from "./catalog-service";
import type { CatalogTrackStub } from "./types";

const DEFAULT_COMPLETION_ACCURACY_THRESHOLD = 85;

export type LearningPathId = "starter" | "rhythm" | "technique";
export type OnboardingExperienceLevel = "brand_new" | "returning" | "comfortable";
export type OnboardingPracticeGoal = "fundamentals" | "rhythm" | "technique";

type LearningPathStepDefinition = {
  trackId: string;
  note: string;
};

type LearningPathDefinition = {
  id: LearningPathId;
  title: string;
  description: string;
  steps: LearningPathStepDefinition[];
};

export type LearningPathStep = {
  trackId: string;
  track: CatalogTrackStub;
  note: string;
};

export type LearningPath = {
  id: LearningPathId;
  title: string;
  description: string;
  steps: LearningPathStep[];
};

export type LearningPathSummary = Pick<LearningPathDefinition, "id" | "title" | "description">;

export type LearningPathProgress = {
  path: LearningPath;
  completedSteps: number;
  totalSteps: number;
  completionPercent: number;
  nextStep: LearningPathStep | null;
  status: "not_started" | "in_progress" | "completed";
};

export type PathSeedRecommendation = {
  pathId: LearningPathId;
  trackId: string;
};

export type LearningPathContinuation = {
  pathId: LearningPathId;
  pathTitle: string;
  currentStepTrackId: string;
  currentStepTitle: string;
  currentStepThreshold: number;
  nextTrackId: string | null;
  nextTrackTitle: string | null;
  state: "current_step" | "advance" | "completed" | "not_on_path";
};

const LEARNING_PATH_DEFINITIONS: LearningPathDefinition[] = [
  {
    id: "starter",
    title: "Starter path",
    description: "Build first-run confidence with short bundled drills before longer melodic work.",
    steps: [
      { trackId: "bundled-one-note", note: "Single-note timing and input verification." },
      { trackId: "bundled-chromatic", note: "Left-hand warm-up with steady motion." },
      { trackId: "bundled-major-scale", note: "Scale continuity without rushing position changes." },
      { trackId: "bundled-pentatonic", note: "Basic shape memory at an easy tempo." },
      { trackId: "bundled-open-chords", note: "Apply timing control to multi-note changes." },
    ],
  },
  {
    id: "rhythm",
    title: "Rhythm builder",
    description: "Move from single-string pulse to chord and riff timing with groove-focused charts.",
    steps: [
      { trackId: "bundled-single-string", note: "Lock your picking hand to a simple subdivision." },
      { trackId: "bundled-power-chords", note: "Keep chord changes tight without losing pulse." },
      { trackId: "bundled-open-chords", note: "Transfer groove control into wider voicings." },
      { trackId: "bundled-blues", note: "Hold a shuffle feel through repeating phrases." },
    ],
  },
  {
    id: "technique",
    title: "Technique ladder",
    description: "Climb through coordination-heavy drills that push fretting accuracy and string control.",
    steps: [
      { trackId: "bundled-chromatic", note: "Set a clean baseline before harder movement." },
      { trackId: "bundled-spider", note: "Increase finger independence across adjacent strings." },
      { trackId: "bundled-string-skip", note: "Stay precise while jumping across strings." },
      { trackId: "bundled-hammer-pull", note: "Control articulation without over-gripping." },
      { trackId: "bundled-arpeggio", note: "Connect shapes cleanly across multiple string sets." },
      { trackId: "bundled-sustained", note: "Finish with cleaner tone and note duration control." },
    ],
  },
];

function resolveCatalogTracks(catalogTracks?: CatalogTrackStub[]): CatalogTrackStub[] {
  return catalogTracks ?? getCatalogSnapshot().tracks;
}

function resolveTrack(trackId: string, catalogTracks: CatalogTrackStub[]): CatalogTrackStub | null {
  return (
    catalogTracks.find((track) => track.id === trackId) ??
    (catalogTracks === getCatalogSnapshot().tracks ? findCatalogTrackById(trackId) : null)
  );
}

function resolveLearningPath(
  definition: LearningPathDefinition,
  catalogTracks: CatalogTrackStub[],
): LearningPath {
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    steps: definition.steps.flatMap((step) => {
      const track = resolveTrack(step.trackId, catalogTracks);
      return track == null ? [] : [{ trackId: step.trackId, track, note: step.note }];
    }),
  };
}

export const LEARNING_PATHS: LearningPathSummary[] = LEARNING_PATH_DEFINITIONS.map(
  ({ id, title, description }) => ({
    id,
    title,
    description,
  }),
);

export function listLearningPaths(catalogTracks?: CatalogTrackStub[]): LearningPath[] {
  const resolvedTracks = resolveCatalogTracks(catalogTracks);
  return LEARNING_PATH_DEFINITIONS.map((definition) => resolveLearningPath(definition, resolvedTracks));
}

export function getLearningPathById(
  pathId: LearningPathId,
  catalogTracks?: CatalogTrackStub[],
): LearningPath | null {
  const definition = LEARNING_PATH_DEFINITIONS.find((path) => path.id === pathId);
  if (definition == null) return null;
  return resolveLearningPath(definition, resolveCatalogTracks(catalogTracks));
}

export function getLearningPathTrackIds(pathId: LearningPathId): string[] {
  return LEARNING_PATH_DEFINITIONS.find((path) => path.id === pathId)?.steps.map((step) => step.trackId) ?? [];
}

export function getLearningPathContinuation(
  pathId: LearningPathId,
  currentTrackId: string | null | undefined,
  latestAccuracyPercent: number | null | undefined,
  catalogTracks?: CatalogTrackStub[],
): LearningPathContinuation | null {
  const path = getLearningPathById(pathId, catalogTracks);
  const normalizedTrackId = currentTrackId?.trim() ?? "";
  if (path == null || normalizedTrackId === "") return null;

  const stepIndex = path.steps.findIndex((step) => step.track.id === normalizedTrackId);
  if (stepIndex === -1) {
    return {
      pathId,
      pathTitle: path.title,
      currentStepTrackId: normalizedTrackId,
      currentStepTitle: "",
      currentStepThreshold: DEFAULT_COMPLETION_ACCURACY_THRESHOLD,
      nextTrackId: path.steps[0]?.track.id ?? null,
      nextTrackTitle: path.steps[0]?.track.title ?? null,
      state: "not_on_path",
    };
  }

  const currentStep = path.steps[stepIndex]!;
  const nextStep = path.steps[stepIndex + 1] ?? null;
  const threshold = currentStep.track.masteryAccuracyThreshold ?? DEFAULT_COMPLETION_ACCURACY_THRESHOLD;
  const canAdvance = latestAccuracyPercent != null && latestAccuracyPercent >= threshold;

  return {
    pathId,
    pathTitle: path.title,
    currentStepTrackId: currentStep.track.id,
    currentStepTitle: currentStep.track.title,
    currentStepThreshold: threshold,
    nextTrackId: nextStep?.track.id ?? null,
    nextTrackTitle: nextStep?.track.title ?? null,
    state: canAdvance ? (nextStep ? "advance" : "completed") : "current_step",
  };
}

export function recommendLearningPathSeed(
  experienceLevel: OnboardingExperienceLevel,
  practiceGoal: OnboardingPracticeGoal,
): PathSeedRecommendation {
  if (practiceGoal === "rhythm") {
    return {
      pathId: "rhythm",
      trackId: experienceLevel === "brand_new" ? "bundled-single-string" : "bundled-power-chords",
    };
  }
  if (practiceGoal === "technique") {
    return {
      pathId: "technique",
      trackId: experienceLevel === "comfortable" ? "bundled-spider" : "bundled-chromatic",
    };
  }
  return {
    pathId: "starter",
    trackId:
      experienceLevel === "comfortable"
        ? "bundled-major-scale"
        : experienceLevel === "returning"
          ? "bundled-chromatic"
          : "bundled-one-note",
  };
}

export function getLearningPathProgress(
  history: SessionSummaryV1[],
  catalogTracks?: CatalogTrackStub[],
): LearningPathProgress[] {
  const latestByTrackId = getLatestSessionsByTrackId(history);

  return listLearningPaths(catalogTracks).map((path) => {
    let completedSteps = 0;

    for (const step of path.steps) {
      const latestSession = latestByTrackId[step.track.id];
      const threshold = step.track.masteryAccuracyThreshold ?? DEFAULT_COMPLETION_ACCURACY_THRESHOLD;
      if (latestSession == null || latestSession.accuracyPercent < threshold) {
        break;
      }
      completedSteps += 1;
    }

    const totalSteps = path.steps.length;
    const nextStep = path.steps[completedSteps] ?? null;
    const completionPercent = totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100);
    const status =
      completedSteps === 0 ? "not_started" : completedSteps === totalSteps ? "completed" : "in_progress";

    return {
      path,
      completedSteps,
      totalSteps,
      completionPercent,
      nextStep,
      status,
    };
  });
}
