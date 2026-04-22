const STORAGE_KEY = "fretflow.onboarding.v1";

export type OnboardingStepId = "settings" | "library" | "practice";
export type OnboardingExperienceLevel = "brand_new" | "returning" | "comfortable";
export type OnboardingPracticeGoal = "fundamentals" | "rhythm" | "technique";

export type OnboardingAssessment = {
  experienceLevel: OnboardingExperienceLevel;
  practiceGoal: OnboardingPracticeGoal;
  recommendedPathId: string;
  recommendedTrackId: string;
  answeredAt: string;
};

type OnboardingStateV1 = {
  schemaVersion: 1;
  dismissedAt: string | null;
  settingsVisitedAt: string | null;
  libraryVisitedAt: string | null;
  practiceVisitedAt: string | null;
  assessment: OnboardingAssessment | null;
};

export type OnboardingSnapshot = OnboardingStateV1 & {
  completed: boolean;
  hidden: boolean;
  remainingSteps: OnboardingStepId[];
};

const DEFAULT_STATE: OnboardingStateV1 = {
  schemaVersion: 1,
  dismissedAt: null,
  settingsVisitedAt: null,
  libraryVisitedAt: null,
  practiceVisitedAt: null,
  assessment: null,
};

function isExperienceLevel(value: unknown): value is OnboardingExperienceLevel {
  return value === "brand_new" || value === "returning" || value === "comfortable";
}

function isPracticeGoal(value: unknown): value is OnboardingPracticeGoal {
  return value === "fundamentals" || value === "rhythm" || value === "technique";
}

function parseAssessment(value: unknown): OnboardingAssessment | null {
  if (value == null || typeof value !== "object") return null;
  const candidate = value as Partial<OnboardingAssessment>;
  if (
    !isExperienceLevel(candidate.experienceLevel) ||
    !isPracticeGoal(candidate.practiceGoal) ||
    typeof candidate.recommendedPathId !== "string" ||
    candidate.recommendedPathId.trim() === "" ||
    typeof candidate.recommendedTrackId !== "string" ||
    candidate.recommendedTrackId.trim() === "" ||
    typeof candidate.answeredAt !== "string"
  ) {
    return null;
  }
  return {
    experienceLevel: candidate.experienceLevel,
    practiceGoal: candidate.practiceGoal,
    recommendedPathId: candidate.recommendedPathId,
    recommendedTrackId: candidate.recommendedTrackId,
    answeredAt: candidate.answeredAt,
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readState(): OnboardingStateV1 {
  if (!canUseStorage()) return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<OnboardingStateV1>;
    if (parsed.schemaVersion !== 1) return { ...DEFAULT_STATE };
    return {
      schemaVersion: 1,
      dismissedAt: typeof parsed.dismissedAt === "string" ? parsed.dismissedAt : null,
      settingsVisitedAt:
        typeof parsed.settingsVisitedAt === "string" ? parsed.settingsVisitedAt : null,
      libraryVisitedAt: typeof parsed.libraryVisitedAt === "string" ? parsed.libraryVisitedAt : null,
      practiceVisitedAt:
        typeof parsed.practiceVisitedAt === "string" ? parsed.practiceVisitedAt : null,
      assessment: parseAssessment(parsed.assessment),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state: OnboardingStateV1): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

function toSnapshot(state: OnboardingStateV1): OnboardingSnapshot {
  const remainingSteps: OnboardingStepId[] = [];
  if (state.settingsVisitedAt == null) remainingSteps.push("settings");
  if (state.libraryVisitedAt == null) remainingSteps.push("library");
  if (state.practiceVisitedAt == null) remainingSteps.push("practice");
  const completed = remainingSteps.length === 0;
  return {
    ...state,
    completed,
    hidden: completed || state.dismissedAt != null,
    remainingSteps,
  };
}

function markStepVisited(state: OnboardingStateV1, step: OnboardingStepId): OnboardingStateV1 {
  const now = new Date().toISOString();
  switch (step) {
    case "settings":
      return state.settingsVisitedAt == null ? { ...state, settingsVisitedAt: now } : state;
    case "library":
      return state.libraryVisitedAt == null ? { ...state, libraryVisitedAt: now } : state;
    case "practice":
      return state.practiceVisitedAt == null ? { ...state, practiceVisitedAt: now } : state;
    default: {
      const exhaustive: never = step;
      throw new Error(`Unhandled onboarding step: ${exhaustive}`);
    }
  }
}

export function getOnboardingSnapshot(): OnboardingSnapshot {
  return toSnapshot(readState());
}

export function getOnboardingAssessment(): OnboardingAssessment | null {
  return readState().assessment;
}

export function dismissOnboarding(): OnboardingSnapshot {
  const next: OnboardingStateV1 = {
    ...readState(),
    dismissedAt: new Date().toISOString(),
  };
  writeState(next);
  return toSnapshot(next);
}

export function resetOnboarding(): OnboardingSnapshot {
  writeState(DEFAULT_STATE);
  return toSnapshot(DEFAULT_STATE);
}

export function markOnboardingStepCompleted(step: OnboardingStepId): OnboardingSnapshot {
  const current = readState();
  const next = markStepVisited(current, step);
  if (next !== current) {
    writeState(next);
  }
  return toSnapshot(next);
}

export function saveOnboardingAssessment(
  assessment: Omit<OnboardingAssessment, "answeredAt">,
): OnboardingSnapshot {
  const next: OnboardingStateV1 = {
    ...readState(),
    assessment: {
      ...assessment,
      answeredAt: new Date().toISOString(),
    },
  };
  writeState(next);
  return toSnapshot(next);
}
