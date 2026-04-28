import { describe, expect, it } from "vitest";
import { buildFrontendUserProfile } from "./profile";
import type { AppSession, SubscriptionState } from "$lib/ipc";
import type { OnboardingSnapshot } from "$lib/onboarding-storage";
import type { PracticeGoalsSnapshot } from "$lib/practice-goals-storage";

function makeSession(overrides: Partial<AppSession> = {}): AppSession {
  return {
    schemaVersion: 1,
    signedIn: false,
    authKind: null,
    displayName: null,
    signedInAtUnixMs: null,
    entitlements: [],
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    schemaVersion: 1,
    apiBaseUrl: "",
    graceDays: 7,
    subscriptionStatus: "none",
    tier: null,
    validUntilUnixMs: null,
    lastSyncOkUnixMs: 0,
    lastSyncError: null,
    lastSyncSucceeded: false,
    offlineGraceActive: false,
    entitled: false,
    ...overrides,
  };
}

function makeOnboarding(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    schemaVersion: 1,
    dismissedAt: null,
    settingsVisitedAt: null,
    libraryVisitedAt: null,
    practiceVisitedAt: null,
    assessment: null,
    completed: false,
    hidden: false,
    remainingSteps: ["settings", "library", "practice"],
    ...overrides,
  };
}

function makePracticeGoals(overrides: Partial<PracticeGoalsSnapshot> = {}): PracticeGoalsSnapshot {
  return {
    schemaVersion: 1,
    dailyGoalSessions: 1,
    lastLocalDay: null,
    streakDays: 0,
    sessionsToday: 0,
    goalMetToday: false,
    progressToday: "0/1",
    ...overrides,
  };
}

describe("frontend user profile", () => {
  it("builds a guest profile from signed-out state", () => {
    const profile = buildFrontendUserProfile({
      session: makeSession(),
      subscription: makeSubscription(),
      onboarding: makeOnboarding(),
      practiceGoals: makePracticeGoals(),
      pendingAnalyticsEvents: 2,
    });

    expect(profile.auth.state).toBe("guest");
    expect(profile.auth.accountLabel).toBe("Guest");
    expect(profile.subscription.syncReady).toBe(false);
    expect(profile.analytics.pendingEvents).toBe(2);
  });

  it("builds a local dev profile with learning and practice context", () => {
    const profile = buildFrontendUserProfile({
      session: makeSession({
        signedIn: true,
        authKind: "dev",
        displayName: "Mario",
        signedInAtUnixMs: 123,
        entitlements: ["local:library"],
      }),
      subscription: makeSubscription({
        apiBaseUrl: "http://127.0.0.1:8787",
        subscriptionStatus: "active",
        tier: "pro",
        entitled: true,
        lastSyncOkUnixMs: 456,
      }),
      onboarding: makeOnboarding({
        completed: true,
        hidden: true,
        remainingSteps: [],
        assessment: {
          experienceLevel: "returning",
          practiceGoal: "rhythm",
          recommendedPathId: "rhythm",
          recommendedTrackId: "bundled-power-chords",
          answeredAt: new Date(0).toISOString(),
        },
      }),
      practiceGoals: makePracticeGoals({
        dailyGoalSessions: 2,
        streakDays: 4,
        goalMetToday: true,
        progressToday: "2/2",
      }),
      pendingAnalyticsEvents: 0,
    });

    expect(profile.auth.state).toBe("local_dev");
    expect(profile.auth.accountLabel).toBe("Mario");
    expect(profile.learning.recommendedPathTitle).toBe("Rhythm builder");
    expect(profile.learning.recommendedTrackTitle).toBe("Power chord rhythm (E–G–A–G)");
    expect(profile.practice.goalProgress).toBe("2/2");
    expect(profile.subscription.syncReady).toBe(true);
  });

  it("promotes non-dev auth into the remote shell identity state", () => {
    const profile = buildFrontendUserProfile({
      session: makeSession({
        signedIn: true,
        authKind: "email",
        email: "player@example.com",
        displayName: "Player one",
        signedInAtUnixMs: 999,
        entitlements: ["catalog:premium"],
      }),
      subscription: makeSubscription(),
      onboarding: makeOnboarding(),
      practiceGoals: makePracticeGoals(),
      pendingAnalyticsEvents: 1,
    });

    expect(profile.auth.state).toBe("remote_auth");
    expect(profile.auth.accountLabel).toBe("Player one");
    expect(profile.auth.signedIn).toBe(true);
  });
});
