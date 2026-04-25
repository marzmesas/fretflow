import type { SubscriptionState } from "../ipc";
import type { CatalogTrackStub } from "./types";

export type CatalogTrackAccess = {
  state: "available" | "premium_locked" | "coming_soon";
  canPractice: boolean;
  isPremiumLocked: boolean;
  isComingSoon: boolean;
};

function hasPlayableChart(track: CatalogTrackStub): boolean {
  if (track.practiceChartKey === "demo") return true;
  if (track.practiceChartKey === "bundled") {
    return Boolean(track.bundledChartFile?.trim());
  }
  return false;
}

export function getCatalogTrackAccess(
  track: CatalogTrackStub,
  subscription: SubscriptionState | null,
): CatalogTrackAccess {
  const entitled = subscription?.entitled ?? false;
  if (track.tier === "premium" && !entitled) {
    return {
      state: "premium_locked",
      canPractice: false,
      isPremiumLocked: true,
      isComingSoon: false,
    };
  }

  if (track.locked || !hasPlayableChart(track)) {
    return {
      state: "coming_soon",
      canPractice: false,
      isPremiumLocked: false,
      isComingSoon: true,
    };
  }

  return {
    state: "available",
    canPractice: true,
    isPremiumLocked: false,
    isComingSoon: false,
  };
}
