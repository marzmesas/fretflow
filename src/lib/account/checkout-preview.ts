import type { CatalogPremiumAccessId } from "../catalog/types";

export type CheckoutPreviewOfferId = Extract<CatalogPremiumAccessId, "pro" | "blues_pack" | "fingerstyle_pack">;

export type CheckoutPreviewResponse = {
  schemaVersion: 1;
  offerId: CheckoutPreviewOfferId;
  provider: "stripe_checkout";
  billingMode: "subscription" | "one_time";
  status: "preview_only";
  summary: string;
  checkoutPath: string;
};

type CheckoutPreviewInput = {
  apiBaseUrl: string;
  offerId: CheckoutPreviewOfferId;
};

function isCheckoutPreviewOfferId(value: unknown): value is CheckoutPreviewOfferId {
  return value === "pro" || value === "blues_pack" || value === "fingerstyle_pack";
}

function isCheckoutPreviewResponse(value: unknown): value is CheckoutPreviewResponse {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Partial<CheckoutPreviewResponse>;
  return (
    candidate.schemaVersion === 1 &&
    isCheckoutPreviewOfferId(candidate.offerId) &&
    candidate.provider === "stripe_checkout" &&
    (candidate.billingMode === "subscription" || candidate.billingMode === "one_time") &&
    candidate.status === "preview_only" &&
    typeof candidate.summary === "string" &&
    typeof candidate.checkoutPath === "string"
  );
}

export async function requestCheckoutPreview(
  input: CheckoutPreviewInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutPreviewResponse> {
  const apiBaseUrl = input.apiBaseUrl.trim().replace(/\/+$/, "");
  if (apiBaseUrl === "") {
    throw new Error("Checkout preview requires a service URL.");
  }
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/billing/checkout-preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      schemaVersion: 1,
      offerId: input.offerId,
    }),
  });
  if (!response.ok) {
    throw new Error(`checkout preview failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isCheckoutPreviewResponse(payload)) {
    throw new Error("checkout preview returned an invalid payload");
  }
  return payload;
}
