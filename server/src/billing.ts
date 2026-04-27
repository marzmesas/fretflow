type CheckoutPreviewOfferId = "pro" | "blues_pack" | "fingerstyle_pack";

type CheckoutPreviewRequest = {
  schemaVersion?: number;
  offerId?: CheckoutPreviewOfferId;
};

export type CheckoutPreviewResponse = {
  schemaVersion: 1;
  offerId: CheckoutPreviewOfferId;
  provider: "stripe_checkout";
  billingMode: "subscription" | "one_time";
  status: "preview_only";
  summary: string;
  checkoutPath: string;
};

const CHECKOUT_PREVIEW_OFFERS: Record<CheckoutPreviewOfferId, CheckoutPreviewResponse> = {
  pro: {
    schemaVersion: 1,
    offerId: "pro",
    provider: "stripe_checkout",
    billingMode: "subscription",
    status: "preview_only",
    summary: "Pro monthly is the first planned Stripe Checkout path for full catalog access and cloud continuity.",
    checkoutPath: "/checkout/pro-monthly",
  },
  blues_pack: {
    schemaVersion: 1,
    offerId: "blues_pack",
    provider: "stripe_checkout",
    billingMode: "one_time",
    status: "preview_only",
    summary: "Blues Turnarounds Pack is the first one-off purchase preview path for players who do not need full Pro.",
    checkoutPath: "/checkout/packs/blues-turnarounds",
  },
  fingerstyle_pack: {
    schemaVersion: 1,
    offerId: "fingerstyle_pack",
    provider: "stripe_checkout",
    billingMode: "one_time",
    status: "preview_only",
    summary: "Fingerstyle Studies Pack is the one-off technique-pack preview path for targeted purchases.",
    checkoutPath: "/checkout/packs/fingerstyle-studies",
  },
};

function isCheckoutPreviewOfferId(value: unknown): value is CheckoutPreviewOfferId {
  return value === "pro" || value === "blues_pack" || value === "fingerstyle_pack";
}

export function buildCheckoutPreviewPayload(payload: unknown): CheckoutPreviewResponse | null {
  if (payload == null || typeof payload !== "object") return null;
  const request = payload as CheckoutPreviewRequest;
  if (request.schemaVersion !== 1 || !isCheckoutPreviewOfferId(request.offerId)) {
    return null;
  }
  return CHECKOUT_PREVIEW_OFFERS[request.offerId];
}
