import type { SubscriptionState } from "../ipc";

export const SUBSCRIPTION_LIFECYCLE_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceling",
  "canceled",
  "none",
  "unknown",
] as const;

export type SubscriptionLifecycleStatus = (typeof SUBSCRIPTION_LIFECYCLE_STATUSES)[number];
export type SubscriptionLifecycleTone = "active" | "grace" | "warning" | "inactive" | "unknown";

export type SubscriptionLifecycleSummary = {
  status: SubscriptionLifecycleStatus;
  tone: SubscriptionLifecycleTone;
  badgeLabel: string;
  headline: string;
  summary: string;
  nextStep: string;
  billingMomentLabel: string;
  billingMomentValue: string;
};

const DAY_MS = 86_400_000;

function formatMoment(unixMs: number | null): string {
  if (unixMs == null || unixMs <= 0) return "Not scheduled yet";
  return new Date(unixMs).toLocaleString();
}

function computeGraceDeadline(state: SubscriptionState): number | null {
  if (state.lastSyncOkUnixMs <= 0) return null;
  return state.lastSyncOkUnixMs + state.graceDays * DAY_MS;
}

export function normalizeSubscriptionStatus(
  status: string | null | undefined,
): SubscriptionLifecycleStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceling":
    case "canceled":
    case "none":
      return status;
    default:
      return "unknown";
  }
}

export function getSubscriptionLifecycle(
  state: SubscriptionState | null,
): SubscriptionLifecycleSummary {
  if (state == null) {
    return {
      status: "unknown",
      tone: "unknown",
      badgeLabel: "Unknown",
      headline: "Plan state is still loading.",
      summary: "Fretflow has not resolved the local subscription snapshot yet.",
      nextStep: "Open the desktop app account surface and run a plan check once the service URL is set.",
      billingMomentLabel: "Next billing event",
      billingMomentValue: "Unavailable",
    };
  }

  if (state.offlineGraceActive) {
    return {
      status: "active",
      tone: "grace",
      badgeLabel: "Offline grace",
      headline: "Premium access is being held open from the cached plan snapshot.",
      summary: "The last live plan check failed, but the previous paid state is still within the offline grace window.",
      nextStep: "Reconnect and run another plan check before the grace window ends.",
      billingMomentLabel: "Grace ends",
      billingMomentValue: formatMoment(computeGraceDeadline(state)),
    };
  }

  const status = normalizeSubscriptionStatus(state.subscriptionStatus);

  switch (status) {
    case "active":
      return {
        status,
        tone: "active",
        badgeLabel: "Active",
        headline: "Pro access is active on this device.",
        summary: "Premium previews should resolve to your connected plan once entitlement delivery is fully live.",
        nextStep: "Keep the service URL connected so plan sync and analytics delivery stay current.",
        billingMomentLabel: "Renews",
        billingMomentValue: formatMoment(state.validUntilUnixMs),
      };
    case "trialing":
      return {
        status,
        tone: "active",
        badgeLabel: "Trial",
        headline: "Trial access is active.",
        summary: "This is the clearest preview of the eventual premium funnel: guided paths, premium catalog, and continuity should all feel unlocked.",
        nextStep: "Use plan checks to verify that trial state and entitlement-aware UI stay aligned.",
        billingMomentLabel: "Trial ends",
        billingMomentValue: formatMoment(state.validUntilUnixMs),
      };
    case "past_due":
      return {
        status,
        tone: "warning",
        badgeLabel: "Past due",
        headline: "Billing needs attention before premium access can be trusted.",
        summary: "The account last synced into a past-due state, so premium previews should be treated as blocked until billing recovers.",
        nextStep: "When checkout exists, this state should route straight into billing recovery instead of a generic upgrade prompt.",
        billingMomentLabel: "Billing deadline",
        billingMomentValue: formatMoment(state.validUntilUnixMs),
      };
    case "canceling":
      return {
        status,
        tone: "warning",
        badgeLabel: "Ending soon",
        headline: "The plan is set to end at the close of the current period.",
        summary: "This is a retention-sensitive state: premium access should stay understandable while the user decides whether to keep it.",
        nextStep: "Show what remains available through the period end and what falls back to local-only afterward.",
        billingMomentLabel: "Access ends",
        billingMomentValue: formatMoment(state.validUntilUnixMs),
      };
    case "canceled":
      return {
        status,
        tone: "inactive",
        badgeLabel: "Canceled",
        headline: "This account is back on the free local-first tier.",
        summary: "Saved local practice data remains available, but premium catalog access should stay locked until a new paid state arrives.",
        nextStep: "Use plans and packs to explain what can be re-enabled without hiding the free workflow.",
        billingMomentLabel: "Ended",
        billingMomentValue: formatMoment(state.validUntilUnixMs),
      };
    case "none":
      return {
        status,
        tone: "inactive",
        badgeLabel: "Free",
        headline: "This device is currently on the free starter tier.",
        summary: "Bundled drills, imports, saved loops, and local history remain available without a plan.",
        nextStep: "Use the plan and pack previews below to explain what premium adds without breaking the local-first story.",
        billingMomentLabel: "Upgrade path",
        billingMomentValue: "Available when checkout ships",
      };
    case "unknown":
    default:
      return {
        status: "unknown",
        tone: "unknown",
        badgeLabel: "Unknown",
        headline: "Plan state is available, but the lifecycle type is not recognized yet.",
        summary: "The account UI should not silently collapse unhandled billing states into generic copy.",
        nextStep: "Add explicit handling for the new status before treating it as production-ready.",
        billingMomentLabel: "Next billing event",
        billingMomentValue: formatMoment(state.validUntilUnixMs),
      };
  }
}
