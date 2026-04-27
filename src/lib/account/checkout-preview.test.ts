import { describe, expect, it, vi } from "vitest";
import { requestCheckoutPreview } from "./checkout-preview";

describe("checkout-preview", () => {
  it("posts the selected offer and returns the validated response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        offerId: "pro",
        provider: "stripe_checkout",
        billingMode: "subscription",
        status: "preview_only",
        summary: "Pro monthly would open Stripe Checkout once billing goes live.",
        checkoutPath: "/checkout/pro",
      }),
    })) as unknown as typeof fetch;

    const response = await requestCheckoutPreview(
      {
        apiBaseUrl: "http://127.0.0.1:8787/",
        offerId: "pro",
      },
      fetchImpl,
    );

    expect(response.offerId).toBe("pro");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/billing/checkout-preview",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("throws when the service returns an invalid payload", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        offerId: "pro",
      }),
    })) as unknown as typeof fetch;

    await expect(
      requestCheckoutPreview(
        {
          apiBaseUrl: "http://127.0.0.1:8787",
          offerId: "pro",
        },
        fetchImpl,
      ),
    ).rejects.toThrow("invalid payload");
  });
});
