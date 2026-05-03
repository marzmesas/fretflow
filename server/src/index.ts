/**
 * Phase 5 scaffold: health, subscription stub for the desktop app to sync against,
 * and Stripe webhook endpoint (verified when STRIPE_WEBHOOK_SECRET is set).
 */
import cors from "cors";
import express from "express";
import Stripe from "stripe";
import { isAnalyticsBatchV1 } from "./analytics.js";
import { buildAuthSignInPayload } from "./auth.js";
import {
  createBillingPortalPayload,
  createCheckoutSessionPayload,
} from "./billing.js";
import { buildMockCatalogPayload } from "./catalog.js";
import {
  buildPreviewUserProfilePayload,
  getCurrentUserProfilePayload,
  saveUserProfilePayload,
} from "./profile.js";
import {
  getCurrentRemoteLibraryState,
  saveRemoteLibraryState,
} from "./library-state.js";
import {
  getCurrentRemoteProgressState,
  saveRemoteProgressState,
} from "./progress-state.js";

const PORT = Number(process.env.PORT) || 8787;
const MOCK_SUBSCRIPTION_STATUS = (process.env.MOCK_SUBSCRIPTION_STATUS ?? "none").toLowerCase();
const MOCK_VALID_UNTIL_DAYS = Number(process.env.MOCK_VALID_UNTIL_DAYS ?? "0");
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

const app = express();

app.use(cors({ origin: true }));
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "fretflow-server", version: "0.1.0" });
});

/** Desktop app sync target — replace with DB-backed logic later. */
app.get("/api/v1/subscription", (_req, res) => {
  const allowed = new Set(["active", "trialing", "past_due", "canceling", "canceled", "none"]);
  const status = allowed.has(MOCK_SUBSCRIPTION_STATUS) ? MOCK_SUBSCRIPTION_STATUS : "none";
  const tier =
    process.env.MOCK_TIER && process.env.MOCK_TIER.trim() !== "" ? process.env.MOCK_TIER : null;
  const validUntilUnixMs =
    Number.isFinite(MOCK_VALID_UNTIL_DAYS) && MOCK_VALID_UNTIL_DAYS !== 0
      ? Date.now() + MOCK_VALID_UNTIL_DAYS * 86_400_000
      : null;
  res.json({
    schemaVersion: 1,
    status,
    tier,
    validUntilUnixMs,
  });
});

/** Metadata-only catalog seed for frontend migration away from hardcoded catalog access. */
app.get("/api/v1/catalog", (_req, res) => {
  res.json(buildMockCatalogPayload());
});

app.get("/api/v1/profile", (req, res) => {
  const payload = getCurrentUserProfilePayload({
    accountId: typeof req.query.accountId === "string" ? req.query.accountId : undefined,
    email: typeof req.query.email === "string" ? req.query.email : undefined,
  });
  if (payload == null) {
    return res.status(400).json({ error: "Invalid remote profile identity" });
  }
  return res.json(payload);
});

app.post("/api/v1/auth/sign-in", express.json({ limit: "32kb" }), (req, res) => {
  const payload = buildAuthSignInPayload(req.body);
  if (payload == null) {
    return res.status(400).json({ error: "Invalid auth sign-in payload" });
  }
  return res.json(payload);
});

app.post("/api/v1/profile/seed-preview", express.json({ limit: "32kb" }), (req, res) => {
  const payload = buildPreviewUserProfilePayload(req.body);
  if (payload == null) {
    return res.status(400).json({ error: "Invalid remote profile seed payload" });
  }
  return res.json(payload);
});

app.put("/api/v1/profile", express.json({ limit: "32kb" }), (req, res) => {
  const payload = saveUserProfilePayload(req.body);
  if (payload == null) {
    return res.status(400).json({ error: "Invalid remote profile payload" });
  }
  return res.json(payload);
});

app.get("/api/v1/library-state", (req, res) => {
  const payload = getCurrentRemoteLibraryState({
    accountId: typeof req.query.accountId === "string" ? req.query.accountId : undefined,
    email: typeof req.query.email === "string" ? req.query.email : undefined,
  });
  if (payload == null) {
    return res.status(400).json({ error: "Invalid remote library identity" });
  }
  return res.json(payload);
});

app.put("/api/v1/library-state", express.json({ limit: "64kb" }), (req, res) => {
  const payload = saveRemoteLibraryState(req.body);
  if (payload == null) {
    return res.status(400).json({ error: "Invalid remote library payload" });
  }
  if (payload.status === "conflict") {
    return res.status(409).json(payload.currentState);
  }
  return res.json(payload.state);
});

app.get("/api/v1/progress-state", (req, res) => {
  const payload = getCurrentRemoteProgressState({
    accountId: typeof req.query.accountId === "string" ? req.query.accountId : undefined,
    email: typeof req.query.email === "string" ? req.query.email : undefined,
  });
  if (payload == null) {
    return res.status(400).json({ error: "Invalid remote progress identity" });
  }
  return res.json(payload);
});

app.put("/api/v1/progress-state", express.json({ limit: "256kb" }), (req, res) => {
  const payload = saveRemoteProgressState(req.body);
  if (payload == null) {
    return res.status(400).json({ error: "Invalid remote progress payload" });
  }
  if (payload.status === "conflict") {
    return res.status(409).json(payload.currentState);
  }
  return res.json(payload.state);
});

app.post("/api/v1/analytics/batch", express.json({ limit: "256kb" }), (req, res) => {
  if (!isAnalyticsBatchV1(req.body)) {
    return res.status(400).json({ error: "Invalid analytics batch payload" });
  }
  console.info(
    "[fretflow-server] analytics batch:",
    req.body.batchId,
    `events=${req.body.events.length}`,
  );
  return res.json({
    schemaVersion: 1,
    received: true,
    batchId: req.body.batchId,
    acceptedEvents: req.body.events.length,
  });
});

app.post("/api/v1/billing/checkout-session", express.json({ limit: "32kb" }), async (req, res) => {
  try {
    const payload = await createCheckoutSessionPayload(req.body, stripe);
    return res.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: `Checkout session failed: ${message}` });
  }
});

app.post("/api/v1/billing/recovery-session", express.json({ limit: "32kb" }), async (req, res) => {
  try {
    const payload = await createBillingPortalPayload(req.body, stripe);
    return res.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: `Billing recovery failed: ${message}` });
  }
});

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn("[fretflow-server] STRIPE_WEBHOOK_SECRET unset — webhook not verified (dev only)");
      try {
        const parsed = JSON.parse(req.body.toString());
        console.info("[fretflow-server] stripe webhook (unsigned dev):", parsed?.type ?? "?");
      } catch {
        console.info("[fretflow-server] stripe webhook (unsigned dev): non-json body");
      }
      return res.json({ received: true, verified: false });
    }
    if (!stripe) {
      return res.status(503).json({ error: "STRIPE_SECRET_KEY required for verified webhooks" });
    }
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
      return res.status(400).json({ error: "Missing stripe-signature" });
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[fretflow-server] webhook signature failed:", msg);
      return res.status(400).json({ error: "Invalid signature" });
    }
    console.info("[fretflow-server] stripe event:", event.type, event.id);
    // TODO: update subscription state in DB, notify clients, etc.
    return res.json({ received: true, verified: true, type: event.type });
  },
);

app.listen(PORT, () => {
  console.info(`[fretflow-server] listening on http://127.0.0.1:${PORT}`);
});
