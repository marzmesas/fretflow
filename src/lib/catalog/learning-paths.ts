import type { SessionSummaryV1 } from "../chart/session-storage";
import { getLatestSessionsByTrackId } from "../chart/session-storage";
import { MOCK_CATALOG } from "./mock-catalog";
import type { CatalogTrackStub } from "./types";

const DEFAULT_COMPLETION_ACCURACY_THRESHOLD = 85;

export type LearningPathId = "starter" | "rhythm" | "technique";

export type LearningPathStep = {
  track: CatalogTrackStub;
  note: string;
};

export type LearningPath = {
  id: LearningPathId;
  title: string;
  description: string;
  steps: LearningPathStep[];
};

export type LearningPathProgress = {
  path: LearningPath;
  completedSteps: number;
  totalSteps: number;
  completionPercent: number;
  nextStep: LearningPathStep | null;
  status: "not_started" | "in_progress" | "completed";
};

function trackById(trackId: string): CatalogTrackStub {
  const track = MOCK_CATALOG.find((item) => item.id === trackId);
  if (track == null) {
    throw new Error(`Unknown learning path track: ${trackId}`);
  }
  return track;
}

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: "starter",
    title: "Starter path",
    description: "Build first-run confidence with short bundled drills before longer melodic work.",
    steps: [
      { track: trackById("bundled-one-note"), note: "Single-note timing and input verification." },
      { track: trackById("bundled-chromatic"), note: "Left-hand warm-up with steady motion." },
      { track: trackById("bundled-major-scale"), note: "Scale continuity without rushing position changes." },
      { track: trackById("bundled-pentatonic"), note: "Basic shape memory at an easy tempo." },
      { track: trackById("bundled-open-chords"), note: "Apply timing control to multi-note changes." },
    ],
  },
  {
    id: "rhythm",
    title: "Rhythm builder",
    description: "Move from single-string pulse to chord and riff timing with groove-focused charts.",
    steps: [
      { track: trackById("bundled-single-string"), note: "Lock your picking hand to a simple subdivision." },
      { track: trackById("bundled-power-chords"), note: "Keep chord changes tight without losing pulse." },
      { track: trackById("bundled-open-chords"), note: "Transfer groove control into wider voicings." },
      { track: trackById("bundled-blues"), note: "Hold a shuffle feel through repeating phrases." },
    ],
  },
  {
    id: "technique",
    title: "Technique ladder",
    description: "Climb through coordination-heavy drills that push fretting accuracy and string control.",
    steps: [
      { track: trackById("bundled-chromatic"), note: "Set a clean baseline before harder movement." },
      { track: trackById("bundled-spider"), note: "Increase finger independence across adjacent strings." },
      { track: trackById("bundled-string-skip"), note: "Stay precise while jumping across strings." },
      { track: trackById("bundled-hammer-pull"), note: "Control articulation without over-gripping." },
      { track: trackById("bundled-arpeggio"), note: "Connect shapes cleanly across multiple string sets." },
      { track: trackById("bundled-sustained"), note: "Finish with cleaner tone and note duration control." },
    ],
  },
];

export function getLearningPathProgress(history: SessionSummaryV1[]): LearningPathProgress[] {
  const latestByTrackId = getLatestSessionsByTrackId(history);

  return LEARNING_PATHS.map((path) => {
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
    const completionPercent = Math.round((completedSteps / totalSteps) * 100);
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
