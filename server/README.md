# Fretflow API (Phase 5 scaffold)

Minimal service for local development: subscription JSON for the desktop app, optional Stripe webhooks.

```bash
cd server
npm ci
cp .env.example .env
npm run dev
```

- Health: `GET http://127.0.0.1:8787/health`
- Subscription (used by the app’s **Sync subscription**): `GET /api/v1/subscription`
- Stripe: `POST /api/stripe/webhook` (raw body). Set `STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY` to verify signatures; otherwise the handler logs and returns `{ received: true, verified: false }` for local testing.

Set `MOCK_SUBSCRIPTION_STATUS=active` to simulate a paid plan while the real billing integration is built.
