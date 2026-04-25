import type { FrontendUserProfile } from "./profile";

export type RemoteUserProfileV1 = {
  schemaVersion: 1;
  fields: {
    displayName: string | null;
    practiceGoal: string | null;
    recommendedPathId: string | null;
    recommendedTrackId: string | null;
    dailyGoalSessions: number;
  };
};

export function buildRemoteUserProfileSeed(
  profile: FrontendUserProfile,
): RemoteUserProfileV1 {
  return {
    schemaVersion: 1,
    fields: {
      displayName: profile.auth.signedIn ? profile.auth.displayName : null,
      practiceGoal: profile.learning.practiceGoal,
      recommendedPathId: profile.learning.recommendedPathId,
      recommendedTrackId: profile.learning.recommendedTrackId,
      dailyGoalSessions: profile.practice.dailyGoalSessions,
    },
  };
}
