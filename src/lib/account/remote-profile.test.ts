import { describe, expect, it, vi } from "vitest";
import {
  buildRemoteUserProfileSeed,
  loadRemoteUserProfile,
  previewRemoteUserProfileSeed,
  RemoteProfileWriteConflictError,
  saveRemoteUserProfile,
} from "./remote-profile";
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
      revision: 0,
      seedSource: "frontend_preview",
      fields: {
        displayName: "Mario",
        practiceGoal: "rhythm",
        recommendedPathId: "rhythm",
        recommendedTrackId: "bundled-power-chords",
        dailyGoalSessions: 2,
      },
    });
  });

  it("loads the remote profile payload from the API", async () => {
    const profile = await loadRemoteUserProfile({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "player@example.com",
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          revision: 0,
          seedSource: "mock_seed",
          fields: {
            displayName: "Local dev",
            practiceGoal: "fundamentals",
            recommendedPathId: "starter",
            recommendedTrackId: "bundled-one-note",
            dailyGoalSessions: 1,
          },
        }),
      })) as unknown as typeof fetch,
    });

    expect(profile.fields.recommendedPathId).toBe("starter");
  });

  it("previews a frontend-backed remote seed through the API", async () => {
    const seed = buildRemoteUserProfileSeed(
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
          practiceGoal: "technique",
          recommendedPathId: "technique",
          recommendedPathTitle: "Technique ladder",
          recommendedTrackId: "bundled-palm-mute-drill",
          recommendedTrackTitle: "Palm mute drill",
        },
        practice: {
          streakDays: 2,
          goalProgress: "1/3",
          goalMetToday: false,
          dailyGoalSessions: 3,
        },
      }),
    );

    const profile = await previewRemoteUserProfileSeed({
      apiBaseUrl: "http://127.0.0.1:8787",
      seed,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({
          ...seed,
          revision: 0,
          seedSource: "frontend_preview",
        }),
      })) as unknown as typeof fetch,
    });

    expect(profile.seedSource).toBe("frontend_preview");
    expect(profile.fields.recommendedTrackId).toBe("bundled-palm-mute-drill");
  });

  it("writes the remote profile payload to the API", async () => {
    const seed = buildRemoteUserProfileSeed(
      makeProfile({
        auth: {
          state: "remote_auth",
          signedIn: true,
          displayName: "Mario",
          accountLabel: "Mario",
          authKind: "email",
          signedInAtUnixMs: 1,
          entitlements: [],
        },
      }),
    );

    const profile = await saveRemoteUserProfile({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "player@example.com",
      profile: seed,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({
          ...seed,
          revision: 1,
          seedSource: "backend_persisted",
        }),
      })) as unknown as typeof fetch,
    });

    expect(profile.seedSource).toBe("backend_persisted");
    expect(profile.fields.displayName).toBe("Mario");
  });

  it("includes account identity in remote profile requests", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        revision: 0,
        seedSource: "mock_seed",
        fields: {
          displayName: "Mario",
          practiceGoal: "fundamentals",
          recommendedPathId: "starter",
          recommendedTrackId: "bundled-one-note",
          dailyGoalSessions: 1,
        },
      }),
    })) as unknown as typeof fetch;

    const fetchSpy = vi.fn(fetchImpl);

    await loadRemoteUserProfile({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "PLAYER@example.com",
      fetchImpl: fetchSpy,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/profile?accountId=acct_123&email=player%40example.com",
    );
  });

  it("surfaces the latest cloud profile on a stale profile write", async () => {
    const seed = buildRemoteUserProfileSeed(
      makeProfile({
        auth: {
          state: "remote_auth",
          signedIn: true,
          displayName: "Mario",
          accountLabel: "Mario",
          authKind: "email",
          signedInAtUnixMs: 1,
          entitlements: [],
        },
      }),
    );

    let thrown: unknown = null;
    try {
      await saveRemoteUserProfile({
        apiBaseUrl: "http://127.0.0.1:8787",
        accountId: "acct_123",
        email: "player@example.com",
        profile: {
          ...seed,
          revision: 2,
        },
        fetchImpl: (async () => ({
          ok: false,
          status: 409,
          json: async () => ({
            ...seed,
            revision: 3,
            seedSource: "backend_persisted",
          }),
        })) as unknown as typeof fetch,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RemoteProfileWriteConflictError);
    expect((thrown as RemoteProfileWriteConflictError).currentProfile.revision).toBe(3);
  });
});
