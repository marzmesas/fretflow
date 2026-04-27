import type { CatalogPremiumAccessId, CatalogTrackStub } from "../catalog/types";

export type PlanOffer = {
  id: "free" | "pro";
  name: string;
  cadence: string;
  priceLabel: string;
  accent: "neutral" | "premium";
  summary: string;
  features: string[];
};

export type ContentPackOffer = {
  id: Exclude<CatalogPremiumAccessId, "pro">;
  name: string;
  priceLabel: string;
  focus: string;
  summary: string;
  includedTrackIds: string[];
};

export const PLAN_OFFERS: readonly PlanOffer[] = [
  {
    id: "free",
    name: "Free",
    cadence: "Local-first",
    priceLabel: "$0",
    accent: "neutral",
    summary: "Start with bundled drills, imports, and on-device progress.",
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
    summary: "Full guided progression and catalog access once entitlement delivery is live.",
    features: [
      "Premium catalog unlocks once entitlement delivery is live",
      "Cross-device identity and profile continuity",
      "Future cloud-backed progression and plan sync",
    ],
  },
] as const;

export const CONTENT_PACK_OFFERS: readonly ContentPackOffer[] = [
  {
    id: "blues_pack",
    name: "Blues Turnarounds Pack",
    priceLabel: "$7.99",
    focus: "Riffs and shuffle feel",
    summary: "A one-off pack for players who want bite-sized blues material without the full subscription.",
    includedTrackIds: ["premium-blues"],
  },
  {
    id: "fingerstyle_pack",
    name: "Fingerstyle Studies Pack",
    priceLabel: "$9.99",
    focus: "Finger independence and sustain",
    summary: "A one-off pack aimed at technique players who want curated études instead of the full catalog.",
    includedTrackIds: ["premium-fingerstyle"],
  },
] as const;

export function getContentPackOffersForTrack(
  track: Pick<CatalogTrackStub, "tier" | "premiumAccessIds">,
): ContentPackOffer[] {
  if (track.tier !== "premium") return [];
  const accessIds = new Set(track.premiumAccessIds ?? []);
  return CONTENT_PACK_OFFERS.filter((offer) => accessIds.has(offer.id));
}

export function describeTrackPremiumAccess(
  track: Pick<CatalogTrackStub, "tier" | "premiumAccessIds">,
): string | null {
  if (track.tier !== "premium") return null;
  const packOffers = getContentPackOffersForTrack(track);
  if (packOffers.length === 0) {
    return "Included in Pro once premium unlocks ship.";
  }
  if (packOffers.length === 1) {
    return `Included in Pro or ${packOffers[0].name}.`;
  }
  return `Included in Pro or ${packOffers.length} preview packs.`;
}
