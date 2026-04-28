import { describe, expect, it, vi } from "vitest";
import {
  requestBillingPortalSession,
  requestCheckoutSession,
} from "./billing-flow";

describe("billing-flow", () => {
  it("requests a checkout session and validates the ready payload", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        kind: "checkout",
        status: "ready",
        provider: "stripe",
        summary: "Launch Stripe Checkout for Pro monthly.",
        launchUrl: "https://checkout.stripe.com/pay/cs_test_123",
        offerId: "pro",
        billingMode: "subscription",
      }),
    })) as unknown as typeof fetch;

    const response = await requestCheckoutSession(
      {
        apiBaseUrl: "http://127.0.0.1:8787/",
        offerId: "pro",
        accountLabel: "Mario",
      },
      fetchImpl,
    );

    expect(response.status).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/billing/checkout-session",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requests a billing portal session and validates the blocked payload", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        kind: "billing_portal",
        status: "blocked",
        provider: "stripe",
        reason: "missing_customer",
        summary: "Billing recovery is configured, but no Stripe customer is linked yet.",
        detail: "Set MOCK_STRIPE_CUSTOMER_ID or real auth-backed customer mapping.",
        offerId: null,
        billingMode: null,
      }),
    })) as unknown as typeof fetch;

    const response = await requestBillingPortalSession(
      {
        apiBaseUrl: "http://127.0.0.1:8787",
        lifecycleStatus: "past_due",
      },
      fetchImpl,
    );

    expect(response.status).toBe("blocked");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/billing/recovery-session",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects invalid billing action payloads", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        kind: "checkout",
        status: "ready",
      }),
    })) as unknown as typeof fetch;

    await expect(
      requestCheckoutSession(
        {
          apiBaseUrl: "http://127.0.0.1:8787",
          offerId: "pro",
        },
        fetchImpl,
      ),
    ).rejects.toThrow("invalid payload");
  });
});
