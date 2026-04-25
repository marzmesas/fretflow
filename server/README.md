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
- Catalog seed: `GET /api/v1/catalog`
- Analytics batch intake: `POST /api/v1/analytics/batch`
- Subscription (for `sync_subscription_now` when you wire it; no checkout in the product UI yet): `GET /api/v1/subscription`
- Stripe: `POST /api/stripe/webhook` (raw body). Set `STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY` to verify signatures; otherwise the handler logs and returns `{ received: true, verified: false }` for local testing.

`GET /api/v1/catalog` is intentionally narrow right now:

- metadata only for bundled/free rows plus premium preview rows
- no entitlement filtering
- no imported chart sync
- no practice asset delivery

`POST /api/v1/analytics/batch` is the first analytics delivery path:

- accepts the local `AnalyticsBatchV1` envelope from the desktop app
- validates the batch shape
- logs batch id and accepted event count
- returns an acknowledgement so the client can mark events as sent

Set `MOCK_SUBSCRIPTION_STATUS=active` to simulate a paid plan while the real billing integration is built.
