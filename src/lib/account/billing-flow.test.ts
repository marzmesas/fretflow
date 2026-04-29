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
        accountId: "acct_123",
        email: "player@example.com",
        accountLabel: "Mario",
      },
      fetchImpl,
    );

    expect(response.status).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/billing/checkout-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 1,
          offerId: "pro",
          accountId: "acct_123",
          email: "player@example.com",
          accountLabel: "Mario",
        }),
      }),
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
        reason: "missing_account",
        summary: "Billing recovery requires a signed-in account.",
        detail: "Sign in with your email account before opening billing recovery so the server can link the right Stripe customer.",
        offerId: null,
        billingMode: null,
      }),
    })) as unknown as typeof fetch;

    const response = await requestBillingPortalSession(
      {
        apiBaseUrl: "http://127.0.0.1:8787",
        lifecycleStatus: "past_due",
        accountId: "acct_123",
        email: "player@example.com",
      },
      fetchImpl,
    );

    expect(response.status).toBe("blocked");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/billing/recovery-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 1,
          lifecycleStatus: "past_due",
          accountId: "acct_123",
          email: "player@example.com",
        }),
      }),
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
          accountId: "acct_123",
          email: "player@example.com",
        },
        fetchImpl,
      ),
    ).rejects.toThrow("invalid payload");
  });
});
