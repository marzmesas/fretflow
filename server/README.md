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
- Email sign-in scaffold: `POST /api/v1/auth/sign-in`
- Catalog seed: `GET /api/v1/catalog`
- Profile seed: `GET /api/v1/profile`
- Profile seed preview: `POST /api/v1/profile/seed-preview`
- Profile write scaffold: `PUT /api/v1/profile`
- Library cloud state: `GET /api/v1/library-state`
- Library cloud state write: `PUT /api/v1/library-state`
- Analytics batch intake: `POST /api/v1/analytics/batch`
- Stripe Checkout session scaffold: `POST /api/v1/billing/checkout-session`
- Stripe Billing Portal / recovery scaffold: `POST /api/v1/billing/recovery-session`
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

`GET /api/v1/profile` is the first non-billing profile scaffold:

- requires `accountId` and `email` query params from the signed-in desktop session
- display name
- onboarding practice goal
- seeded path / first chart recommendation
- daily goal target
- returns the signed-in account's stored profile when present, otherwise an account-seeded default

`POST /api/v1/profile/seed-preview` stops the Account preview from depending on a static mock profile:

- accepts the current local profile seed from the desktop app
- validates the payload shape
- echoes a normalized preview response marked as `frontend_preview`
- keeps this as a non-persistent preview step, not a real profile write

`PUT /api/v1/profile` is the first profile-write scaffold:

- accepts the signed-in account identity plus the first-wave remote profile fields
- accepts the same first-wave remote profile fields
- validates the payload shape
- stores the payload in the signed-in account record under `server/.data/accounts.json`
- returns the normalized saved payload marked as `backend_persisted`

`GET /api/v1/library-state` and `PUT /api/v1/library-state` are the first account-backed library sync scaffold:

- require `accountId` and `email` from the signed-in desktop session
- read and write favorites plus named collections
- keep imported charts, presets, and saved loops on-device for now

Set `MOCK_SUBSCRIPTION_STATUS=active` to simulate a paid plan while the real billing integration is built.
Use `MOCK_VALID_UNTIL_DAYS=14` to preview trial ends, renewals, or cancellation windows in the desktop UI.
Set `MOCK_PREMIUM_PLAYABLE=true` to let the remote catalog advertise playable premium rows for entitlement testing.
Set the `STRIPE_PRICE_*`, `STRIPE_CHECKOUT_*`, and `STRIPE_BILLING_PORTAL_RETURN_URL` env vars to enable real Stripe Checkout and Billing Portal launches from the desktop Account page.

The server now persists signed-in dev accounts and their linked Stripe customer ids in `server/.data/accounts.json` so billing identity survives local server restarts.
