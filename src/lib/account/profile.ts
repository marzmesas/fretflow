import { getPendingAnalyticsEventCount } from "../analytics/delivery";
import { findCatalogTrackById } from "../catalog/catalog-service";
import { getLearningPathById, type LearningPathId } from "../catalog/learning-paths";
import {
  getOnboardingSnapshot,
  type OnboardingExperienceLevel,
  type OnboardingPracticeGoal,
  type OnboardingSnapshot,
} from "../onboarding-storage";
import {
  loadPracticeGoals,
  toPracticeGoalsSnapshot,
  type PracticeGoalsSnapshot,
} from "../practice-goals-storage";
import type { AppSession, SubscriptionState } from "../ipc";

export type FrontendProfileAuthState = "guest" | "local_dev";

export type FrontendUserProfile = {
  schemaVersion: 1;
  auth: {
    state: FrontendProfileAuthState;
    signedIn: boolean;
    displayName: string;
    accountLabel: string;
    authKind: string | null;
    signedInAtUnixMs: number | null;
    entitlements: string[];
  };
  subscription: {
    entitled: boolean;
    status: string;
    tier: string | null;
    apiBaseUrl: string;
    lastSyncOkUnixMs: number | null;
    syncReady: boolean;
  };
  learning: {
    onboardingCompleted: boolean;
    onboardingHidden: boolean;
    remainingSteps: string[];
    experienceLevel: OnboardingExperienceLevel | null;
    practiceGoal: OnboardingPracticeGoal | null;
    recommendedPathId: LearningPathId | null;
    recommendedPathTitle: string | null;
    recommendedTrackId: string | null;
    recommendedTrackTitle: string | null;
  };
  practice: {
    streakDays: number;
    goalProgress: string;
    goalMetToday: boolean;
    dailyGoalSessions: number;
  };
  analytics: {
    pendingEvents: number;
  };
};

export type FrontendUserProfileInput = {
  session: AppSession | null;
  subscription: SubscriptionState | null;
  onboarding: OnboardingSnapshot;
  practiceGoals: PracticeGoalsSnapshot;
  pendingAnalyticsEvents: number;
};

function isLearningPathId(value: unknown): value is LearningPathId {
  return value === "starter" || value === "rhythm" || value === "technique";
}

function resolveAuthState(session: AppSession | null): FrontendProfileAuthState {
  if (session?.signedIn && session.authKind === "dev") {
    return "local_dev";
  }
  return "guest";
}

function resolveDisplayName(session: AppSession | null, authState: FrontendProfileAuthState): string {
  const candidate = session?.displayName?.trim();
  if (candidate) return candidate;
  return authState === "local_dev" ? "Dev" : "Guest";
}

export function buildFrontendUserProfile(
  input: FrontendUserProfileInput,
): FrontendUserProfile {
  const authState = resolveAuthState(input.session);
  const displayName = resolveDisplayName(input.session, authState);
  const assessment = input.onboarding.assessment;
  const recommendedPathId =
    assessment != null && isLearningPathId(assessment.recommendedPathId)
      ? assessment.recommendedPathId
      : null;
  const recommendedPath = recommendedPathId ? getLearningPathById(recommendedPathId) : null;
  const recommendedTrack = assessment ? findCatalogTrackById(assessment.recommendedTrackId) : null;

  return {
    schemaVersion: 1,
    auth: {
      state: authState,
      signedIn: input.session?.signedIn ?? false,
      displayName,
      accountLabel: displayName,
      authKind: input.session?.authKind ?? null,
      signedInAtUnixMs: input.session?.signedInAtUnixMs ?? null,
      entitlements: input.session?.entitlements ?? [],
    },
    subscription: {
      entitled: input.subscription?.entitled ?? false,
      status: input.subscription?.subscriptionStatus ?? "unknown",
      tier: input.subscription?.tier ?? null,
      apiBaseUrl: input.subscription?.apiBaseUrl ?? "",
      lastSyncOkUnixMs: input.subscription?.lastSyncOkUnixMs ?? null,
      syncReady: (input.subscription?.apiBaseUrl ?? "").trim() !== "",
    },
    learning: {
      onboardingCompleted: input.onboarding.completed,
      onboardingHidden: input.onboarding.hidden,
      remainingSteps: input.onboarding.remainingSteps,
      experienceLevel: assessment?.experienceLevel ?? null,
      practiceGoal: assessment?.practiceGoal ?? null,
      recommendedPathId,
      recommendedPathTitle: recommendedPath?.title ?? null,
      recommendedTrackId: assessment?.recommendedTrackId ?? null,
      recommendedTrackTitle: recommendedTrack?.title ?? null,
    },
    practice: {
      streakDays: input.practiceGoals.streakDays,
      goalProgress: input.practiceGoals.progressToday,
      goalMetToday: input.practiceGoals.goalMetToday,
      dailyGoalSessions: input.practiceGoals.dailyGoalSessions,
    },
    analytics: {
      pendingEvents: input.pendingAnalyticsEvents,
    },
  };
}

export function loadLocalFrontendUserProfile(
  session: AppSession | null,
  subscription: SubscriptionState | null,
): FrontendUserProfile {
  return buildFrontendUserProfile({
    session,
    subscription,
    onboarding: getOnboardingSnapshot(),
    practiceGoals: toPracticeGoalsSnapshot(loadPracticeGoals()),
    pendingAnalyticsEvents: getPendingAnalyticsEventCount(),
  });
}
