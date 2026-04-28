import Stripe from "stripe";

type BillingOfferId = "pro" | "blues_pack" | "fingerstyle_pack";
type BillingActionKind = "checkout" | "billing_portal";
type BillingMode = "subscription" | "one_time";
type BillingBlockedReason =
  | "missing_stripe_secret"
  | "missing_price_id"
  | "missing_checkout_urls"
  | "missing_customer"
  | "missing_portal_return_url"
  | "session_missing_url";

type CheckoutSessionRequest = {
  schemaVersion?: number;
  offerId?: BillingOfferId;
  accountLabel?: string | null;
};

type BillingPortalRequest = {
  schemaVersion?: number;
  lifecycleStatus?: string;
};

export type BillingLaunchResponse =
  | {
      schemaVersion: 1;
      kind: BillingActionKind;
      status: "ready";
      provider: "stripe";
      summary: string;
      launchUrl: string;
      offerId: BillingOfferId | null;
      billingMode: BillingMode | null;
    }
  | {
      schemaVersion: 1;
      kind: BillingActionKind;
      status: "blocked";
      provider: "stripe";
      reason: BillingBlockedReason;
      summary: string;
      detail: string;
      offerId: BillingOfferId | null;
      billingMode: BillingMode | null;
    };

type CheckoutOfferConfig = {
  offerId: BillingOfferId;
  billingMode: BillingMode;
  priceEnvKey: string;
  summary: string;
};

const CHECKOUT_OFFERS: Record<BillingOfferId, CheckoutOfferConfig> = {
  pro: {
    offerId: "pro",
    billingMode: "subscription",
    priceEnvKey: "STRIPE_PRICE_PRO_MONTHLY",
    summary: "Launch Stripe Checkout for Pro monthly.",
  },
  blues_pack: {
    offerId: "blues_pack",
    billingMode: "one_time",
    priceEnvKey: "STRIPE_PRICE_BLUES_PACK",
    summary: "Launch Stripe Checkout for the Blues Turnarounds Pack.",
  },
  fingerstyle_pack: {
    offerId: "fingerstyle_pack",
    billingMode: "one_time",
    priceEnvKey: "STRIPE_PRICE_FINGERSTYLE_PACK",
    summary: "Launch Stripe Checkout for the Fingerstyle Studies Pack.",
  },
};

function blockedResponse(
  kind: BillingActionKind,
  reason: BillingBlockedReason,
  summary: string,
  detail: string,
  offerId: BillingOfferId | null,
  billingMode: BillingMode | null,
): BillingLaunchResponse {
  return {
    schemaVersion: 1,
    kind,
    status: "blocked",
    provider: "stripe",
    reason,
    summary,
    detail,
    offerId,
    billingMode,
  };
}

function readyResponse(
  kind: BillingActionKind,
  summary: string,
  launchUrl: string,
  offerId: BillingOfferId | null,
  billingMode: BillingMode | null,
): BillingLaunchResponse {
  return {
    schemaVersion: 1,
    kind,
    status: "ready",
    provider: "stripe",
    summary,
    launchUrl,
    offerId,
    billingMode,
  };
}

function isBillingOfferId(value: unknown): value is BillingOfferId {
  return value === "pro" || value === "blues_pack" || value === "fingerstyle_pack";
}

function getOfferConfig(offerId: BillingOfferId): CheckoutOfferConfig {
  return CHECKOUT_OFFERS[offerId];
}

function normalizeUrlEnv(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function checkoutUrls(): { successUrl: string; cancelUrl: string } | null {
  const successUrl = normalizeUrlEnv("STRIPE_CHECKOUT_SUCCESS_URL");
  const cancelUrl = normalizeUrlEnv("STRIPE_CHECKOUT_CANCEL_URL");
  if (successUrl === "" || cancelUrl === "") return null;
  return { successUrl, cancelUrl };
}

function accountLabelMetadata(accountLabel: string | null | undefined): string {
  const normalized = accountLabel?.trim();
  return normalized && normalized.length > 0 ? normalized : "Player";
}

export async function createCheckoutSessionPayload(
  payload: unknown,
  stripe: Stripe | null,
): Promise<BillingLaunchResponse> {
  if (payload == null || typeof payload !== "object") {
    return blockedResponse(
      "checkout",
      "missing_price_id",
      "Checkout request is invalid.",
      "The checkout payload must include a supported offer id.",
      null,
      null,
    );
  }
  const request = payload as CheckoutSessionRequest;
  if (request.schemaVersion !== 1 || !isBillingOfferId(request.offerId)) {
    return blockedResponse(
      "checkout",
      "missing_price_id",
      "Checkout request is invalid.",
      "The checkout payload must include a supported offer id.",
      null,
      null,
    );
  }
  const offer = getOfferConfig(request.offerId);
  if (stripe == null) {
    return blockedResponse(
      "checkout",
      "missing_stripe_secret",
      "Stripe Checkout is not configured on this server yet.",
      "Set STRIPE_SECRET_KEY and the matching STRIPE_PRICE_* env vars to enable real checkout sessions.",
      offer.offerId,
      offer.billingMode,
    );
  }
  const priceId = normalizeUrlEnv(offer.priceEnvKey);
  if (priceId === "") {
    return blockedResponse(
      "checkout",
      "missing_price_id",
      `${offer.summary} is blocked until a Stripe price is configured.`,
      `Set ${offer.priceEnvKey} to the Stripe Price ID for this offer.`,
      offer.offerId,
      offer.billingMode,
    );
  }
  const urls = checkoutUrls();
  if (urls == null) {
    return blockedResponse(
      "checkout",
      "missing_checkout_urls",
      "Stripe Checkout needs success and cancel return URLs.",
      "Set STRIPE_CHECKOUT_SUCCESS_URL and STRIPE_CHECKOUT_CANCEL_URL before launching checkout.",
      offer.offerId,
      offer.billingMode,
    );
  }
  const session = await stripe.checkout.sessions.create({
    mode: offer.billingMode === "subscription" ? "subscription" : "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    metadata: {
      offerId: offer.offerId,
      accountLabel: accountLabelMetadata(request.accountLabel),
    },
  });
  if (!session.url) {
    return blockedResponse(
      "checkout",
      "session_missing_url",
      "Stripe created a session, but no launch URL was returned.",
      "Check the Stripe dashboard or API configuration for this checkout session.",
      offer.offerId,
      offer.billingMode,
    );
  }
  return readyResponse("checkout", offer.summary, session.url, offer.offerId, offer.billingMode);
}

export async function createBillingPortalPayload(
  payload: unknown,
  stripe: Stripe | null,
): Promise<BillingLaunchResponse> {
  const request = payload as BillingPortalRequest | null;
  const lifecycleStatus = request?.lifecycleStatus?.trim() || "unknown";
  if (stripe == null) {
    return blockedResponse(
      "billing_portal",
      "missing_stripe_secret",
      "Billing recovery is not configured on this server yet.",
      "Set STRIPE_SECRET_KEY and a Stripe customer mapping before opening the billing portal.",
      null,
      null,
    );
  }
  const customerId = normalizeUrlEnv("MOCK_STRIPE_CUSTOMER_ID");
  if (customerId === "") {
    return blockedResponse(
      "billing_portal",
      "missing_customer",
      "Billing recovery is configured, but no Stripe customer is linked yet.",
      "Set MOCK_STRIPE_CUSTOMER_ID until real auth/customer mapping is in place.",
      null,
      null,
    );
  }
  const returnUrl = normalizeUrlEnv("STRIPE_BILLING_PORTAL_RETURN_URL");
  if (returnUrl === "") {
    return blockedResponse(
      "billing_portal",
      "missing_portal_return_url",
      "Billing portal requires a return URL.",
      "Set STRIPE_BILLING_PORTAL_RETURN_URL before opening billing recovery.",
      null,
      null,
    );
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  if (!session.url) {
    return blockedResponse(
      "billing_portal",
      "session_missing_url",
      "Stripe created a billing portal session, but no launch URL was returned.",
      "Check the Stripe customer portal configuration for this workspace.",
      null,
      null,
    );
  }
  return readyResponse(
    "billing_portal",
    `Open Stripe Billing Portal for the current ${lifecycleStatus} state.`,
    session.url,
    null,
    null,
  );
}
