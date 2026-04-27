export type PlanOffer = {
  id: "free" | "pro";
  name: string;
  cadence: string;
  priceLabel: string;
  accent: "neutral" | "premium";
  features: string[];
};

export const PLAN_OFFERS: readonly PlanOffer[] = [
  {
    id: "free",
    name: "Free",
    cadence: "Local-first",
    priceLabel: "$0",
    accent: "neutral",
    features: [
      "Bundled drills and imports on this device",
      "Saved loops, presets, and local history",
      "Mic or MIDI practice with guided setup",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    cadence: "Subscription preview",
    priceLabel: "$11.99/mo",
    accent: "premium",
    features: [
      "Premium catalog unlocks once entitlement delivery is live",
      "Cross-device identity and profile continuity",
      "Future cloud-backed progression and plan sync",
    ],
  },
] as const;
