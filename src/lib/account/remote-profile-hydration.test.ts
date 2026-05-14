import { describe, expect, it } from "vitest";
import { getRemoteProfileHydrationDecision } from "./remote-profile-hydration";
import type { FrontendUserProfile } from "./profile";
import type { RemoteUserProfileV1 } from "./remote-profile";

function localProfile(dailyGoalSessions: number): FrontendUserProfile {
  return {
    schemaVersion: 1,
    auth: {
      state: "remote_auth",
      signedIn: true,
      displayName: "Mario",
      accountLabel: "Mario",
      authKind: "email_link",
      signedInAtUnixMs: null,
      entitlements: [],
    },
    subscription: {
      entitled: false,
      status: "inactive",
      tier: null,
      apiBaseUrl: "http://localhost:8787",
      lastSyncOkUnixMs: null,
      syncReady: true,
    },
    learning: {
      onboardingCompleted: true,
      onboardingHidden: true,
      remainingSteps: [],
      experienceLevel: "returning",
      practiceGoal: "rhythm",
      recommendedPathId: "rhythm",
      recommendedPathTitle: "Rhythm",
      recommendedTrackId: "bundled-power-chords",
      recommendedTrackTitle: "Power Chords",
    },
    practice: {
      streakDays: 1,
      goalProgress: "0/1",
      goalMetToday: false,
      dailyGoalSessions,
    },
    analytics: {
      pendingEvents: 0,
    },
  };
}

function remoteProfile(dailyGoalSessions: number): RemoteUserProfileV1 {
  return {
    schemaVersion: 1,
    revision: 2,
    seedSource: "backend_persisted",
    fields: {
      displayName: "Mario",
      practiceGoal: "rhythm",
      recommendedPathId: "rhythm",
      recommendedTrackId: "bundled-power-chords",
      dailyGoalSessions,
    },
  };
}

describe("remote profile hydration", () => {
  it("does nothing when local and cloud daily goals already match", () => {
    const decision = getRemoteProfileHydrationDecision({
      localProfile: localProfile(2),
      remoteProfile: remoteProfile(2),
    });

    expect(decision).toEqual({
      action: "noop",
      status: null,
    });
  });

  it("hydrates the cloud daily goal onto a default local device target", () => {
    const decision = getRemoteProfileHydrationDecision({
      localProfile: localProfile(1),
      remoteProfile: remoteProfile(3),
    });

    expect(decision.action).toBe("apply_remote");
    expect(decision.status).toContain("cloud daily goal target (3)");
  });

  it("keeps local state when this device already has a custom target", () => {
    const decision = getRemoteProfileHydrationDecision({
      localProfile: localProfile(2),
      remoteProfile: remoteProfile(4),
    });

    expect(decision.action).toBe("keep_local");
    expect(decision.status).toContain("Local setup stays in place");
  });
});
