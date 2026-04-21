const STORAGE_KEY = "fretflow.onboarding.v1";

export type OnboardingStepId = "settings" | "library" | "practice";

type OnboardingStateV1 = {
  schemaVersion: 1;
  dismissedAt: string | null;
  settingsVisitedAt: string | null;
  libraryVisitedAt: string | null;
  practiceVisitedAt: string | null;
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
};

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
