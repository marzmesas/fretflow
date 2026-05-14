import type { FrontendUserProfile } from "./profile";
import type { RemoteUserProfileV1 } from "./remote-profile";

export type RemoteProfileHydrationDecision =
  | {
      action: "noop";
      status: string | null;
    }
  | {
      action: "apply_remote";
      status: string;
    }
  | {
      action: "keep_local";
      status: string;
    };

export function getRemoteProfileHydrationDecision(input: {
  localProfile: FrontendUserProfile;
  remoteProfile: RemoteUserProfileV1;
}): RemoteProfileHydrationDecision {
  const localTarget = input.localProfile.practice.dailyGoalSessions;
  const remoteTarget = input.remoteProfile.fields.dailyGoalSessions;

  if (localTarget === remoteTarget) {
    return {
      action: "noop",
      status: null,
    };
  }

  if (localTarget === 1 && remoteTarget !== 1) {
    return {
      action: "apply_remote",
      status: `Loaded your cloud daily goal target (${remoteTarget}) on this device.`,
    };
  }

  return {
    action: "keep_local",
    status:
      "This device already has a different daily goal target. Local setup stays in place; use Account if you want to apply the cloud value.",
  };
}
