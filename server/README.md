# Fretflow API (Phase 5 scaffold)

**Optional infra:** the desktop app’s core loop (practice, charts, session) does not require this server. Use it only when exercising subscription sync or webhooks locally.

Minimal service for local development: subscription JSON for the desktop app, optional Stripe webhooks.

```bash
cd server
npm ci
cp .env.example .env
npm run dev
```

- Health: `GET http://127.0.0.1:8787/health`
- Subscription (for `sync_subscription_now` when you wire it; no checkout in the product UI yet): `GET /api/v1/subscription`
- Stripe: `POST /api/stripe/webhook` (raw body). Set `STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY` to verify signatures; otherwise the handler logs and returns `{ received: true, verified: false }` for local testing.

Set `MOCK_SUBSCRIPTION_STATUS=active` to simulate a paid plan while the real billing integration is built.
