import { describe, expect, it } from "vitest";
import { buildRemoteUserProfileSeed } from "./remote-profile";
import type { FrontendUserProfile } from "./profile";

function makeProfile(overrides: Partial<FrontendUserProfile> = {}): FrontendUserProfile {
  return {
    schemaVersion: 1,
    auth: {
      state: "guest",
      signedIn: false,
      displayName: "Guest",
      accountLabel: "Guest",
      authKind: null,
      signedInAtUnixMs: null,
      entitlements: [],
    },
    subscription: {
      entitled: false,
      status: "none",
      tier: null,
      apiBaseUrl: "",
      lastSyncOkUnixMs: null,
      syncReady: false,
    },
    learning: {
      onboardingCompleted: false,
      onboardingHidden: false,
      remainingSteps: ["settings", "library", "practice"],
      experienceLevel: null,
      practiceGoal: null,
      recommendedPathId: null,
      recommendedPathTitle: null,
      recommendedTrackId: null,
      recommendedTrackTitle: null,
    },
    practice: {
      streakDays: 0,
      goalProgress: "0/1",
      goalMetToday: false,
      dailyGoalSessions: 1,
    },
    analytics: {
      pendingEvents: 0,
    },
    ...overrides,
  };
}

describe("remote profile seed", () => {
  it("keeps guest identity out of the remote profile payload", () => {
    expect(buildRemoteUserProfileSeed(makeProfile()).fields.displayName).toBeNull();
  });

  it("projects the first server-owned profile fields", () => {
    const payload = buildRemoteUserProfileSeed(
      makeProfile({
        auth: {
          state: "local_dev",
          signedIn: true,
          displayName: "Mario",
          accountLabel: "Mario",
          authKind: "dev",
          signedInAtUnixMs: 1,
          entitlements: [],
        },
        learning: {
          onboardingCompleted: true,
          onboardingHidden: true,
          remainingSteps: [],
          experienceLevel: "returning",
          practiceGoal: "rhythm",
          recommendedPathId: "rhythm",
          recommendedPathTitle: "Rhythm builder",
          recommendedTrackId: "bundled-power-chords",
          recommendedTrackTitle: "Power chord rhythm (E–G–A–G)",
        },
        practice: {
          streakDays: 3,
          goalProgress: "2/2",
          goalMetToday: true,
          dailyGoalSessions: 2,
        },
      }),
    );

    expect(payload).toEqual({
      schemaVersion: 1,
      fields: {
        displayName: "Mario",
        practiceGoal: "rhythm",
        recommendedPathId: "rhythm",
        recommendedTrackId: "bundled-power-chords",
        dailyGoalSessions: 2,
      },
    });
  });
});
