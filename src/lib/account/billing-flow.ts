import type { CatalogPremiumAccessId } from "../catalog/types";

export type BillingOfferId = Extract<CatalogPremiumAccessId, "pro" | "blues_pack" | "fingerstyle_pack">;
export type BillingActionKind = "checkout" | "billing_portal";
export type BillingProvider = "stripe";
export type BillingMode = "subscription" | "one_time";
export type BillingBlockedReason =
  | "missing_service_url"
  | "missing_account"
  | "missing_stripe_secret"
  | "missing_price_id"
  | "missing_checkout_urls"
  | "missing_portal_return_url"
  | "session_missing_url";

export type BillingLaunchReady = {
  schemaVersion: 1;
  kind: BillingActionKind;
  status: "ready";
  provider: BillingProvider;
  summary: string;
  launchUrl: string;
  offerId: BillingOfferId | null;
  billingMode: BillingMode | null;
};

export type BillingLaunchBlocked = {
  schemaVersion: 1;
  kind: BillingActionKind;
  status: "blocked";
  reason: BillingBlockedReason;
  summary: string;
  detail: string;
  offerId: BillingOfferId | null;
  billingMode: BillingMode | null;
};

export type BillingLaunchResponse = BillingLaunchReady | BillingLaunchBlocked;

type CheckoutSessionRequest = {
  schemaVersion: 1;
  offerId: BillingOfferId;
  accountId: string | null;
  email: string | null;
  accountLabel: string | null;
};

type BillingPortalRequest = {
  schemaVersion: 1;
  lifecycleStatus: string;
  accountId: string | null;
  email: string | null;
};

function isBillingOfferId(value: unknown): value is BillingOfferId {
  return value === "pro" || value === "blues_pack" || value === "fingerstyle_pack";
}

function isBillingActionKind(value: unknown): value is BillingActionKind {
  return value === "checkout" || value === "billing_portal";
}

function isBillingProvider(value: unknown): value is BillingProvider {
  return value === "stripe";
}

function isBillingMode(value: unknown): value is BillingMode | null {
  return value === "subscription" || value === "one_time" || value == null;
}

function isBillingBlockedReason(value: unknown): value is BillingBlockedReason {
  return (
    value === "missing_account" ||
    value === "missing_service_url" ||
    value === "missing_stripe_secret" ||
    value === "missing_price_id" ||
    value === "missing_checkout_urls" ||
    value === "missing_portal_return_url" ||
    value === "session_missing_url"
  );
}

function isBillingLaunchResponse(value: unknown): value is BillingLaunchResponse {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    !isBillingActionKind(candidate.kind) ||
    typeof candidate.summary !== "string" ||
    !isBillingProvider(candidate.provider) ||
    !isBillingMode(candidate.billingMode) ||
    !(candidate.offerId == null || isBillingOfferId(candidate.offerId))
  ) {
    return false;
  }
  if (candidate.status === "ready") {
    return typeof candidate.launchUrl === "string";
  }
  if (candidate.status === "blocked") {
    return typeof candidate.detail === "string" && isBillingBlockedReason(candidate.reason);
  }
  return false;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  const normalized = apiBaseUrl.trim().replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("Billing actions require a service URL.");
  }
  return normalized;
}

async function postBillingAction<TPayload extends Record<string, unknown>>(
  apiBaseUrl: string,
  endpoint: string,
  payload: TPayload,
  fetchImpl: typeof fetch,
): Promise<BillingLaunchResponse> {
  const response = await fetchImpl(`${normalizeApiBaseUrl(apiBaseUrl)}${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`billing action failed: ${response.status}`);
  }
  const body = (await response.json()) as unknown;
  if (!isBillingLaunchResponse(body)) {
    throw new Error("billing action returned an invalid payload");
  }
  return body;
}

export async function requestCheckoutSession(
  input: {
    apiBaseUrl: string;
    offerId: BillingOfferId;
    accountId?: string | null;
    email?: string | null;
    accountLabel?: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<BillingLaunchResponse> {
  const payload: CheckoutSessionRequest = {
    schemaVersion: 1,
    offerId: input.offerId,
    accountId: input.accountId?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    accountLabel: input.accountLabel?.trim() || null,
  };
  return postBillingAction(input.apiBaseUrl, "/api/v1/billing/checkout-session", payload, fetchImpl);
}

export async function requestBillingPortalSession(
  input: {
    apiBaseUrl: string;
    lifecycleStatus: string;
    accountId?: string | null;
    email?: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<BillingLaunchResponse> {
  const payload: BillingPortalRequest = {
    schemaVersion: 1,
    lifecycleStatus: input.lifecycleStatus,
    accountId: input.accountId?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
  };
  return postBillingAction(input.apiBaseUrl, "/api/v1/billing/recovery-session", payload, fetchImpl);
}
