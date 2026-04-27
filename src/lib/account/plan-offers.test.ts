import { describe, expect, it } from "vitest";
import {
  CONTENT_PACK_OFFERS,
  describeTrackPremiumAccess,
  getContentPackOffersForTrack,
} from "./plan-offers";

describe("plan-offers", () => {
  it("maps premium tracks to their preview content packs", () => {
    expect(
      getContentPackOffersForTrack({
        tier: "premium",
        premiumAccessIds: ["pro", "blues_pack"],
      }).map((offer) => offer.id),
    ).toEqual(["blues_pack"]);
  });

  it("describes pack-backed premium rows for the library", () => {
    expect(
      describeTrackPremiumAccess({
        tier: "premium",
        premiumAccessIds: ["pro", "fingerstyle_pack"],
      }),
    ).toContain(CONTENT_PACK_OFFERS[1]?.name ?? "");
  });

  it("returns no pack previews for free tracks", () => {
    expect(
      getContentPackOffersForTrack({
        tier: "free",
        premiumAccessIds: [],
      }),
    ).toEqual([]);
  });
});
